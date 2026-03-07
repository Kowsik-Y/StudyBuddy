"""
Reusable helpers for the study WebSocket pipeline.

  run_streaming_pipeline  — drives LLM stream → concurrent TTS → sends audio chunks
  handle_scoring          — WER + rubric scoring, sends score event, inserts to DB
"""

import asyncio
import base64
import re
import time as _time
from typing import Callable, Awaitable

from config import client, MODEL, logger
from llm_response.llm_response import study_respond_stream_sync
from text_to_speech.tts import to_bytes as tts_to_bytes
from analytics.db import insert_evaluation, insert_latency
from evaluation.evaluator import compute_wer, score_answer


# ─────────────────────────────────────────────────────────────────────────────
# Streaming pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def run_streaming_pipeline(
    send: Callable[[dict], Awaitable[None]],
    transcript: str,
    session_id: str,
    mode: str,
    language: str,
    tts_voice: str,
    turn_counter: int,
) -> tuple[str, dict, float, float]:
    """
    Run the streaming LLM → sentence-by-sentence TTS pipeline.

    Returns (full_reply, final_meta, llm_ms, tts_ms).
    final_meta keys: "model_answer", "correct_option"
    """
    await send({"type": "status", "text": "thinking"})
    t1 = _time.perf_counter()

    sentence_q: asyncio.Queue  = asyncio.Queue()
    final_parts: list[str]     = []
    token_parts: list[str]     = []   # raw tokens — fallback when sentence splitter drops all
    final_meta                 = {"model_answer": "", "correct_option": None}
    loop                       = asyncio.get_event_loop()
    _tts_total                 = [0.0]

    # ── thread: pull tokens/sentences from LLM stream ────────────────────────
    def _llm_worker():
        try:
            for item in study_respond_stream_sync(
                transcript, session_id, mode, language, client, MODEL
            ):
                asyncio.run_coroutine_threadsafe(sentence_q.put(item), loop).result()
        finally:
            asyncio.run_coroutine_threadsafe(sentence_q.put(None), loop).result()

    # tts_q carries (sentence_idx, asyncio.Task) pairs.
    # Each task is create_task'd the instant the LLM emits a sentence boundary,
    # so TTS for sentence N runs concurrently while LLM generates sentence N+1.
    # Shorter sentences from the soft-split (~6 words) synthesise in ~300 ms
    # instead of ~900 ms for long sentences — the main latency reduction.
    tts_q: asyncio.Queue = asyncio.Queue()

    # ── coroutine A: forward text tokens immediately; launch TTS tasks ASAP ──
    async def _consume_llm():
        while True:
            item = await sentence_q.get()
            if item is None:
                await tts_q.put(None)
                break

            # Raw token → forward instantly (not blocked by TTS)
            if item.get("is_token"):
                token_text = item.get("token", "")
                if token_text:
                    token_parts.append(token_text)
                    await send({"type": "text_token", "text": token_text})
                continue

            if item.get("is_last"):
                final_meta["model_answer"]   = item.get("model_answer", "")
                final_meta["correct_option"] = item.get("correct_option")

            sentence = item.get("sentence", "").strip()
            # Strip any leaked metadata marker (||| and everything after)
            if "|||" in sentence:
                sentence = sentence[:sentence.index("|||")].strip()
            if not sentence:
                continue

            final_parts.append(sentence)
            tts_task = asyncio.create_task(tts_to_bytes(sentence, tts_voice))
            await tts_q.put((len(final_parts) - 1, tts_task))

    # ── coroutine B: await TTS tasks in order — residual wait ≈ 0 for later ──
    async def _drain_tts():
        announced = False
        while True:
            entry = await tts_q.get()
            if entry is None:
                break
            sentence_idx, tts_task = entry

            t_tts = _time.perf_counter()
            try:
                mp3 = await tts_task
            except Exception as e:
                logger.warning(f"TTS task failed for sentence {sentence_idx}: {e}")
                continue
            if not mp3:
                logger.warning(f"TTS returned empty bytes for sentence {sentence_idx}")
                continue
            _tts_total[0] += (_time.perf_counter() - t_tts) * 1000

            if not announced:
                announced = True
                await send({"type": "status", "text": "speaking"})

            await send({
                "type":  "audio_chunk",
                "index": str(sentence_idx),
                "audio": base64.b64encode(mp3).decode(),
            })

    stream_task = loop.run_in_executor(None, _llm_worker)
    await asyncio.gather(_consume_llm(), _drain_tts())
    # Swallow any exception from the LLM thread — _consume_llm already
    # handled the sentinel (None) that the thread puts on the queue in its
    # finally block, so gather already completed cleanly.
    try:
        await stream_task
    except Exception as e:
        logger.warning(f"[pipeline] _llm_worker raised after gather: {e}")

    tts_ms  = _tts_total[0]
    llm_ms  = (_time.perf_counter() - t1) * 1000 - tts_ms
    # Prefer the sentence-joined reply; fall back to raw tokens so the response
    # event never carries an empty string when the LLM did produce output.
    # Strip any ||| metadata that may have leaked into token_parts.
    import re as _re
    token_fallback = _re.sub(r'\|\|\|.*$', '', ''.join(token_parts), flags=_re.DOTALL).strip()
    full_reply = ' '.join(final_parts) or token_fallback
    return full_reply, final_meta, llm_ms, tts_ms


# ─────────────────────────────────────────────────────────────────────────────
# Scoring
# ─────────────────────────────────────────────────────────────────────────────

async def handle_scoring(
    send: Callable[[dict], Awaitable[None]],
    session_id: str,
    turn_counter: int,
    transcript: str,
    prev_model_answer: str,
    prev_question: str,
    topic: str,
    mode: str,
    stt_ms: float,
    llm_ms: float,
    tts_ms: float,
    prev_correct_option: str = "",
) -> None:
    """
    Compute WER + rubric scores, send score/latency events, persist to DB.
    Only scores if prev_model_answer is non-empty.
    """
    await send({
        "type":   "latency",
        "stt_ms": round(stt_ms, 1),
        "llm_ms": round(llm_ms, 1),
        "tts_ms": round(tts_ms, 1),
    })
    await insert_latency(session_id, turn_counter, stt_ms, llm_ms, tts_ms)

    if not prev_model_answer:
        return

    wer_score = compute_wer(prev_model_answer, transcript)

    # ── Quiz correctness: check if student picked the right option ────────────
    is_correct = False
    if mode == "quiz" and prev_correct_option:
        t = transcript.lower().strip()
        letter = prev_correct_option.lower()  # e.g. "c"
        # Map each option letter to its common spoken homophones/variants
        spoken_map = {"a": ["a", "ay", "eh"], "b": ["b", "be", "bee"],
                      "c": ["c", "see", "sea", "si"], "d": ["d", "de", "dee"]}
        variants = spoken_map.get(letter, [letter])
        # Match: bare letter, "option X", "answer X", or any spoken variant, or model answer text
        if re.search(rf'\boption\s+{letter}\b', t) or re.search(rf'\banswer\s+{letter}\b', t):
            is_correct = True
        elif any(re.search(rf'\b{v}\b', t) for v in variants):
            is_correct = True
        elif prev_model_answer and prev_model_answer.lower()[:15] in t:
            is_correct = True
    scores = await asyncio.get_event_loop().run_in_executor(
        None, score_answer,
        transcript, prev_model_answer,
        topic or mode, prev_question,
        client, MODEL,
    )
    await send({
        "type":         "score",
        "turn":         str(turn_counter),
        "accuracy":     scores["accuracy"],
        "terminology":  scores["terminology"],
        "completeness": scores["completeness"],
        "clarity":      scores["clarity"],
        "total_score":  scores["total_score"],
        "wer":          wer_score,
        "feedback":     scores["feedback"],
        "is_correct":   is_correct,
    })
    await insert_evaluation(
        session_id, turn_counter, transcript, prev_model_answer,
        wer_score, scores["accuracy"], scores["terminology"],
        scores["completeness"], scores["clarity"],
        scores["total_score"], scores["feedback"],
    )
