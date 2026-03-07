"""
Analytics REST routes
  GET    /analytics/summary
  GET    /analytics/sessions
  GET    /analytics/session/{session_id}
  DELETE /analytics/reset
"""

from fastapi import APIRouter
from analytics.db import (
    get_summary, get_sessions, get_session_detail, reset_analytics,
)

router = APIRouter()


@router.get("/analytics/summary")
async def analytics_summary():
    return await get_summary()


@router.get("/analytics/sessions")
async def analytics_sessions():
    return await get_sessions()


@router.get("/analytics/session/{session_id}")
async def analytics_session_detail(session_id: str):
    return await get_session_detail(session_id)


@router.delete("/analytics/reset")
async def analytics_reset():
    await reset_analytics()
    return {"status": "analytics reset"}
