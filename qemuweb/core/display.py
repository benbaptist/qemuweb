import asyncio
import logging
from typing import Optional, Tuple, Dict, Any
import numpy as np
from vncdotool import api as vnc_api
import socketio
from PIL import Image
import io
import base64
import eventlet
import socket

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
        
    def connect_and_stream(self, sio: socketio.AsyncServer, room: str):
        """Connect to VNC and start streaming frames"""
        try:
            logger.info(f"Attempting to connect to VNC server at {self.host}:{self.port}")
            try:
                logger.debug("Creating VNC client...")
                # Use the high-level connect function
                server = f"{self.host}::{self.port}"
                self.client = vnc_api.connect(server)
                if not self.client:
                    raise Exception("Failed to create VNC client")
                logger.info("VNC client connection established")
            except Exception as e:
                logger.error(f"VNC connection failed: {e}", exc_info=True)
                sio.emit('error', {'message': f'Failed to connect to VNC server: {str(e)}'}, room=room)
                return
                
            self.connected = True
            logger.info(f"Successfully connected to VNC server at {self.host}:{self.port}")
            
            self._running = True
            logger.info(f"Starting frame streaming for room {room}")
            frames_sent = 0
            
            while self._running and self.connected:
                try:
                    logger.debug("Attempting to get frame...")
                    # Capture the screen
                    screen_data = io.BytesIO()
                    screen_data.name = 'screenshot.png'  # Add filename with extension
                    self.client.captureScreen(screen_data)
                    screen_data.seek(0)
                    
                    # Load the image
                    img = Image.open(screen_data)
                    width, height = img.size
                    
                    logger.debug(f"Captured frame with dimensions {width}x{height}")
                    
                    # Convert to base64 encoded PNG
                    try:
                        img_byte_arr = io.BytesIO()
                        img.save(img_byte_arr, format='PNG', optimize=True)
                        img_b64 = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
                    except Exception as e:
                        logger.error(f"Failed to encode frame as PNG: {e}", exc_info=True)
                        eventlet.sleep(self.frame_interval)
                        continue
                    
                    # Only emit if the frame has changed
                    if img_b64 != self._last_frame:
                        logger.debug(f"Sending frame {frames_sent + 1}")
                        try:
                            sio.emit('vm_frame', {
                                'frame': img_b64,
                                'width': width,
                                'height': height,
                                'encoding': 'base64'
                            }, room=room)
                            self._last_frame = img_b64
                            frames_sent += 1
                            logger.debug(f"Frame {frames_sent} sent successfully")
                        except Exception as e:
                            logger.error(f"Failed to emit frame: {e}", exc_info=True)
                            eventlet.sleep(self.frame_interval)
                            continue
                    else:
                        logger.debug("Frame unchanged, skipping")
                        
                except Exception as e:
                    logger.error(f"Error in streaming loop: {e}", exc_info=True)
                    eventlet.sleep(self.frame_interval)
                    continue
                    
                eventlet.sleep(self.frame_interval)
                
            logger.info(f"Streaming stopped after sending {frames_sent} frames")
            
        except Exception as e:
            logger.error(f"Fatal error in connect_and_stream: {e}", exc_info=True)
            try:
                sio.emit('error', {'message': 'Fatal error in display connection'}, room=room)
            except Exception as emit_error:
                logger.error(f"Failed to send error message to client: {emit_error}")
                
    def disconnect(self):
        """Disconnect from the VNC server"""
        if self.client:
            self.client.disconnect()
            self.client = None
        self.connected = False
        self._running = False
        logger.info("Disconnected from VNC server")
        
    def handle_input(self, event_type: str, data: Dict[str, Any]):
        """Handle input events from the web client"""
        if not self.connected or not self.client:
            return
            
        try:
            logger.debug(f"Handling input event: {event_type} with data: {data}")
            if event_type == "mousemove":
                x, y = data['x'], data['y']
                self.client.mouseMove(x, y)
                
            elif event_type == "mousedown":
                x, y = data['x'], data['y']
                button = data.get('button', 1)  # Default to left click
                self.client.mousePress(x, y, button)
                
            elif event_type == "mouseup":
                x, y = data['x'], data['y']
                button = data.get('button', 1)
                self.client.mouseRelease(x, y, button)
                
            elif event_type == "keydown":
                key = data['key']
                self.client.keyPress(key)
                
            elif event_type == "keyup":
                key = data['key']
                self.client.keyRelease(key)
                
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}", exc_info=True)
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False