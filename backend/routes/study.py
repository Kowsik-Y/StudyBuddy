"""
Structured study WebSocket — WS /ws/study
Modes: explain | viva | quiz

Heavy lifting lives in study_helpers.py:
  run_streaming_pipeline  — LLM stream → concurrent TTS → audio_chunk events
  handle_scoring          — WER + rubric scoring, latency events, DB inserts
"""

import os
import io
import base64
import wave
import tempfile
import asyncio
import uuid
import time as _time

import numpy as np
from fastapi import APIRouter, WebSocket

from config import client, MODEL, logger
from stt.sst import transcribe_from_path
from llm_response.llm_response import study_respond, clear_session_memory, init_session_memory_with_prompt
from text_to_speech.tts import to_bytes as tts_to_bytes
from analytics.db import insert_session, close_session, insert_chat_message
from helpers.study_helpers import run_streaming_pipeline, handle_scoring  # noqa: F401

router = APIRouter()

# ── VAD constants ─────────────────────────────────────────────────────────────
SAMPLE_RATE       = 16000
CHUNK_SAMPLES     = 1024
ENERGY_THRESHOLD  = 900   # int16 RMS — frontend adaptive gate keeps floor below this
SILENCE_DURATION  = 1.2   # seconds of silence → end of utterance (up from 0.8)
MIN_SPEECH_SECS   = 0.4   # minimum speech before processing (up from 0.2)
CHUNKS_PER_SEC    = SAMPLE_RATE / CHUNK_SAMPLES
SILENCE_CHUNKS    = int(SILENCE_DURATION * CHUNKS_PER_SEC)
MIN_SPEECH_CHUNKS = int(MIN_SPEECH_SECS * CHUNKS_PER_SEC)


@router.websocket("/ws/study")
async def study_endpoint(
    websocket: WebSocket,
    mode: str = "explain",
    language: str = "en",
    video_session_id: str = "",
):
    """
    Structured study pipeline with per-session memory, scoring, WER, and latency.
    Query params: ?mode=explain|viva|quiz  &language=en|ta  &video_session_id=<id>
    When video_session_id is provided the LLM is grounded in that video's transcript.
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())
    await insert_session(session_id, mode, language)

    # ── Ground LLM in video transcript if a video session was supplied ────────
    if video_session_id:
        try:
            from routes.video_qa import _sessions as _video_sessions
            video_data = _video_sessions.get(video_session_id)
            if video_data:
                title      = video_data.get("title", "Untitled Video")
                transcript = video_data.get("transcript", "")
                video_prompt = (
                    "You are an expert tutor helping a student understand a video they just watched. "
                    f'The video title is: "{title}"\n\n'
                    f"=== VIDEO TRANSCRIPT ===\n{transcript}\n=== END TRANSCRIPT ===\n\n"
                    "When the student speaks, explain and answer questions about the video content specifically. "
                    "Use examples and details from the transcript. "
                    "Keep responses concise and spoken-friendly (no markdown, no bullet points). "
                    'Always append the ideal short answer in: |||{"model_answer": "<answer>"}'
                )
                init_session_memory_with_prompt(session_id, video_prompt)
                logger.info(f"[study] session={session_id} grounded in video {video_session_id!r} ({title!r})")
            else:
                logger.warning(f"[study] video_session_id={video_session_id!r} not found — using default prompt")
        except Exception as e:
            logger.warning(f"[study] failed to load video session: {e}")

    TTS_VOICE = "ta-IN-PallaviNeural" if language == "ta" else "en-US-AriaNeural"
    STT_LANG  = "ta" if language == "ta" else "en"

    speech_buf: list  = []
    is_speaking       = False
    silence_count     = 0
    speech_count      = 0
    is_assistant_busy = False
    turn_counter      = 0
    last_question      = ""
    last_model_answer  = ""
    last_correct_option = ""
    topic             = ""

    async def send(msg: dict):
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    # ── Viva: send opening question immediately ───────────────────────────────
    if mode == "viva":
        is_assistant_busy = True
        await send({"type": "status", "text": "thinking"})
        result = await asyncio.get_event_loop().run_in_executor(
            None, study_respond,
            "Start the viva. Ask your first question.",
            session_id, mode, language, client, MODEL,
        )
        turn_counter     += 1
        last_question     = result["reply"]
        last_model_answer = result["model_answer"]
        last_correct_option = result.get("correct_option") or ""
        mp3 = await tts_to_bytes(result["reply"], TTS_VOICE)
        await send({
            "type": "question", "text": result["reply"],
            "audio": base64.b64encode(mp3).decode(),
            "turn": turn_counter,
        })
        await insert_chat_message(session_id, turn_counter, "assistant", result["reply"])
        is_assistant_busy = False

    # ── Quiz: send opening question immediately (streaming) ───────────────────
    if mode == "quiz":
        is_assistant_busy = True
        full_reply, final_meta, _llm_ms, _tts_ms = await run_streaming_pipeline(
            send,
            "Start the quiz. Ask your first multiple-choice question with 4 options A B C D.",
            session_id, mode, language, TTS_VOICE, turn_counter,
        )
        turn_counter     += 1
        last_question     = full_reply
        last_model_answer = final_meta["model_answer"]
        last_correct_option = final_meta.get("correct_option") or ""
        await send({
            "type":  "response",
            "text":  full_reply,
            "final": "false",
            "turn":  str(turn_counter),
        })
        await insert_chat_message(session_id, turn_counter, "assistant", full_reply)
        is_assistant_busy = False

    await send({"type": "status", "text": "listening"})
    await send({"type": "session_id", "text": session_id})

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_bytes(), timeout=30.0)
            except asyncio.TimeoutError:
                continue

            if is_assistant_busy:
                continue

            chunk = np.frombuffer(raw, dtype=np.int16)
            rms   = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))

            if not is_speaking:
                if rms > ENERGY_THRESHOLD:
                    is_speaking   = True
                    speech_count  = 1
                    silence_count = 0
                    speech_buf    = [chunk]
                    await send({"type": "status", "text": "speech_detected"})
            else:
                speech_buf.append(chunk)
                if rms > ENERGY_THRESHOLD:
                    speech_count  += 1
                    silence_count  = 0
                else:
                    silence_count += 1
                    if silence_count >= SILENCE_CHUNKS:
                        if speech_count >= MIN_SPEECH_CHUNKS:
                            is_assistant_busy = True
                            await send({"type": "status", "text": "processing"})

                            # Build WAV
                            audio_data = np.concatenate(speech_buf)
                            audio_duration_ms = len(audio_data) / SAMPLE_RATE * 1000
                            wav_buf = io.BytesIO()
                            with wave.open(wav_buf, "wb") as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(SAMPLE_RATE)
                                wf.writeframes(audio_data.tobytes())
                            wav_buf.seek(0)

                            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                                tf.write(wav_buf.read())
                                wav_path = tf.name

                            # STT with timing
                            t0 = _time.perf_counter()
                            try:
                                transcript = transcribe_from_path(wav_path, STT_LANG)
                            finally:
                                os.remove(wav_path)
                            stt_ms = (_time.perf_counter() - t0) * 1000

                            logger.debug(f"Study transcript [{mode}]: {transcript!r}")

                            if transcript:
                                await send({"type": "transcript", "text": transcript})

                                current_turn = turn_counter + 1
                                await insert_chat_message(session_id, current_turn, "user", transcript)

                                if mode == "explain" and not topic:
                                    topic = transcript[:60]
                                    await insert_session(session_id, mode, language, topic)

                                if any(w in transcript.lower() for w in ["goodbye", "quit", "exit", "stop"]):
                                    farewell = (
                                        "Goodbye! Great session!"
                                        if language == "en"
                                        else "நன்றி! சிறந்த அமர்வு!"
                                    )
                                    mp3 = await tts_to_bytes(farewell, TTS_VOICE)
                                    await send({
                                        "type": "response", "text": farewell,
                                        "audio": base64.b64encode(mp3).decode(),
                                        "final": "true",
                                    })
                                    await insert_chat_message(session_id, current_turn, "assistant", farewell)
                                    break

                                prev_model_answer   = last_model_answer
                                prev_question       = last_question
                                prev_correct_option = last_correct_option

                                # ── LLM stream + TTS ─────────────────────────
                                full_reply, final_meta, llm_ms, tts_ms = \
                                    await run_streaming_pipeline(
                                        send, transcript, session_id,
                                        mode, language, TTS_VOICE, turn_counter,
                                    )

                                last_question       = full_reply
                                last_model_answer   = final_meta["model_answer"]
                                last_correct_option = final_meta.get("correct_option") or ""
                                turn_counter = current_turn
                                await insert_chat_message(session_id, turn_counter, "assistant", full_reply)

                                await send({
                                    "type":  "response",
                                    "text":  full_reply,
                                    "final": "false",
                                    "turn":  str(turn_counter),
                                })

                                # ── scoring + latency ─────────────────────────
                                await handle_scoring(
                                    send, session_id, turn_counter,
                                    transcript, prev_model_answer, prev_question,
                                    topic, mode, stt_ms, llm_ms, tts_ms,
                                    prev_correct_option=prev_correct_option,
                                    audio_duration_ms=audio_duration_ms,
                                )

                            else:
                                await send({"type": "status", "text": "no_speech"})

                        is_speaking       = False
                        speech_buf        = []
                        silence_count     = 0
                        speech_count      = 0
                        is_assistant_busy = False
                        await send({"type": "status", "text": "listening"})

    except Exception as e:
        err_str = str(e)
        if "1005" not in err_str and "NO_STATUS_RCVD" not in err_str:
            logger.error(f"Study WS error: {e}")
    finally:
        await close_session(session_id)
        clear_session_memory(session_id)
        try:
            await websocket.close()
        except Exception:
            pass
