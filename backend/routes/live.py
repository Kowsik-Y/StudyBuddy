"""
Live voice WebSocket — WS /ws/live
Continuous PCM stream → VAD → STT → LLM → TTS events back to browser.
"""

import os
import io
import base64
import wave
import tempfile
import asyncio

import numpy as np
from fastapi import APIRouter, WebSocket

from config import client, MODEL, logger
from stt.sst import transcribe_from_path
from llm_response.llm_response import respond as llm_respond
from text_to_speech.tts import to_bytes as tts_to_bytes

router = APIRouter()

# ── VAD constants ─────────────────────────────────────────────────────────────
SAMPLE_RATE       = 16000
CHUNK_SAMPLES     = 1024
ENERGY_THRESHOLD  = 900   # int16 RMS — frontend adaptive gate keeps floor below this
SILENCE_DURATION  = 1.5   # seconds of silence → end of utterance
MIN_SPEECH_SECS   = 0.5   # minimum speech before processing (up from 0.3)
CHUNKS_PER_SEC    = SAMPLE_RATE / CHUNK_SAMPLES
SILENCE_CHUNKS    = int(SILENCE_DURATION * CHUNKS_PER_SEC)
MIN_SPEECH_CHUNKS = int(MIN_SPEECH_SECS * CHUNKS_PER_SEC)


@router.websocket("/ws/live")
async def live_voice_endpoint(websocket: WebSocket):
    """
    Browser sends raw PCM Int16 chunks at 16 kHz.
    Backend does VAD → STT → LLM → TTS and streams events back.
    """
    await websocket.accept()

    speech_buf: list  = []
    is_speaking       = False
    silence_count     = 0
    speech_count      = 0
    is_assistant_busy = False

    async def send(msg: dict):
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    await send({"type": "status", "text": "listening"})
    logger.debug("Live WS connected — listening for speech")

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

                            # Build WAV in memory
                            audio_data = np.concatenate(speech_buf)
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
                            try:
                                transcript = transcribe_from_path(wav_path)
                            finally:
                                os.remove(wav_path)

                            logger.debug(f"Live transcript: {transcript!r}")

                            if transcript:
                                await send({"type": "transcript", "text": transcript})

                                if any(w in transcript.lower() for w in ["goodbye", "quit", "exit", "stop"]):
                                    reply = "Goodbye! Have a great day!"
                                    mp3   = await tts_to_bytes(reply)
                                    await send({
                                        "type":  "response",
                                        "text":  reply,
                                        "audio": base64.b64encode(mp3).decode(),
                                        "final": True,
                                    })
                                    break

                                await send({"type": "status", "text": "thinking"})
                                reply = await asyncio.get_event_loop().run_in_executor(
                                    None, llm_respond, transcript, client, MODEL
                                )
                                logger.debug(f"Live reply: {reply!r}")

                                await send({"type": "status", "text": "speaking"})
                                mp3 = await tts_to_bytes(reply)
                                await send({
                                    "type":  "response",
                                    "text":  reply,
                                    "audio": base64.b64encode(mp3).decode(),
                                    "final": False,
                                })
                            else:
                                await send({"type": "status", "text": "no_speech"})

                        # Reset for next utterance
                        is_speaking       = False
                        speech_buf        = []
                        silence_count     = 0
                        speech_count      = 0
                        is_assistant_busy = False
                        await send({"type": "status", "text": "listening"})

    except Exception as e:
        err_str = str(e)
        if "1005" not in err_str and "NO_STATUS_RCVD" not in err_str:
            logger.error(f"Live WS error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
