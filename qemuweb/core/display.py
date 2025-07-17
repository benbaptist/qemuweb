import asyncio
import logging
from typing import Optional, Tuple, Dict, Any
import numpy as np
import socketio
from PIL import Image, UnidentifiedImageError
import io
import base64
import eventlet
import socket
import atexit
import tempfile
import PIL
import time
import hashlib
import cv2

from .vnc_client import EventletVNCClient, VNCError

logger = logging.getLogger(__name__)

# Mapping from KeyboardEvent.key to VNC key codes
# VNC uses X11 keysym values for key codes
KEY_EVENT_MAP = {
    "Control": 0xffe3,  # XK_Control_L
    "Shift": 0xffe1,    # XK_Shift_L
    "Alt": 0xffe9,      # XK_Alt_L
    "Meta": 0xffeb,     # XK_Super_L
    "Enter": 0xff0d,    # XK_Return
    "Escape": 0xff1b,   # XK_Escape
    "ArrowUp": 0xff52,  # XK_Up
    "ArrowDown": 0xff54, # XK_Down
    "ArrowLeft": 0xff51, # XK_Left
    "ArrowRight": 0xff53, # XK_Right
    "Backspace": 0xff08, # XK_BackSpace
    "Delete": 0xffff,   # XK_Delete
    "Home": 0xff50,     # XK_Home
    "End": 0xff57,      # XK_End
    "PageUp": 0xff55,   # XK_Page_Up
    "PageDown": 0xff56, # XK_Page_Down
    "Insert": 0xff63,   # XK_Insert
    "Tab": 0xff09,      # XK_Tab
    " ": 0x0020,        # XK_space
    # Function keys
    "F1": 0xffbe, "F2": 0xffbf, "F3": 0xffc0, "F4": 0xffc1,
    "F5": 0xffc2, "F6": 0xffc3, "F7": 0xffc4, "F8": 0xffc5,
    "F9": 0xffc6, "F10": 0xffc7, "F11": 0xffc8, "F12": 0xffc9,
}

class VMDisplay:
    def __init__(self, host: str = "localhost", port: int = 5900):
        self.host = host
        self.port = port
        self.client = None
        self.connected = False
        self.frame_interval = 1/30  # 30 FPS target (optimized performance)
        self._last_frame = None
        self._running = False
        self._buttons = 0  # Track button state locally
        self._last_mouse_pos = (0, 0)  # Track last mouse position
        self._adaptive_fps = True  # Enable adaptive frame rate
        self._last_frame_time = 0
        self._consecutive_identical_frames = 0
        logger.info(f"VMDisplay initialized with host={host}, port={port}")
        
    def connect_and_stream(self, sio: socketio.AsyncServer, room: str):
        """Connect to VNC and start streaming frames"""
        try:
            logger.info(f"Attempting to connect to VNC server at {self.host}:{self.port}")
            
            # Create the new VNC client
            self.client = EventletVNCClient(self.host, self.port)
            
            # Connect to VNC server
            if not self.client.connect():
                logger.error("Failed to connect to VNC server")
                sio.emit('error', {'message': 'Failed to connect to VNC server'}, room=room)
                return
                
            self.connected = True
            logger.info(f"Successfully connected to VNC server at {self.host}:{self.port}")
            
            self._running = True
            logger.info(f"Starting frame streaming for room {room}")
            frames_sent = 0
            consecutive_errors = 0
            last_resolution = None
            last_health_check = time.time()
            health_check_interval = 10  # Check connection health every 10 seconds
            
            while self._running and self.connected:
                try:
                    # Periodic connection health check
                    current_time = time.time()
                    if current_time - last_health_check > health_check_interval:
                        if not self.client.is_connected():
                            logger.warning("Connection health check failed, attempting reconnect")
                            if not self._attempt_reconnect():
                                logger.error("Failed to reconnect during health check")
                                break
                        last_health_check = current_time
                    
                    # Capture screen using the new VNC client
                    img = self.client.capture_screen()
                    
                    if img is None:
                        consecutive_errors += 1
                        logger.warning("Failed to capture screen, got None")
                        if consecutive_errors > 5:
                            logger.error("Too many consecutive capture failures, stopping stream")
                            break
                        eventlet.sleep(self.frame_interval * 2)
                        continue
                    
                    width, height = img.size
                    
                    # Check if resolution changed
                    current_resolution = (width, height)
                    if last_resolution != current_resolution:
                        if last_resolution:
                            logger.info(f"Resolution changed from {last_resolution} to {current_resolution}")
                            # Emit specific resolution change event for better frontend handling
                            try:
                                sio.emit('resolution_changed', {
                                    'old_width': last_resolution[0],
                                    'old_height': last_resolution[1],
                                    'new_width': width,
                                    'new_height': height
                                }, room=room)
                            except Exception as e:
                                logger.warning(f"Failed to emit resolution change event: {e}")
                        last_resolution = current_resolution
                        self._last_frame = None  # Force full frame update on resolution change
                        self._last_frame_hash = None  # Reset frame hash on resolution change
                    
                    # Convert to base64 - Use JPEG for much better performance
                    img_array = np.array(img)
                    
                    # Fast frame comparison using hash before expensive encoding
                    frame_hash = hashlib.md5(img_array.tobytes()).hexdigest()
                    
                    # Skip encoding if frame hasn't changed (major CPU savings!)
                    if frame_hash == getattr(self, '_last_frame_hash', None):
                        self._consecutive_identical_frames += 1
                        # Don't send duplicate frames, just update counters
                        consecutive_errors = 0  # Reset error counter on successful capture
                        # Much shorter sleep for identical frames to quickly detect changes
                        eventlet.sleep(0.01)  # 10ms instead of 33ms+
                        continue
                    
                    # Frame has changed, proceed with encoding
                    self._consecutive_identical_frames = 0
                    self._last_frame_hash = frame_hash
                    
                    # Use OpenCV for fast JPEG encoding (much faster than PIL)
                    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]  # Good quality/speed balance
                    success, img_encoded = cv2.imencode('.jpg', cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR), encode_param)
                    
                    if not success:
                        logger.warning("Failed to encode image with OpenCV, falling back to PIL")
                        # Fallback to PIL JPEG if OpenCV fails
                        output = io.BytesIO()
                        img.save(output, format='JPEG', quality=85, optimize=True)
                        img_b64 = base64.b64encode(output.getvalue()).decode('utf-8')
                    else:
                        # OpenCV encoded successfully - much faster!
                        img_b64 = base64.b64encode(img_encoded.tobytes()).decode('utf-8')
                    
                    # Send the frame since it has changed
                    current_time = time.time()
                    
                    try:
                        sio.emit('vm_frame', {
                            'frame': img_b64,
                            'width': width,
                            'height': height,
                            'encoding': 'base64',
                            'format': 'jpeg'  # Indicate JPEG format to client
                        }, room=room)
                        self._last_frame = img_b64
                        frames_sent += 1
                        logger.debug(f"Sent frame {frames_sent} with dimensions {width}x{height}")
                        consecutive_errors = 0  # Reset error counter on success
                    except Exception as e:
                        logger.error(f"Failed to emit frame: {e}", exc_info=True)
                        eventlet.sleep(self.frame_interval)
                        continue
                        
                except (UnidentifiedImageError, IOError, VNCError) as e:
                    # Handle image-specific errors
                    consecutive_errors += 1
                    logger.error(f"Image error in streaming loop: {e}")
                    # If we get too many consecutive errors, we might need to reconnect
                    if consecutive_errors > 3:
                        logger.warning("Multiple consecutive errors, attempting to reconnect")
                        if self._attempt_reconnect():
                            consecutive_errors = 0
                        else:
                            logger.error("Failed to reconnect after image errors")
                            break
                    
                    eventlet.sleep(self.frame_interval * 2)  # Slightly longer delay on error
                    continue
                        
                except Exception as e:
                    consecutive_errors += 1
                    logger.error(f"Error in streaming loop: {e}", exc_info=True)
                    
                    # If there are too many consecutive errors, we might need to reconnect
                    if consecutive_errors > 5:
                        logger.warning("Too many consecutive errors, reconnecting to VNC server")
                        if self._attempt_reconnect():
                            consecutive_errors = 0
                        else:
                            logger.error("Failed to reconnect after general errors")
                            break
                    
                    eventlet.sleep(self.frame_interval * 2)  # Slightly longer delay on error
                    continue
                    
                # Only sleep on errors or when no frames are available
                # Let VNC server pace us naturally for maximum frame rate
                # Small yield to prevent blocking other greenlets
                eventlet.sleep(0)
                
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
    
    def _attempt_reconnect(self) -> bool:
        """Attempt to reconnect to the VNC server"""
        try:
            if self.client:
                self.client.disconnect()
            
            self.client = EventletVNCClient(self.host, self.port)
            if self.client.connect():
                logger.info("VNC client reconnected successfully")
                self._last_frame = None  # Force next frame to be sent
                return True
            else:
                logger.error("Failed to reconnect to VNC server")
                return False
        except Exception as e:
            logger.error(f"Error during reconnection attempt: {e}")
            return False
        
    def handle_input(self, event_type: str, data: Dict[str, Any]):
        """Handle input events from the web client"""
        if not self.connected or not self.client:
            return
            
        try:
            logger.debug(f"Handling input event: {event_type} with data: {data}")
            
            if event_type == "mousemove":
                x = int(data['x'])
                y = int(data['y'])
                self._last_mouse_pos = (x, y)
                
                logger.debug(f"Mouse move to {x},{y}")
                self.client.send_pointer_event(x, y, self._buttons)
                
            elif event_type == "mousedown":
                x = int(data['x'])
                y = int(data['y'])
                button_from_client = data.get('button', 0)  # 0:left, 1:middle, 2:right
                
                # Convert client button to VNC button mask
                button_mask = 1 << button_from_client  # VNC uses 1:left, 2:middle, 4:right
                self._buttons |= button_mask  # Add button to local state
                
                logger.debug(f"Mouse down at {x},{y} client_button {button_from_client} mask {button_mask}")
                self._last_mouse_pos = (x, y)
                self.client.send_pointer_event(x, y, self._buttons)
                
            elif event_type == "mouseup":
                x = int(data['x'])
                y = int(data['y'])
                button_from_client = data.get('button', 0)  # 0:left, 1:middle, 2:right
                
                # Convert client button to VNC button mask
                button_mask = 1 << button_from_client
                self._buttons &= ~button_mask  # Remove button from local state
                
                logger.debug(f"Mouse up at {x},{y} client_button {button_from_client} mask {button_mask}")
                self._last_mouse_pos = (x, y)
                self.client.send_pointer_event(x, y, self._buttons)
                
            elif event_type == "keydown" or event_type == "keyup":
                original_key_name = data['key']
                
                # Map keys to VNC key codes
                vnc_key_code = None
                if len(original_key_name) == 1:
                    # Single character - use ASCII/Unicode value
                    vnc_key_code = ord(original_key_name)
                else:
                    # Use the mapping table
                    vnc_key_code = KEY_EVENT_MAP.get(original_key_name)
                
                if vnc_key_code:
                    action = "down" if event_type == "keydown" else "up"
                    is_down = (event_type == "keydown")
                    logger.debug(f"Key {action}: original '{original_key_name}', vnc_code '{vnc_key_code}' (code: {data.get('code')})")
                    self.client.send_key_event(vnc_key_code, is_down)
                else:
                    # Fallback for unmapped keys
                    logger.warning(f"No VNC key mapping for '{original_key_name}' (code: {data.get('code')})")
                        
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}", exc_info=True)
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False