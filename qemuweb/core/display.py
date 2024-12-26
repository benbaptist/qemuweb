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
import atexit

logger = logging.getLogger(__name__)

# Don't register the shutdown handler since it causes issues with eventlet
# We'll handle cleanup in the disconnect method instead

class NamedBytesIO(io.BytesIO):
    def __init__(self, *args, **kwargs):
        self.name = 'screenshot.png'
        super().__init__(*args, **kwargs)

class VMDisplay:
    def __init__(self, host: str = "localhost", port: int = 5900):
        self.host = host
        self.port = port
        self.client = None
        self.connected = False
        self.frame_interval = 1/10  # 10 FPS target
        self._last_frame = None
        self._running = False
        self._buttons = 0  # Track button state locally
        logger.info(f"VMDisplay initialized with host={host}, port={port}")
        
    def connect_and_stream(self, sio: socketio.AsyncServer, room: str):
        """Connect to VNC and start streaming frames"""
        try:
            logger.info(f"Attempting to connect to VNC server at {self.host}:{self.port}")
            try:
                # Connect using the proper API
                server = f"{self.host}::{self.port}"  # Format required by vncdotool
                self.client = vnc_api.connect(server, password=None)
                self.client.timeout = 5  # Set a reasonable timeout
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
                    # Create an in-memory buffer for the screen capture with a .png extension
                    img_buffer = NamedBytesIO()
                    
                    # Capture the screen directly to the buffer
                    self.client.captureScreen(img_buffer)
                    img_buffer.seek(0)
                    
                    # Convert to PIL Image for dimensions and processing
                    img = Image.open(img_buffer)
                    width, height = img.size
                    
                    # Convert to base64 with high quality
                    output = io.BytesIO()
                    img.save(output, format='PNG', optimize=False, quality=100)
                    img_b64 = base64.b64encode(output.getvalue()).decode('utf-8')
                    
                    # Only emit if the frame has changed
                    if img_b64 != self._last_frame:
                        try:
                            sio.emit('vm_frame', {
                                'frame': img_b64,
                                'width': width,
                                'height': height,
                                'encoding': 'base64'
                            }, room=room)
                            self._last_frame = img_b64
                            frames_sent += 1
                            logger.debug(f"Sent frame {frames_sent} with dimensions {width}x{height}")
                        except Exception as e:
                            logger.error(f"Failed to emit frame: {e}", exc_info=True)
                            eventlet.sleep(self.frame_interval)
                            continue
                        
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
        finally:
            # Always clean up
            self.disconnect()
                
    def disconnect(self):
        """Disconnect from the VNC server"""
        if self.client:
            try:
                # First stop any ongoing operations
                self._running = False
                self.connected = False
                
                # Then disconnect the client
                self.client.disconnect()
            except:
                pass
            finally:
                self.client = None
                
        logger.info("Disconnected from VNC server")
        
    def handle_input(self, event_type: str, data: Dict[str, Any]):
        """Handle input events from the web client"""
        if not self.connected or not self.client:
            return
            
        try:
            logger.debug(f"Handling input event: {event_type} with data: {data}")
            
            if event_type == "mousemove":
                x = int(data['x'])
                y = int(data['y'])
                logger.debug(f"Mouse move to {x},{y}")
                self.client.mouseMove(x, y)
                if self._buttons > 0:
                    self.client.mouseDrag(x, y)
                
            elif event_type == "mousedown":
                x = int(data['x'])
                y = int(data['y'])
                button = data.get('button', 0)  # Button index from 0
                button_mask = 1 << button  # Convert to button mask
                self._buttons |= button_mask  # Add button to mask
                logger.debug(f"Mouse down at {x},{y} button {button} mask {button_mask}")
                self.client.mouseMove(x, y)
                self.client.mouseDown(button)
                
            elif event_type == "mouseup":
                x = int(data['x'])
                y = int(data['y'])
                button = data.get('button', 0)  # Button index from 0
                button_mask = 1 << button  # Convert to button mask
                self._buttons &= ~button_mask  # Remove button from mask
                logger.debug(f"Mouse up at {x},{y} button {button} mask {button_mask}")
                self.client.mouseMove(x, y)
                self.client.mouseUp(button)
                
            elif event_type == "keydown":
                key = data['key']
                logger.debug(f"Key down: {key}")
                self.client.keyDown(key)
                
            elif event_type == "keyup":
                key = data['key']
                logger.debug(f"Key up: {key}")
                self.client.keyUp(key)
                
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}", exc_info=True)
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False