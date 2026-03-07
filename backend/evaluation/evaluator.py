"""
evaluation/evaluator.py
Computes Word Error Rate (WER) and scores student answers via LLM rubric.
"""

import json
import logging
from jiwer import wer as jiwer_wer
from openai import OpenAI

_logger = logging.getLogger(__name__)

# ── WER ───────────────────────────────────────────────────────────────────────

def compute_wer(reference: str, hypothesis: str) -> float:
    """
    Compute Word Error Rate between a reference answer and the student's
    transcribed speech.  Returns a float in [0, 1] where 0 = perfect.
    Empty reference → returns 0.0 (no penalty when no reference is available).
    """
    if not reference or not hypothesis:
        return 0.0
    try:
        return round(float(jiwer_wer(reference.lower().strip(), hypothesis.lower().strip())), 4)
    except Exception as e:
        _logger.warning(f"WER computation failed: {e}")
        return 0.0


# ── Rubric scoring ────────────────────────────────────────────────────────────

SCORING_PROMPT = """You are an expert technical examiner evaluating a student's spoken answer.

Topic: {topic}
Question asked: {question}
Student's answer: {student_answer}
Ideal model answer: {model_answer}

Score the student's answer on the following 4 criteria, each from 0 to 10:
- accuracy: Is the technical content correct and factually sound?
- terminology: Are appropriate technical terms used correctly?
- completeness: Does the answer cover the key points of the ideal answer?
- clarity: Is the explanation clear, structured, and easy to follow?

Also write 1–3 sentences of constructive feedback.

Respond ONLY with valid JSON in exactly this format:
{{
  "accuracy": <0-10>,
  "terminology": <0-10>,
  "completeness": <0-10>,
  "clarity": <0-10>,
  "feedback": "<string>"
}}"""


def score_answer(
    student_text: str,
    model_answer: str,
    topic: str,
    question: str,
    client: OpenAI,
    model: str = "gpt-4.1-nano",
) -> dict:
    """
    Call the LLM with a structured rubric prompt and parse the JSON response.
    Returns dict with keys: accuracy, terminology, completeness, clarity, feedback, total_score.
    Falls back gracefully on any failure.
    """
    default = {"accuracy": 5, "terminology": 5, "completeness": 5, "clarity": 5,
                "feedback": "Could not evaluate.", "total_score": 5.0}
    if not student_text:
        return default

    prompt = SCORING_PROMPT.format(
        topic=topic or "general",
        question=question or "Explain the concept.",
        student_answer=student_text,
        model_answer=model_answer or "N/A",
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            timeout=20,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        accuracy     = float(data.get("accuracy",     5))
        terminology  = float(data.get("terminology",  5))
        completeness = float(data.get("completeness", 5))
        clarity      = float(data.get("clarity",      5))
        feedback     = str(data.get("feedback", ""))
        total_score  = round((accuracy + terminology + completeness + clarity) / 4, 2)
        return {
            "accuracy": accuracy, "terminology": terminology,
            "completeness": completeness, "clarity": clarity,
            "feedback": feedback, "total_score": total_score,
        }
    except Exception as e:
        _logger.error(f"score_answer failed: {e}")
        return default
