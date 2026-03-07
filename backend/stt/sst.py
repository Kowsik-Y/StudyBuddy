"""
Speech-to-Text (STT) module using OpenAI Whisper.
Provides utilities for recording and transcribing speech.
"""

import os
import io
import wave
import numpy as np
import collections
import threading
import time
import sounddevice as sd
from openai import OpenAI
import tempfile
from faster_whisper import WhisperModel


model_size = "base.en"
whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
print("Whisper model loaded!")

# Audio settings
SAMPLE_RATE = 16000
CHANNELS = 1
BLOCK_SIZE = 1024
DTYPE = 'int16'

# VAD settings
ENERGY_THRESHOLD = 500
SILENCE_DURATION = 1.5
MIN_SPEECH_DURATION = 0.2


def get_rms(audio_block):
    """Calculate RMS energy of an audio block."""
    return np.sqrt(np.mean(audio_block.astype(np.float32) ** 2))


def audio_to_wav_buffer(audio_data, sample_rate=SAMPLE_RATE):
    """Convert numpy int16 array to in-memory WAV buffer."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_data.tobytes())
    buf.seek(0)
    buf.name = "audio.wav"
    return buf


def listen_for_speech(assistant_speaking):
    """
    Continuously listen to microphone and detect speech via VAD.
    Returns numpy int16 array of recorded audio.
    """
    frames = []
    is_speaking = False
    silence_blocks = 0
    speech_blocks = 0
    blocks_per_second = SAMPLE_RATE / BLOCK_SIZE
    silence_blocks_needed = int(SILENCE_DURATION * blocks_per_second)
    min_speech_blocks = int(MIN_SPEECH_DURATION * blocks_per_second)

    audio_queue = collections.deque()
    stop_event = threading.Event()

    def callback(indata, frame_count, time_info, status):
        if not stop_event.is_set():
            audio_queue.append(indata.copy())

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS,
                        dtype=DTYPE, blocksize=BLOCK_SIZE, callback=callback):
        while not stop_event.is_set():
            if assistant_speaking.is_set():
                time.sleep(0.05)
                audio_queue.clear()
                continue

            if not audio_queue:
                time.sleep(0.01)
                continue

            block = audio_queue.popleft()
            rms = get_rms(block)

            if not is_speaking:
                if rms > ENERGY_THRESHOLD:
                    is_speaking = True
                    speech_blocks = 1
                    silence_blocks = 0
                    frames.append(block)
                    print("\n🟢 Speech detected... listening", end="", flush=True)
            else:
                frames.append(block)
                if rms > ENERGY_THRESHOLD:
                    speech_blocks += 1
                    silence_blocks = 0
                    print(".", end="", flush=True)
                else:
                    silence_blocks += 1
                    if silence_blocks >= silence_blocks_needed:
                        print(" done.")
                        stop_event.set()

    if frames and speech_blocks >= min_speech_blocks:
        audio_data = np.concatenate(frames, axis=0)
        return audio_data
    return None


def speech_to_text(audio_data, client: OpenAI = None):
    
    print("📝 Transcribing...Fast Whisper...")
    
    # Save audio data to temporary file for faster-whisper
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = temp_file.name
        with wave.open(temp_path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(audio_data.tobytes())
            
    try:
        segments, info = whisper_model.transcribe(
            temp_path,
            language="en",
            beam_size=5
        )
        transcript = " ".join([segment.text for segment in segments])
        return transcript.strip()
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ─── WebServer helpers ────────────────────────────────────────────────────────

def transcribe_from_path(wav_path: str, language: str = "en") -> str:
    """Run faster-whisper on an existing WAV file and return the transcript."""
    # beam_size=1 (greedy) cuts STT latency by ~50% with minimal accuracy loss for clear speech.
    segments, _ = whisper_model.transcribe(wav_path, language=language, beam_size=1)
    return " ".join(s.text for s in segments).strip()


def convert_to_wav(input_path: str, output_path: str) -> None:
    """Convert any audio file to 16-kHz mono WAV using ffmpeg."""
    import subprocess
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path,
         "-ar", "16000", "-ac", "1", "-f", "wav", output_path],
        check=True, capture_output=True
    )

