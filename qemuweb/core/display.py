import asyncio
import logging
from typing import Optional, Tuple, Dict, Any
import numpy as np
from vncdotool import api as vnc_api
import socketio
from PIL import Image
import io
import base64

logger = logging.getLogger(__name__)

class VMDisplay:
    def __init__(self, host: str = "localhost", port: int = 5900):
        self.host = host
        self.port = port
        self.client: Optional[vnc_api.VNCDoToolClient] = None
        self.connected = False
        self.frame_interval = 1/30  # 30 FPS target
        self._last_frame = None
        self._running = False
        logger.info(f"VMDisplay initialized with host={host}, port={port}")
        
    async def connect(self) -> bool:
        """Connect to the VNC server"""
        try:
            logger.info(f"Attempting to connect to VNC server at {self.host}:{self.port}")
            factory = vnc_api.VNCDoToolFactory()
            self.client = await factory.connect(self.host, self.port)
            self.connected = True
            logger.info(f"Successfully connected to VNC server at {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to VNC server: {e}")
            return False
            
    async def disconnect(self):
        """Disconnect from the VNC server"""
        if self.client:
            self.client.disconnect()
            self.client = None
        self.connected = False
        self._running = False
        logger.info("Disconnected from VNC server")
        
    async def get_frame(self) -> Tuple[str, Tuple[int, int]]:
        """Get the current frame as base64 encoded PNG and dimensions"""
        if not self.connected or not self.client:
            raise RuntimeError("Not connected to VNC server")
            
        try:
            # Capture the current screen
            raw_screen = await self.client.capture()
            logger.debug(f"Captured frame with dimensions {raw_screen.width}x{raw_screen.height}")
            
            # Convert to PNG for efficient transport
            img = Image.frombytes('RGB', (raw_screen.width, raw_screen.height), raw_screen.data)
            
            # Convert to base64 encoded PNG
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG', optimize=True)
            img_b64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
            
            return img_b64, (raw_screen.width, raw_screen.height)
        except Exception as e:
            logger.error(f"Error capturing frame: {e}")
            raise
        
    def start_streaming(self, sio: socketio.AsyncServer, room: str):
        """Start streaming frames to connected clients"""
        self._running = True
        
        async def stream_loop():
            logger.info(f"Starting frame streaming for room {room}")
            frames_sent = 0
            
            while self._running and self.connected:
                try:
                    frame_data, dimensions = await self.get_frame()
                    
                    # Only emit if the frame has changed
                    if frame_data != self._last_frame:
                        logger.debug(f"Sending frame {frames_sent + 1}")
                        await sio.emit('vm_frame', {
                            'frame': frame_data,
                            'width': dimensions[0],
                            'height': dimensions[1],
                            'encoding': 'base64'
                        }, room=room)
                        self._last_frame = frame_data
                        frames_sent += 1
                        
                except Exception as e:
                    logger.error(f"Error streaming frame: {e}")
                    break
                    
                await asyncio.sleep(self.frame_interval)
                
            logger.info(f"Streaming stopped after sending {frames_sent} frames")
            
        # Run in eventlet greenthread
        return stream_loop()
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False
        
    async def handle_input(self, event_type: str, data: Dict[str, Any]):
        """Handle input events from the web client"""
        if not self.connected or not self.client:
            return
            
        try:
            logger.debug(f"Handling input event: {event_type} with data: {data}")
            if event_type == "mousemove":
                x, y = data['x'], data['y']
                await self.client.mouseMove(x, y)
                
            elif event_type == "mousedown":
                x, y = data['x'], data['y']
                button = data.get('button', 1)  # Default to left click
                await self.client.mousePress(x, y, button)
                
            elif event_type == "mouseup":
                x, y = data['x'], data['y']
                button = data.get('button', 1)
                await self.client.mouseRelease(x, y, button)
                
            elif event_type == "keydown":
                key = data['key']
                await self.client.keyPress(key)
                
            elif event_type == "keyup":
                key = data['key']
                await self.client.keyRelease(key)
                
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}")