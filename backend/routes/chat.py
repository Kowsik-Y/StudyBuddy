"""
Text chat routes
  POST /chat   — REST text-in / text-out fallback
  GET  /reset  — clear conversation memory
"""

import asyncio
from fastapi import APIRouter

from config import client, MODEL, logger
from llm_response.llm_response import respond as llm_respond, reset_memory

router = APIRouter()


@router.post("/chat")
async def chat(message: dict):
    """
    REST fallback for text-based chat.
    Expects: {"text": "<user_message>"}
    """
    try:
        user_message = message.get("text")
        if not user_message:
            return {"error": "Missing text"}
        response_text = await asyncio.get_event_loop().run_in_executor(
            None, llm_respond, user_message, client, MODEL
        )
        return {"response": response_text}
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {"error": str(e)}


@router.get("/reset")
async def reset_conversation():
    """Reset conversation memory."""
    reset_memory()
    return {"status": "reset"}
