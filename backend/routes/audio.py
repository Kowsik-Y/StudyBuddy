"""
Audio routes
  POST /audio/process  — upload audio blob → STT → LLM → TTS → base64 MP3
  WS   /ws/audio       — simple WebSocket audio chunk receiver (ack only)
"""

import os
import base64
import tempfile
import asyncio
import json

from fastapi import APIRouter, UploadFile, File, WebSocket

from config import client, MODEL, logger
from stt.sst import transcribe_from_path, convert_to_wav
from llm_response.llm_response import respond as llm_respond
from text_to_speech.tts import to_bytes as tts_to_bytes

router = APIRouter()


@router.post("/audio/process")
async def audio_process(audio: UploadFile = File(...)):
    """Receive browser audio blob → STT → LLM → TTS → return MP3 as base64."""
    tmp_in_path = None
    tmp_wav_path = None
    try:
        suffix = ".webm" if "webm" in (audio.content_type or "") else ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
            tmp_in.write(await audio.read())
            tmp_in_path = tmp_in.name

        tmp_wav_path = tmp_in_path.replace(suffix, ".wav")
        try:
            convert_to_wav(tmp_in_path, tmp_wav_path)
            wav_path = tmp_wav_path
        except Exception:
            wav_path = tmp_in_path

        transcript = transcribe_from_path(wav_path)
        logger.info(f"Transcript: {transcript!r}")

        if not transcript:
            return {"transcript": "", "response": "", "audio_response": None}

        reply = await asyncio.get_event_loop().run_in_executor(
            None, llm_respond, transcript, client, MODEL
        )
        logger.info(f"LLM reply: {reply!r}")

        mp3_bytes = await tts_to_bytes(reply)
        audio_b64 = base64.b64encode(mp3_bytes).decode()

        return {
            "transcript": transcript,
            "response": reply,
            "audio_response": audio_b64,
        }

    except Exception as e:
        logger.error(f"audio/process error: {e}")
        return {"error": str(e)}
    finally:
        for p in (tmp_in_path, tmp_wav_path if suffix != ".wav" else None):
            if p and os.path.exists(p):
                os.remove(p)


@router.websocket("/ws/audio")
async def websocket_audio_endpoint(websocket: WebSocket):
    """Simple WebSocket endpoint — receives audio chunks and acks them."""
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message["type"] == "audio":
                audio_data = message.get("data", "")
                logger.info(f"WS audio data: {len(audio_data)} bytes")
                await websocket.send_json({"type": "ack", "content": "received"})
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()
