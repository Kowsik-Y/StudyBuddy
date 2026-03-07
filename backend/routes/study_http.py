"""
HTTP (non-WebSocket) study endpoints.

  POST /study/ask  — Send a text topic/question, get an LLM answer + TTS audio back.
                     Uses the same mode-specific prompts as the WebSocket pipeline.
"""
from __future__ import annotations

import asyncio
import base64

from fastapi import APIRouter
from pydantic import BaseModel

from config import client, MODEL, logger
from text_to_speech.tts import to_bytes as tts_to_bytes
from llm_response.llm_response import MODE_PROMPTS, SYSTEM_PROMPT

router = APIRouter(prefix="/study", tags=["study-http"])


class StudyAskRequest(BaseModel):
    text: str
    mode: str = "explain"       # explain | viva | quiz
    language: str = "en"
    session_id: str = ""        # optional — ignored for now (stateless)
    tts: bool = True


class TTSRequest(BaseModel):
    text: str
    language: str = "en"


def _llm_ask(text: str, mode: str, language: str) -> str:
    system_content = MODE_PROMPTS.get((mode, language), SYSTEM_PROMPT)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user",   "content": text},
        ],
        max_tokens=300,
        temperature=0.5,
        timeout=30,
    )
    import re
    raw = response.choices[0].message.content or ""
    # Strip embedded ||| metadata used by scoring
    return re.sub(r"\|\|\|.*$", "", raw, flags=re.DOTALL).strip()


@router.post("/ask")
async def study_ask(req: StudyAskRequest):
    """Synchronous text → LLM → TTS endpoint for the explain/viva/quiz pages."""
    logger.info(f"[study_http] mode={req.mode} lang={req.language} text={req.text[:80]!r}")
    try:
        answer = await asyncio.get_event_loop().run_in_executor(
            None, _llm_ask, req.text, req.mode, req.language
        )
    except Exception as e:
        logger.error(f"[study_http] LLM error: {e}")
        answer = "Sorry, I couldn't process that. Please try again."

    audio_b64: str | None = None
    if req.tts and answer:
        voice = "ta-IN-PallaviNeural" if req.language == "ta" else "en-US-AriaNeural"
        try:
            mp3 = await tts_to_bytes(answer, voice)
            audio_b64 = base64.b64encode(mp3).decode()
        except Exception as e:
            logger.warning(f"[study_http] TTS error: {e}")

    return {"answer": answer, "audio": audio_b64}


@router.post("/tts")
async def study_tts(req: TTSRequest):
    """Convert arbitrary text to TTS audio (base64 MP3). Used by repeat-question."""
    logger.info(f"[study_http/tts] lang={req.language} text={req.text[:80]!r}")
    voice = "ta-IN-PallaviNeural" if req.language == "ta" else "en-US-AriaNeural"
    try:
        mp3 = await tts_to_bytes(req.text, voice)
        return {"audio": base64.b64encode(mp3).decode()}
    except Exception as e:
        logger.warning(f"[study_http/tts] TTS error: {e}")
        return {"audio": None}
