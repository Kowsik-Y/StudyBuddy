"""
Video Q&A routes
  POST /video/transcript   — YouTube URL → download audio → STT → return transcript + session_id
  POST /video/upload       — Upload video/audio file → STT → return transcript + session_id
  POST /video/ask          — session_id + question → LLM (transcript as context) → answer
  GET  /video/session/{id} — Retrieve session transcript & title
"""

from __future__ import annotations

import os
import uuid
import asyncio
import tempfile
import subprocess
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import client, MODEL, logger
from stt.sst import transcribe_from_path, convert_to_wav
from text_to_speech.tts import to_bytes as tts_to_bytes

router = APIRouter(prefix="/video", tags=["video-qa"])

# ── In-memory session store ────────────────────────────────────────────────────
# { session_id: { "title": str, "transcript": str, "messages": [...] } }
_sessions: dict[str, dict] = {}


# ── Pydantic models ────────────────────────────────────────────────────────────

class YoutubeRequest(BaseModel):
    url: str
    language: str = "en"


class AskRequest(BaseModel):
    session_id: str
    question: str
    tts: bool = True   # set False to skip audio generation


# ── Helpers ────────────────────────────────────────────────────────────────────

def _download_youtube_audio(url: str, out_path: str) -> str:
    """Use yt-dlp to download best audio from a YouTube URL.

    We deliberately do NOT ask yt-dlp to convert to wav (that needs ffmpeg
    post-processing inside yt-dlp and can fail on some platforms). Instead we
    download in whatever native format the site provides (m4a / opus / webm …)
    and let convert_to_wav() do the ffmpeg step afterwards.

    out_path should be a path without an extension, e.g. /tmp/xyz/audio.
    yt-dlp will append the real extension; we glob for the result.
    """
    import glob

    template = out_path + ".%(ext)s"
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-x",                                         # extract audio track only
        # android client: exposes combined mp4 formats (id 18) that work without
        # PO tokens.  SABR / ios / web-only formats are all broken without tokens.
        "--extractor-args", "youtube:player_client=android",
        # Prefer audio-only; fall back to smallest combined mp4 so ffmpeg can
        # extract the audio track.  Format 18 = 360p avc+aac mp4, always present.
        "-f", "bestaudio[ext=m4a]/bestaudio/18/best",
        "-o", template,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    # Find the downloaded file regardless of exit code — yt-dlp may exit 1
    # while still writing a valid file (e.g. format warnings, SSL warnings).
    matches = glob.glob(out_path + ".*")
    if matches:
        return matches[0]

    # Only raise if we genuinely got nothing
    raise RuntimeError(
        f"yt-dlp failed (exit {result.returncode}): {result.stderr[-600:]}"
    )


def _get_youtube_title(url: str) -> str:
    """Fetch video title without downloading media."""
    try:
        result = subprocess.run(
            ["yt-dlp", "--get-title", "--no-playlist", url],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout.strip() or "YouTube Video"
    except Exception:
        return "YouTube Video"


def _llm_answer(transcript: str, history: list[dict], question: str) -> str:
    """Ask the LLM a question grounded in the video transcript."""
    system_msg = {
        "role": "system",
        "content": (
            "You are a helpful study assistant. The user is watching a video and wants to "
            "clarify doubts. The full transcript of the video is provided below.\n\n"
            f"=== VIDEO TRANSCRIPT ===\n{transcript}\n=== END TRANSCRIPT ===\n\n"
            "Answer the user's questions based on the transcript. If the answer is not in "
            "the transcript, say so and provide your best general knowledge answer. "
            "Keep answers clear and helpful."
        ),
    }
    messages = [system_msg] + history + [{"role": "user", "content": question}]
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )
    return response.choices[0].message.content.strip()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/transcript")
async def youtube_transcript(req: YoutubeRequest):
    """Download a YouTube video, transcribe it, store it in a session."""
    session_id = str(uuid.uuid4())
    tmp_dir = tempfile.mkdtemp()
    out_base = os.path.join(tmp_dir, "audio")

    try:
        title = await asyncio.get_event_loop().run_in_executor(
            None, _get_youtube_title, req.url
        )
        logger.info(f"[video_qa] Downloading: {req.url!r} → {title!r}")

        downloaded = await asyncio.get_event_loop().run_in_executor(
            None, _download_youtube_audio, req.url, out_base
        )
        logger.info(f"[video_qa] downloaded file: {downloaded}")

        # Always convert to 16-kHz mono WAV for Whisper
        converted = os.path.join(tmp_dir, "audio_16k.wav")
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, convert_to_wav, downloaded, converted
            )
            final_wav = converted
        except Exception as conv_err:
            logger.warning(f"[video_qa] convert_to_wav failed ({conv_err}), using raw file")
            final_wav = downloaded

        transcript = await asyncio.get_event_loop().run_in_executor(
            None, transcribe_from_path, final_wav, req.language
        )
        logger.info(f"[video_qa] session={session_id} transcript length={len(transcript)}")

        _sessions[session_id] = {
            "title": title,
            "transcript": transcript,
            "url": req.url,
            "messages": [],
        }

        return {
            "session_id": session_id,
            "title": title,
            "transcript": transcript,
        }

    except Exception as exc:
        logger.error(f"[video_qa] youtube_transcript error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        # cleanup temp files
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    language: str = "en",
):
    """Accept an uploaded video or audio file, transcribe it."""
    session_id = str(uuid.uuid4())
    suffix = os.path.splitext(file.filename or "upload")[1] or ".mp4"
    tmp_in = None
    tmp_wav = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(await file.read())
            tmp_in = f.name

        tmp_wav = tmp_in.replace(suffix, "_16k.wav")
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, convert_to_wav, tmp_in, tmp_wav
            )
            final_wav = tmp_wav
        except Exception:
            final_wav = tmp_in

        transcript = await asyncio.get_event_loop().run_in_executor(
            None, transcribe_from_path, final_wav, language
        )
        title = file.filename or "Uploaded Video"
        logger.info(f"[video_qa] upload session={session_id} len={len(transcript)}")

        _sessions[session_id] = {
            "title": title,
            "transcript": transcript,
            "url": None,
            "messages": [],
        }

        return {
            "session_id": session_id,
            "title": title,
            "transcript": transcript,
        }

    except Exception as exc:
        logger.error(f"[video_qa] upload error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        for p in (tmp_in, tmp_wav):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


@router.post("/ask")
async def ask_question(req: AskRequest):
    """Answer a user question grounded in the video transcript."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please transcribe a video first.")

    transcript = session["transcript"]
    history = session["messages"]

    answer = await asyncio.get_event_loop().run_in_executor(
        None, _llm_answer, transcript, history, req.question
    )

    # Generate TTS audio (MP3 bytes → base64) for the frontend player
    audio_b64: str | None = None
    if req.tts and answer:
        try:
            mp3 = await tts_to_bytes(answer, "en-US-AriaNeural")
            import base64 as _b64
            audio_b64 = _b64.b64encode(mp3).decode()
        except Exception as tts_err:
            logger.warning(f"[video_qa] TTS failed: {tts_err}")

    # Persist conversation history
    session["messages"].append({"role": "user", "content": req.question})
    session["messages"].append({"role": "assistant", "content": answer})

    return {
        "question": req.question,
        "answer": answer,
        "audio": audio_b64,
        "session_id": req.session_id,
    }


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Retrieve session metadata (title + transcript snippet)."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "title": session["title"],
        "transcript": session["transcript"],
        "url": session.get("url"),
        "message_count": len(session["messages"]) // 2,
    }


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Clear session data."""
    _sessions.pop(session_id, None)
    return {"status": "cleared"}
