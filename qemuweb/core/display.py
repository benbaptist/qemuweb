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

# Mapping from KeyboardEvent.key to vncdotool key names
# vncdotool generally uses X11 keysym names (e.g., 'ctrl_l', 'alt_l', 'shift_l', 'enter', 'esc')
# or simple characters.
KEY_EVENT_MAP = {
    "Control": "ctrl_l",
    "Shift": "shift_l",
    "Alt": "alt_l",
    "Meta": "meta_l",  # 'super_l' or 'win' might also be options depending on VNC server
    "Enter": "enter",
    "Escape": "esc",
    "ArrowUp": "up",
    "ArrowDown": "down",
    "ArrowLeft": "left",
    "ArrowRight": "right",
    "Backspace": "backspace",
    "Delete": "delete",
    "Home": "home",
    "End": "end",
    "PageUp": "pageup",
    "PageDown": "pagedown",
    "Insert": "insert",
    "Tab": "tab",
    " ": "space", # Explicitly map space
    # Function keys
    "F1": "f1", "F2": "f2", "F3": "f3", "F4": "f4",
    "F5": "f5", "F6": "f6", "F7": "f7", "F8": "f8",
    "F9": "f9", "F10": "f10", "F11": "f11", "F12": "f12",
    # Add more mappings if needed, e.g. for numpad keys if data['code'] is used
    # For characters like 'a', 'A', '$', these are typically passed as is.
}

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
                    img = Image.open(img_buffer, formats=['PPM'])
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
                # Client-side already clamps to VM dimensions.
                # VNC protocol max (65535) clamping was redundant here.
                logger.debug(f"Mouse move to {x},{y}")
                self.client.mouseMove(x, y)
                if self._buttons > 0: # If any button is held
                    # mouseDrag is often equivalent to mouseMove with button down
                    # depending on vncdotool's implementation.
                    # Explicitly sending mouseMove ensures position update.
                    # Some VNC servers might need specific drag calls if available in vncdotool,
                    # but mouseMove with buttons pressed is standard.
                    # For now, assuming vncdotool handles mouseMove as drag if buttons are pressed,
                    # or that the VNC server interprets it correctly.
                    # If not, self.client.mouseDrag(x, y, self._buttons) might be needed if API supports it.
                    # vncdotool api.py indicates mouseMove is sufficient.
                    pass # mouseMove already called
                
            elif event_type == "mousedown":
                x = int(data['x'])
                y = int(data['y'])
                # Client-side already clamps to VM dimensions.
                button_from_client = data.get('button', 0)  # 0:left, 1:middle, 2:right
                
                # Assuming vncdotool expects 1-indexed buttons for mouseDown/mouseUp
                # (1:left, 2:middle, 3:right) based on CLI 'click 1'
                vnc_button = button_from_client + 1
                
                button_mask = 1 << button_from_client  # For local _buttons state (0-indexed based mask)
                self._buttons |= button_mask  # Add button to local state

                logger.debug(f"Mouse down at {x},{y} client_button {button_from_client} vnc_button {vnc_button} mask {button_mask}")
                self.client.mouseMove(x, y) # Ensure cursor is at the correct position
                self.client.mouseDown(vnc_button)
                
            elif event_type == "mouseup":
                x = int(data['x'])
                y = int(data['y'])
                # Client-side already clamps to VM dimensions.
                button_from_client = data.get('button', 0)  # 0:left, 1:middle, 2:right

                # Assuming vncdotool expects 1-indexed buttons
                vnc_button = button_from_client + 1

                button_mask = 1 << button_from_client
                self._buttons &= ~button_mask  # Remove button from local state

                logger.debug(f"Mouse up at {x},{y} client_button {button_from_client} vnc_button {vnc_button} mask {button_mask}")
                self.client.mouseMove(x, y) # Ensure cursor is at the correct position
                self.client.mouseUp(vnc_button)
                
            elif event_type == "keydown" or event_type == "keyup":
                original_key_name = data['key']
                
                # Attempt to map common KeyboardEvent.key values to vncdotool/X11 key names
                # For single characters (len == 1), pass them directly.
                # Otherwise, use the map. Case-sensitive for map lookup.
                if len(original_key_name) == 1:
                    vnc_key_name = original_key_name
                else:
                    vnc_key_name = KEY_EVENT_MAP.get(original_key_name)

                if vnc_key_name:
                    action = "down" if event_type == "keydown" else "up"
                    logger.debug(f"Key {action}: original '{original_key_name}', vnc_key '{vnc_key_name}' (code: {data.get('code')})")
                    if event_type == "keydown":
                        self.client.keyDown(vnc_key_name)
                    else:
                        self.client.keyUp(vnc_key_name)
                else:
                    # Fallback for unmapped keys: try sending original_key_name, though it might not work.
                    # Log a warning. Using data['code'] might be an alternative for some keys if 'key' fails.
                    logger.warning(f"No explicit VNC key mapping for '{original_key_name}' (code: {data.get('code')}). Attempting to send as is.")
                    if event_type == "keydown":
                        self.client.keyDown(original_key_name)
                    else:
                        self.client.keyUp(original_key_name)
                        
        except Exception as e:
            logger.error(f"Error handling input event {event_type}: {e}", exc_info=True)
        
    def stop_streaming(self):
        """Stop the frame streaming"""
        logger.info("Stopping frame streaming")
        self._running = False