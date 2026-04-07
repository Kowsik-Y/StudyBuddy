"""
LLM Response module using OpenAI.
Handles streaming agent interactions with tool support,
plus a non-streaming respond() for the WebSocket live pipeline.
"""

import os
import json
import logging
from datetime import datetime
from openai import OpenAI

_logger = logging.getLogger(__name__)


def get_time():
    """Get current date and time."""
    now = datetime.now()
    return now.strftime("Current time is %H:%M:%S on %d %B %Y")


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_time",
            "description": "Get the current date and time",
            "parameters": {"type": "object", "properties": {}}
        }
    }
]

TOOL_FUNCTIONS = {
    "get_time": get_time
}


def run_agent_streaming(user_text, memory, client: OpenAI):
    """Run the agent with streaming LLM output and tool support."""
    memory.append({"role": "user", "content": user_text})

    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=memory,
        tools=TOOLS,
        tool_choice="auto",
        stream=True
    )

    collected_content = ""
    collected_tool_calls = {}

    print("🤖 Assistant: ", end="", flush=True)

    for chunk in response:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta is None:
            continue

        if delta.content:
            collected_content += delta.content
            print(delta.content, end="", flush=True)

        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in collected_tool_calls:
                    collected_tool_calls[idx] = {
                        "id": "",
                        "type": "function",
                        "function": {"name": "", "arguments": ""}
                    }
                if tc.id:
                    collected_tool_calls[idx]["id"] = tc.id
                if tc.type:
                    collected_tool_calls[idx]["type"] = tc.type
                if tc.function:
                    if tc.function.name:
                        collected_tool_calls[idx]["function"]["name"] += tc.function.name
                    if tc.function.arguments:
                        collected_tool_calls[idx]["function"]["arguments"] += tc.function.arguments

    print()

    if collected_tool_calls:
        tool_calls_list = [collected_tool_calls[i] for i in sorted(collected_tool_calls.keys())]

        memory.append({
            "role": "assistant",
            "content": collected_content if collected_content else None,
            "tool_calls": tool_calls_list
        })

        for tc in tool_calls_list:
            tool_name = tc["function"]["name"]
            args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}

            print(f"🛠 Calling tool: {tool_name}")
            result = TOOL_FUNCTIONS[tool_name](**args)
            print(f"📦 Result: {result}")

            memory.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result
            })

        second_response = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=memory,
            stream=True
        )

        final_text = ""
        print("🤖 Assistant: ", end="", flush=True)
        for chunk in second_response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                final_text += delta.content
                print(delta.content, end="", flush=True)
        print()

    else:
        final_text = collected_content

    memory.append({"role": "assistant", "content": final_text})
    
    if len(memory) > 20:
        trimmed = [memory[0]]
        rest = memory[1:]
        start = 0
        for i, msg in enumerate(rest[-19:]):
            if msg["role"] == "tool":
                start = i + 1
            else:
                break
        trimmed.extend(rest[-(19 - start):] if start < 19 else [])
        memory[:] = trimmed

    return final_text


# ── Shared conversation memory (used by respond() and reset_memory()) ─────────

SYSTEM_PROMPT = (
    "You are a helpful voice assistant. Respond in English. "
    "Keep responses concise and conversational (1-3 sentences). Be friendly and natural."
)

# ── Mode-specific system prompts ──────────────────────────────────────────────

EXPLAIN_PROMPT_EN = (
    "You are a friendly, expert academic tutor. "
    "The app sends you messages in the format: [TOPIC: <subject>] <optional student text>. "
    "This tag is an internal system marker — NEVER mention it, quote it, or tell the user about it. "
    "Rules:\n"
    "1. If the message is just [TOPIC: X] with no extra text, explain topic X clearly in 2-3 sentences "
    "   with a concrete real-world example, then ask ONE probing follow-up question.\n"
    "2. If there is extra student text after [TOPIC: X], treat it as a follow-up question or comment "
    "   about topic X and respond helpfully in that context — explain, clarify, or answer as needed, "
    "   then ask ONE follow-up question to deepen understanding.\n"
    "3. If there is no [TOPIC:] tag just respond naturally as a tutor would to what the student said.\n"
    "4. Never ask the student what topic they want — always respond to what you have.\n"
    "The topic can be anything: science, history, math, nature, programming, etc. "
    "Keep responses concise and spoken-friendly (no markdown, no bullet points). "
    "Always include the ideal concise model answer to your follow-up question at the very end like: "
    "|||{\"model_answer\": \"<answer>\"}"
)

EXPLAIN_PROMPT_TA = (
    "நீங்கள் ஒரு நட்புள்ள நிபுணர் கல்வி ஆசிரியர். "
    "முறையமைப்பு [TOPIC: <தலைப்பு>] என்ற உள் செயலி தகவலை மாணவரிடம் என்றும் கூறாதீர்கள் — இது உட்பட்ட அமைப்பு மட்டுமே. "
    "[TOPIC: X] மட்டும் இருந்தால், X-ஐ தெளிவான தமிழில் 3-5 வாக்கியங்களில் விளக்கவும். "
    "கூடுதல் மாணவர் கேள்வி இருந்தால் அந்த தலைப்பின் சூழலில் பதில் கூறவும். பின்னர் ஒரு ஆழமான கேள்வி கேளுங்கள். "
    "எந்த markdown-ம் பயன்படுத்தாதீர்கள். "
    "உங்கள் பதிலின் இறுதியில் இந்த JSON ஐ சேர்க்கவும்: |||{\"model_answer\": \"<answer>\"}"
)

VIVA_PROMPT_EN = (
    "You are a strict but fair technical viva examiner. "
    "Ask ONE structured technical question per turn from core computer science topics "
    "(data structures, algorithms, OS, DBMS, networking, OOP). "
    "After the student answers, acknowledge in one sentence and move to the next question. "
    "Do NOT repeat questions. Keep questions progressively harder. "
    "Speak naturally without markdown or bullet points. "
    "Always include the ideal model answer for your question at the end: |||{\"model_answer\": \"<answer>\"}"
)

VIVA_PROMPT_TA = (
    "நீங்கள் ஒரு தொழில்நுட்ப வாய்வழி தேர்வாளர். "
    "ஒவ்வொரு சுற்றிலும் ஒரே ஒரு கேள்வி கேளுங்கள். "
    "மாணவரின் பதிலை கேட்டு கேள்வியை மேலும் கடினமாக மாற்றுங்கள். "
    "|||{\"model_answer\": \"<answer>\"} சேர்க்கவும்."
)

QUIZ_PROMPT_EN = (
    "You are an interactive quiz master for computer science students. "
    "Generate ONE multiple-choice question with exactly 4 options labeled A, B, C, D. "
    "After the student answers (they may say 'A', 'B', 'option A', the full text, etc.), "
    "tell them if it's correct and briefly explain why, then ask the next question. "
    "Keep track of score internally and announce it every 5 questions. "
    "Speak naturally. Do NOT use markdown. "
    "Include the correct answer at the end of each question in: |||{\"model_answer\": \"<correct option text>\", \"correct_option\": \"<A/B/C/D>\"}"
)

QUIZ_PROMPT_TA = (
    "நீங்கள் ஒரு வினாடி வினா நடத்துபவர். "
    "ஒவ்வொரு சுற்றிலும் A, B, C, D விருப்பங்களுடன் ஒரு கேள்வி கேளுங்கள். "
    "மாணவரின் பதிலை சரிபார்த்து விளக்கவும். "
    "|||{\"model_answer\": \"<correct option>\", \"correct_option\": \"<A/B/C/D>\"} சேர்க்கவும்."
)

MODE_PROMPTS = {
    ("explain", "en"): EXPLAIN_PROMPT_EN,
    ("explain", "ta"): EXPLAIN_PROMPT_TA,
    ("viva",    "en"): VIVA_PROMPT_EN,
    ("viva",    "ta"): VIVA_PROMPT_TA,
    ("quiz",    "en"): QUIZ_PROMPT_EN,
    ("quiz",    "ta"): QUIZ_PROMPT_TA,
}

# Per-session memory store: session_id → list of messages
_session_memories: dict = {}


def get_session_memory(session_id: str, mode: str, language: str) -> list:
    """Return (and if needed initialise) a mode-specific memory for a session."""
    if session_id not in _session_memories:
        system_content = MODE_PROMPTS.get((mode, language), SYSTEM_PROMPT)
        _session_memories[session_id] = [{"role": "system", "content": system_content}]
    return _session_memories[session_id]


def init_session_memory_with_prompt(session_id: str, system_content: str) -> list:
    """Force-initialise a session memory with a custom system prompt (e.g. video transcript)."""
    _session_memories[session_id] = [{"role": "system", "content": system_content}]
    return _session_memories[session_id]


def clear_session_memory(session_id: str) -> None:
    _session_memories.pop(session_id, None)


def study_respond(
    user_text: str,
    session_id: str,
    mode: str,
    language: str,
    client: OpenAI,
    model: str = "gpt-4.1-nano",
) -> dict:
    """
    LLM call using mode-specific per-session memory.
    Returns {"reply": str, "model_answer": str, "correct_option": str | None}.
    Strips the |||{...} JSON from the spoken reply.
    """
    import re
    mem = get_session_memory(session_id, mode, language)
    mem.append({"role": "user", "content": user_text})

    try:
        response = client.chat.completions.create(
            model=model,
            messages=mem,
            timeout=30,
        )
        raw_reply = response.choices[0].message.content or ""
        mem.append({"role": "assistant", "content": raw_reply})

        # Trim memory
        if len(mem) > 22:
            mem[1:] = mem[-20:]

        # Extract embedded JSON metadata (|||{...})
        model_answer = ""
        correct_option = None
        pattern = r"\|\|\|(\{.*?\})"
        m = re.search(pattern, raw_reply, re.DOTALL)
        if m:
            try:
                meta = json.loads(m.group(1))
                model_answer   = meta.get("model_answer", "")
                correct_option = meta.get("correct_option", None)
            except json.JSONDecodeError:
                pass
        # Remove the |||{...} from the spoken reply
        spoken_reply = re.sub(r"\|\|\|\{.*?\}", "", raw_reply, flags=re.DOTALL).strip()

        return {
            "reply":          spoken_reply,
            "model_answer":   model_answer,
            "correct_option": correct_option,
        }
    except Exception as e:
        _logger.error(f"study_respond error: {e}")
        raise


memory: list = [{"role": "system", "content": SYSTEM_PROMPT}]


def reset_memory() -> None:
    """Clear conversation history, keeping the system prompt."""
    global memory
    memory = [{"role": "system", "content": SYSTEM_PROMPT}]


def study_respond_stream_sync(
    user_text: str,
    session_id: str,
    mode: str,
    language: str,
    client: OpenAI,
    model: str = "gpt-4.1-nano",
):
    """
    Synchronous generator for streaming LLM output sentence-by-sentence.
    Yields dicts: {"sentence": str, "is_last": bool, "model_answer": str, "correct_option": str|None}
    Updates session memory identically to study_respond().
    """
    import re

    # ── Sentence boundary patterns ────────────────────────────────────────────
    # Hard: always flush at sentence-final punctuation
    hard_re = re.compile(r'(?<=[.!?\u2026])\s+')
    # Soft: flush at comma/semicolon/colon BUT only when enough words accumulated
    soft_re = re.compile(r'(?<=[,;:])\s+')
    MIN_WORDS_SOFT  = 4   # minimum words in buffer before a soft split
    MIN_WORDS_CHUNK = 3   # don't emit a chunk shorter than this many words

    mem = get_session_memory(session_id, mode, language)
    mem.append({"role": "user", "content": user_text})

    try:
        stream = client.chat.completions.create(
            model=model,
            messages=mem,
            stream=True,
            max_tokens=500,
            timeout=30,
        )

        full_text = ""
        buf = ""
        meta_started = False  # True once ||| appears — suppress text_token events after

        def _emit_sentence(text: str, is_last: bool,
                           model_answer: str = "", correct_option=None):
            """Yield a sentence dict only if it has enough words and no metadata."""
            s = text.strip()
            if s and "|||" not in s and len(s.split()) >= MIN_WORDS_CHUNK:
                yield {"sentence": s, "is_last": is_last,
                       "model_answer": model_answer, "correct_option": correct_option}

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if not delta or not delta.content:
                continue

            token = delta.content
            full_text += token
            buf += token

            # Detect metadata marker — suppress text_token and sentence splitting
            # once ||| appears in the buffer (rest is JSON metadata, not speech)
            if "|||" in buf:
                meta_started = True

            # Forward raw token for live text display — skip once ||| seen
            if not meta_started:
                yield {"token": token, "is_token": True,
                       "sentence": "", "is_last": False,
                       "model_answer": "", "correct_option": None}

            # ── Hard boundaries: always flush ─────────────────────────────────
            # Stop splitting once ||| appears — the rest is metadata, not speech
            if meta_started:
                continue

            hard_parts = hard_re.split(buf)
            if len(hard_parts) > 1:
                for sentence in hard_parts[:-1]:
                    yield from _emit_sentence(sentence, False)
                buf = hard_parts[-1]
                continue

            # ── Soft boundaries: flush only when buffer is long enough ─────────
            if len(buf.split()) >= MIN_WORDS_SOFT:
                soft_parts = soft_re.split(buf)
                if len(soft_parts) > 1:
                    # emit all complete soft-split chunks, keep last in buf
                    for sentence in soft_parts[:-1]:
                        yield from _emit_sentence(sentence, False)
                    buf = soft_parts[-1]

        # Parse embedded metadata from the full text
        model_answer   = ""
        correct_option = None
        meta_match = re.search(r'\|\|\|(\{.*\})', full_text, re.DOTALL)
        if meta_match:
            try:
                meta           = json.loads(meta_match.group(1))
                model_answer   = meta.get("model_answer", "")
                correct_option = meta.get("correct_option", None)
            except json.JSONDecodeError:
                pass

        # Yield the remaining buffer (last sentence / fragment)
        # Strip everything from ||| onward (handles nested braces in JSON values)
        buf_clean = re.sub(r'\|\|\|.*$', '', buf, flags=re.DOTALL).strip()
        if buf_clean:
            yield {"sentence": buf_clean, "is_last": True,
                   "model_answer": model_answer, "correct_option": correct_option}
        else:
            # Sentinel to carry metadata even when no text remains
            yield {"sentence": "", "is_last": True,
                   "model_answer": model_answer, "correct_option": correct_option}

        # Update session memory
        spoken_full = re.sub(r'\|\|\|.*$', '', full_text, flags=re.DOTALL).strip()
        mem.append({"role": "assistant", "content": spoken_full})
        if len(mem) > 22:
            mem[1:] = mem[-20:]

    except Exception as e:
        _logger.error(f"study_respond_stream_sync error: {e}")
        raise


def respond(user_text: str, client: OpenAI, model: str = "gpt-4.1-nano") -> str:
    """
    Non-streaming LLM call with tool support and automatic memory management.
    Designed for use in the live WebSocket pipeline (called from a thread executor).
    """
    memory.append({"role": "user", "content": user_text})

    try:
        response = client.chat.completions.create(
            model=model,
            messages=memory,
            tools=TOOLS,
            tool_choice="auto",
            timeout=30,
        )

        msg = response.choices[0].message
        reply = msg.content or ""

        # Handle tool calls
        if msg.tool_calls:
            memory.append(msg.model_dump(exclude_none=True))
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                args = json.loads(tc.function.arguments or "{}")
                result = TOOL_FUNCTIONS.get(fn_name, lambda **_: "")(**args)
                memory.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": str(result),
                })
            response2 = client.chat.completions.create(
                model=model,
                messages=memory,
                timeout=30,
            )
            reply = response2.choices[0].message.content or ""

        memory.append({"role": "assistant", "content": reply})

        # Trim memory to avoid unbounded growth
        if len(memory) > 20:
            memory[1:] = memory[-18:]

        return reply

    except Exception as e:
        _logger.error(f"LLM error: {e}")
        raise
