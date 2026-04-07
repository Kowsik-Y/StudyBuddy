"""
Text-to-Speech (TTS) module using OpenAI.
Streams audio directly to speakers without saving files.
"""

import os
import re
import time
import asyncio
import numpy as np
import openai
from openai import OpenAI
import tempfile
import subprocess

try:
    import sounddevice as sd
except Exception:
    sd = None

try:
    import edge_tts
except Exception:
    edge_tts = None


def _normalize_for_tts(text: str) -> str:

    # Replace score-like fractions  e.g. 2/2  4/5  10/10
    text = re.sub(r'\b(\d+)/(\d+)\b', lambda m: f"{m.group(1)} out of {m.group(2)}", text)
    return text

print("Initialized for local TTS generation!")


def stream_tts_and_play_openai(text, client: OpenAI, assistant_speaking):
    """Stream TTS audio directly to speakers in real-time using OpenAI API (backup method)."""
    print("🔊 Speaking...OpenAI")
    assistant_speaking.set()

    if sd is None:
        assistant_speaking.clear()
        raise RuntimeError("sounddevice/PortAudio is not available for local speaker playback")

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
    """Stream TTS audio directly to speakers in real-time   (offline)."""
    print("🔊 Speaking...Offline")
    if assistant_speaking:
        assistant_speaking.set()

    try:
        if edge_tts is not None:
            # Run async edge-tts in a synchronous context
            asyncio.run(_stream_edge_tts(text))
        elif client is not None:
            # Fall back to OpenAI playback if edge-tts is unavailable.
            stream_tts_and_play_openai(text, client, assistant_speaking)
            return
        else:
            raise RuntimeError("edge_tts is not installed and no OpenAI client was provided")
        print("✅ Done speaking.")
    except Exception as e:
        print(f"❌ TTS error: {e}")
    finally:
        if assistant_speaking:
            assistant_speaking.clear()


async def _stream_edge_tts(text: str):
    """Internal async function to play audio."""
    if edge_tts is None:
        raise RuntimeError("edge_tts is not installed")
    
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


# ── Voice mapping: names → OpenAI voices ────────────────────────────
_VOICE_MAP: dict[str, str] = {
    "en-US-AriaNeural":     "nova",
    "en-US-GuyNeural":      "onyx",
    "en-US-JennyNeural":    "nova",
    "ta-IN-PallaviNeural":  "alloy",   # OpenAI has no Tamil; nearest fallback
}
_DEFAULT_OAI_VOICE = "coral"

# ── WebServer helper ──────────────────────────────────────────────────────────

def _get_tts_client() -> OpenAI:
    """
    Returns an OpenAI client pointed directly at api.openai.com for TTS.
    The LiteLLM proxy (OPENAI_BASE_URL) does not support audio.speech endpoints,
    so TTS always talks to OpenAI directly using NVIDIA_API_KEY as a direct
    OpenAI key if available, otherwise falls back
    """
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    # Prefer a dedicated TTS key; fall back to the main API key (sk- required)
    tts_key = os.getenv("TTS_API_KEY") or os.getenv("OPENAI_API_KEY", "")
    return OpenAI(api_key=tts_key)  # no custom base_url → real OpenAI


async def to_bytes(text: str, voice: str = "en-US-AriaNeural") -> bytes:
    """
    Generate TTS with OpenAI gpt-4o-mini-tts and return raw MP3 bytes.
    Falls back if the OpenAI TTS call fails.
    """
    text = _normalize_for_tts(text)
    oai_voice = _VOICE_MAP.get(voice, _DEFAULT_OAI_VOICE)
    try:
        tts_client = _get_tts_client()
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: tts_client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=oai_voice,
                input=text,
                response_format="mp3",
            ),
        )
        return response.content
    except Exception as e:
        print(f"⚠️ OpenAI TTS failed ({e}), falling back")
        if edge_tts is None:
            raise RuntimeError("Both OpenAI TTS and edge_tts fallback are unavailable")
        import io as _io
        communicate = edge_tts.Communicate(text, voice)
        buf = _io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        return buf.getvalue()


async def stream_bytes(text: str, voice: str = "en-US-AriaNeural"):
    """
    Async generator — yields raw MP3 byte chunks.
    Uses OpenAI gpt-4o-mini-tts, falls back on failure.
    """
    data = await to_bytes(text, voice)
    chunk_size = 1096
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]
