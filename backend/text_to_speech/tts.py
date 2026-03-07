"""
Text-to-Speech (TTS) module using OpenAI and edge-tts.
Streams audio directly to speakers without saving files.
"""

import os
import re
import time
import asyncio
import numpy as np
import sounddevice as sd
import openai
from openai import OpenAI
import edge_tts
import tempfile
import subprocess


def _normalize_for_tts(text: str) -> str:
    """
    Fix common TTS mispronunciations before synthesis.

    • N/M  → "N out of M"   (scores like 2/2 read as "February 2nd" by edge-tts)
    """
    # Replace score-like fractions  e.g. 2/2  4/5  10/10
    text = re.sub(r'\b(\d+)/(\d+)\b', lambda m: f"{m.group(1)} out of {m.group(2)}", text)
    return text

print("edge-tts initialized for local TTS generation!")


def stream_tts_and_play_openai(text, client: OpenAI, assistant_speaking):
    """Stream TTS audio directly to speakers in real-time using OpenAI API (backup method)."""
    print("🔊 Speaking...OpenAI")
    assistant_speaking.set()

    for attempt in range(3):
        try:
            response = client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice="alloy",
                input=text,
                response_format="pcm"
            )

            stream = sd.OutputStream(samplerate=24000, channels=1, dtype='int16')
            stream.start()

            for chunk in response.iter_bytes(chunk_size=4096):
                if chunk:
                    audio_array = np.frombuffer(chunk, dtype=np.int16)
                    stream.write(audio_array.reshape(-1, 1))

            stream.stop()
            stream.close()
            print("✅ Done speaking.")
            assistant_speaking.clear()
            return

        except openai.InternalServerError:
            print(f"⚠️ Server error. Retrying ({attempt + 1}/3)...")
            time.sleep(2)
        except Exception as e:
            print(f"⚠️ TTS error: {e}. Retrying ({attempt + 1}/3)...")
            time.sleep(2)

    assistant_speaking.clear()
    print("❌ TTS failed.")


def stream_tts_and_play(text, client: OpenAI = None, assistant_speaking=None):
    """Stream TTS audio directly to speakers in real-time using edge-tts (offline)."""
    print("🔊 Speaking...Offline")
    if assistant_speaking:
        assistant_speaking.set()

    try:
        # Run the async edge-tts in a synchronous context
        asyncio.run(_stream_edge_tts(text))
        print("✅ Done speaking.")
    except Exception as e:
        print(f"❌ TTS error: {e}")
    finally:
        if assistant_speaking:
            assistant_speaking.clear()


async def _stream_edge_tts(text: str):
    """Internal async function to play edge-tts audio."""
    
    voice = "en-US-AriaNeural"
    communicate = edge_tts.Communicate(text, voice)
    
    # Save to temporary file and play with system audio player
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_file:
        temp_path = temp_file.name
    
    try:
        await communicate.save(temp_path)
        
        # Play audio using afplay (macOS built-in audio player)
        subprocess.run(
            ["afplay", temp_path],
            check=True
        )
    finally:
        # Clean up temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ── WebServer helper ──────────────────────────────────────────────────────────

async def to_bytes(text: str, voice: str = "en-US-AriaNeural") -> bytes:
    """
    Generate TTS with edge-tts and return raw MP3 bytes (no disk I/O).
    Use this in the async FastAPI / WebSocket pipeline.
    """
    import io as _io
    text = _normalize_for_tts(text)
    communicate = edge_tts.Communicate(text, voice)
    buf = _io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()


async def stream_bytes(text: str, voice: str = "en-US-AriaNeural"):
    """
    Async generator — yields raw MP3 byte chunks from edge-tts as they arrive.
    Use this for minimum time-to-first-audio: the caller can forward each chunk
    over a WebSocket without waiting for the whole sentence to be synthesised.
    """
    text = _normalize_for_tts(text)
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio" and chunk["data"]:
            yield chunk["data"]
