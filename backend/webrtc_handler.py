"""
WebRTC handler for real-time audio communication
"""

import asyncio
import logging
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaBlackhole
from av import AudioFrame
import numpy as np
from collections import deque

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioProcessor(MediaStreamTrack):
    """Process incoming audio and generate responses"""
    
    kind = "audio"
    
    def __init__(self, audio_handler=None):
        super().__init__()
        self.audio_handler = audio_handler
        self.audio_buffer = deque(maxlen=4096)
        
    async def recv(self):
        """Receive audio frame"""
        frame = await self.recv_rtc()
        
        if frame:
            # Store audio data for processing
            audio_data = frame.to_ndarray()
            self.audio_buffer.extend(audio_data.flatten())
            
            if self.audio_handler:
                await self.audio_handler(audio_data)
        
        return frame


class WebRTCConnection:
    """Manage WebRTC peer connections"""
    
    def __init__(self):
        self.pcs = set()
        self.audio_tracks = {}
        
    async def create_peer_connection(self, offer_sdp):
        """Create a new peer connection"""
        try:
            pc = RTCPeerConnection()
            self.pcs.add(pc)
            
            @pc.on("track")
            async def on_track(track):
                logger.info(f"Receiving {track.kind} track")
                
                if track.kind == "audio":
                    self.audio_tracks[id(pc)] = track
                    await self.process_audio_track(track)
            
            # Set remote description from offer
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type="offer"))
            
            # Create and send answer
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            
            return pc.localDescription.sdp
            
        except Exception as e:
            logger.error(f"Error creating peer connection: {e}")
            raise
    
    async def process_audio_track(self, track):
        """Process incoming audio track"""
        try:
            while True:
                frame = await track.recv()
                
                # Convert to audio data
                audio_data = frame.to_ndarray()
                
                # Process audio (STT, LLM, TTS)
                # This will be connected to your existing modules
                logger.debug(f"Received audio frame: {audio_data.shape}")
                
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
    
    async def close_all(self):
        """Close all peer connections"""
        for pc in self.pcs:
            await pc.close()
        self.pcs.clear()
        self.audio_tracks.clear()


# Global WebRTC manager
webrtc_manager = WebRTCConnection()
