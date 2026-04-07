"""
FastAPI server — application entry point.

Route modules
─────────────
  routes/webrtc.py    POST /offer
  routes/audio.py     POST /audio/process  |  WS /ws/audio
  routes/live.py      WS   /ws/live
  routes/chat.py      POST /chat           |  GET /reset
  routes/study.py     WS   /ws/study
  routes/analytics.py GET  /analytics/*   |  DELETE /analytics/reset
  routes/video_qa.py  POST /video/transcript  |  POST /video/upload
                      POST /video/ask         |  GET  /video/session/{id}

Shared config (OpenAI client, logger) lives in config.py.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv(".env")

from config import logger
from analytics.db import init_db
from webrtc_handler import webrtc_manager

from routes import webrtc, audio, live, chat, study, analytics as analytics_routes
from routes import video_qa
from routes import study_http

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up")
    await init_db()
    yield
    logger.info("Application shutting down")
    await webrtc_manager.close_all()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Voice Assistant WebRTC", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(webrtc.router)
app.include_router(audio.router)
app.include_router(live.router)
app.include_router(chat.router)
app.include_router(study.router)
app.include_router(study_http.router)
app.include_router(analytics_routes.router)
app.include_router(video_qa.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "Voice Assistant WebRTC"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
