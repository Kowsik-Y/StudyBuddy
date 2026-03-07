"""WebRTC signalling — POST /offer"""

from fastapi import APIRouter
from config import logger
from webrtc_handler import webrtc_manager

router = APIRouter()


@router.post("/offer")
async def handle_offer(offer: dict):
    """
    Handle WebRTC offer from client.
    Expects: {"sdp": "<sdp_string>"}
    """
    try:
        offer_sdp = offer.get("sdp")
        if not offer_sdp:
            return {"error": "Missing SDP in offer"}
        answer_sdp = await webrtc_manager.create_peer_connection(offer_sdp)
        return {"sdp": answer_sdp, "type": "answer"}
    except Exception as e:
        logger.error(f"Error handling offer: {e}")
        return {"error": str(e)}
