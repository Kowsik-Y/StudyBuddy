"""
analytics/db.py — SQLite-backed storage for sessions, evaluations, latency.
Uses aiosqlite for async access from FastAPI.
"""

import os
import aiosqlite
from datetime import datetime
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "study_analytics.db")

# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    mode        TEXT NOT NULL,
    topic       TEXT,
    language    TEXT DEFAULT 'en',
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    avg_score   REAL,
    avg_wer     REAL,
    turn_count  INTEGER DEFAULT 0
);
"""

CREATE_EVALUATIONS = """
CREATE TABLE IF NOT EXISTS evaluations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    turn          INTEGER NOT NULL,
    student_text  TEXT,
    model_answer  TEXT,
    wer           REAL,
    accuracy      REAL,
    terminology   REAL,
    completeness  REAL,
    clarity       REAL,
    total_score   REAL,
    feedback      TEXT,
    timestamp     TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
"""

CREATE_LATENCY = """
CREATE TABLE IF NOT EXISTS latency_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT NOT NULL,
    turn              INTEGER NOT NULL,
    stt_ms            REAL,
    llm_ms            REAL,
    tts_ms            REAL,
    total_ms          REAL,
    audio_duration_ms REAL,
    timestamp         TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
"""


async def init_db():
    """Create tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_SESSIONS)
        await db.execute(CREATE_EVALUATIONS)
        await db.execute(CREATE_LATENCY)
        # Migrate existing DBs that lack the audio_duration_ms column
        try:
            await db.execute("ALTER TABLE latency_logs ADD COLUMN audio_duration_ms REAL")
        except Exception:
            pass  # column already exists
        await db.commit()


# ── Write helpers ─────────────────────────────────────────────────────────────

async def insert_session(session_id: str, mode: str, language: str = "en", topic: str = "") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO sessions (id, mode, topic, language, started_at) VALUES (?,?,?,?,?)",
            (session_id, mode, topic, language, datetime.utcnow().isoformat()),
        )
        await db.commit()


async def insert_evaluation(
    session_id: str,
    turn: int,
    student_text: str,
    model_answer: str,
    wer: float,
    accuracy: float,
    terminology: float,
    completeness: float,
    clarity: float,
    total_score: float,
    feedback: str,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO evaluations
               (session_id, turn, student_text, model_answer, wer, accuracy,
                terminology, completeness, clarity, total_score, feedback, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (session_id, turn, student_text, model_answer, wer, accuracy,
             terminology, completeness, clarity, total_score, feedback,
             datetime.utcnow().isoformat()),
        )
        # Update session averages
        await db.execute(
            """UPDATE sessions SET
               avg_score  = (SELECT AVG(total_score) FROM evaluations WHERE session_id=?),
               avg_wer    = (SELECT AVG(wer)         FROM evaluations WHERE session_id=?),
               turn_count = (SELECT COUNT(*)         FROM evaluations WHERE session_id=?)
               WHERE id = ?""",
            (session_id, session_id, session_id, session_id),
        )
        await db.commit()


async def insert_latency(
    session_id: str,
    turn: int,
    stt_ms: float,
    llm_ms: float,
    tts_ms: float,
    audio_duration_ms: float = 0.0,
) -> None:
    total_ms = stt_ms + llm_ms + tts_ms
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO latency_logs
               (session_id, turn, stt_ms, llm_ms, tts_ms, total_ms, audio_duration_ms, timestamp)
               VALUES (?,?,?,?,?,?,?,?)""",
            (session_id, turn, stt_ms, llm_ms, tts_ms, total_ms,
             audio_duration_ms if audio_duration_ms > 0 else None,
             datetime.utcnow().isoformat()),
        )
        await db.commit()


async def close_session(session_id: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE sessions SET ended_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), session_id),
        )
        await db.commit()


# ── Read helpers ──────────────────────────────────────────────────────────────

async def get_sessions(limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_session_detail(session_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM sessions WHERE id=?", (session_id,)
        ) as cur:
            session = dict(await cur.fetchone() or {})
        async with db.execute(
            "SELECT * FROM evaluations WHERE session_id=? ORDER BY turn", (session_id,)
        ) as cur:
            evals = [dict(r) for r in await cur.fetchall()]
        async with db.execute(
            "SELECT * FROM latency_logs WHERE session_id=? ORDER BY turn", (session_id,)
        ) as cur:
            latency = [dict(r) for r in await cur.fetchall()]
    return {"session": session, "evaluations": evals, "latency": latency}


async def get_summary():
    """Return aggregate data for the analytics dashboard."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # avg score per topic (across all sessions)
        async with db.execute(
            """SELECT topic, mode,
               AVG(avg_score) as avg_score,
               AVG(avg_wer)   as avg_wer,
               COUNT(*)       as session_count
               FROM sessions WHERE topic IS NOT NULL AND topic != ''
               GROUP BY topic, mode
               ORDER BY avg_score DESC"""
        ) as cur:
            topic_stats = [dict(r) for r in await cur.fetchall()]

        # Per-session trend (last 30 sessions)
        async with db.execute(
            """SELECT id, mode, topic, language, started_at, avg_score, avg_wer, turn_count
               FROM sessions ORDER BY started_at DESC LIMIT 30"""
        ) as cur:
            trend = [dict(r) for r in await cur.fetchall()]

        # Avg latency per session (include inverse RTF and TAT)
        async with db.execute(
            """SELECT session_id,
               AVG(stt_ms) as stt_ms, AVG(llm_ms) as llm_ms,
               AVG(tts_ms) as tts_ms, AVG(total_ms) as total_ms,
               AVG(total_ms) as tat_ms,
               AVG(CASE WHEN stt_ms > 0 AND audio_duration_ms > 0
                        THEN audio_duration_ms / stt_ms ELSE NULL END) as inverse_rtf
               FROM latency_logs GROUP BY session_id"""
        ) as cur:
            latency = [dict(r) for r in await cur.fetchall()]

    return {"topic_stats": topic_stats, "trend": trend, "latency": latency}


async def reset_analytics():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM latency_logs")
        await db.execute("DELETE FROM evaluations")
        await db.execute("DELETE FROM sessions")
        await db.commit()
