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
                logger.debug("Creating VNC client...")
                # Create factory and client
                factory = vnc_api.VNCDoToolFactory()
                client = factory.protocol()
                client.factory = factory
                client.deferred = factory.deferred
                
                # Create a socket and connect
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((self.host, self.port))
                
                # Create transport
                transport = vnc_api.rfb.RFBTransport(sock)
                client.makeConnection(transport)
                
                # Store the client
                self.client = client
                if not self.client:
                    raise Exception("Failed to create VNC client")
                logger.info("VNC client connection established")
                
                # Wait for initial screen update
                logger.info("Waiting for initial screen update...")
                eventlet.sleep(1)
                
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
                    # Get the raw screen data
                    screen = self.client.screen
                    if not screen or not hasattr(screen, 'data'):
                        # Request a screen update
                        try:
                            self.client.framebufferUpdateRequest()
                        except:
                            pass
                        eventlet.sleep(self.frame_interval)
                        continue
                        
                    # Convert raw screen data to PIL Image
                    try:
                        raw_data = screen.data
                        if not raw_data:
                            logger.error("Screen data is empty")
                            eventlet.sleep(self.frame_interval)
                            continue
                            
                        img = Image.frombytes('RGB', (screen.width, screen.height), raw_data)
                        width, height = img.size
                        logger.debug(f"Captured frame {frames_sent + 1} with dimensions {width}x{height}")
                    except Exception as e:
                        logger.error(f"Failed to create image from screen data: {e}", exc_info=True)
                        eventlet.sleep(self.frame_interval)
                        continue
                    
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
                        try:
                            sio.emit('vm_frame', {
                                'frame': img_b64,
                                'width': width,
                                'height': height,
                                'encoding': 'base64'
                            }, room=room)
                            self._last_frame = img_b64
                            frames_sent += 1
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
            
            # Get current screen dimensions from protocol
            protocol = self.client.protocol if hasattr(self.client, 'protocol') else self.client
            screen = protocol.screen
            if not screen:
                logger.error("No screen available for input handling")
                return
                
            max_x = min(screen.width - 1, 65535)  # Max 16-bit unsigned int
            max_y = min(screen.height - 1, 65535)  # Max 16-bit unsigned int
            
            if event_type == "mousemove":
                x = max(0, min(int(data['x']), max_x))
                y = max(0, min(int(data['y']), max_y))
                logger.debug(f"Mouse move to {x},{y}")
                protocol.pointerEvent(x, y, self._buttons)
                
            elif event_type == "mousedown":
                x = max(0, min(int(data['x']), max_x))
                y = max(0, min(int(data['y']), max_y))
                button = data.get('button', 0)  # Button index from 0
                button_mask = 1 << button  # Convert to button mask
                self._buttons |= button_mask  # Add button to mask
                logger.debug(f"Mouse down at {x},{y} button {button} mask {button_mask}")
                protocol.pointerEvent(x, y, self._buttons)
                
            elif event_type == "mouseup":
                x = max(0, min(int(data['x']), max_x))
                y = max(0, min(int(data['y']), max_y))
                button = data.get('button', 0)  # Button index from 0
                button_mask = 1 << button  # Convert to button mask
                self._buttons &= ~button_mask  # Remove button from mask
                logger.debug(f"Mouse up at {x},{y} button {button} mask {button_mask}")
                protocol.pointerEvent(x, y, self._buttons)
                
            elif event_type == "keydown":
                key = data['key']
                logger.debug(f"Key down: {key}")
                protocol.keyEvent(ord(key[0]) if len(key) == 1 else key, down=True)
                
            elif event_type == "keyup":
                key = data['key']
                logger.debug(f"Key up: {key}")
                protocol.keyEvent(ord(key[0]) if len(key) == 1 else key, down=False)
                
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}", exc_info=True)
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False