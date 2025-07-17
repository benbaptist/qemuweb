import socket
import struct
import logging
import threading
import time
from typing import Optional, Tuple, List, Any
from PIL import Image
import io
import eventlet
import numpy as np
import cv2

logger = logging.getLogger(__name__)

class VNCError(Exception):
    """VNC-specific exceptions"""
    pass

class EventletVNCClient:
    """A simple VNC client compatible with eventlet that avoids threading conflicts"""
    
    # VNC message types
    FRAMEBUFFER_UPDATE = 0
    SET_COLOUR_MAP_ENTRIES = 1
    BELL = 2
    SERVER_CUT_TEXT = 3
    
    # Client message types
    SET_PIXEL_FORMAT = 0
    SET_ENCODINGS = 2
    FRAMEBUFFER_UPDATE_REQUEST = 3
    KEY_EVENT = 4
    POINTER_EVENT = 5
    CLIENT_CUT_TEXT = 6
    
    # Encoding types
    RAW_ENCODING = 0
    COPY_RECT_ENCODING = 1
    RRE_ENCODING = 2
    HEXTILE_ENCODING = 5
    
    def __init__(self, host: str, port: int, password: Optional[str] = None):
        self.host = host
        self.port = port
        self.password = password
        self.socket = None
        self.connected = False
        self.width = 0
        self.height = 0
        self.pixel_format = None
        self._lock = threading.Lock()
        
    def connect(self) -> bool:
        """Connect to VNC server"""
        try:
            # Create socket with eventlet patching
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(10)  # 10 second timeout
            
            logger.info(f"Connecting to VNC server at {self.host}:{self.port}")
            self.socket.connect((self.host, self.port))
            
            # VNC handshake
            if not self._do_handshake():
                return False
                
            # Security handshake
            if not self._do_security():
                return False
                
            # Client initialization
            if not self._do_client_init():
                return False
                
            self.connected = True
            logger.info("VNC connection established successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to VNC server: {e}")
            self.disconnect()
            return False
    
    def _do_handshake(self) -> bool:
        """Perform VNC version handshake"""
        try:
            # Read server version
            version = self.socket.recv(12).decode('ascii')
            logger.debug(f"Server version: {version.strip()}")
            
            # Send client version (RFB 003.008)
            self.socket.send(b'RFB 003.008\n')
            return True
            
        except Exception as e:
            logger.error(f"VNC handshake failed: {e}")
            return False
    
    def _do_security(self) -> bool:
        """Handle VNC security negotiation"""
        try:
            # Read number of security types
            num_types = struct.unpack('!B', self.socket.recv(1))[0]
            if num_types == 0:
                # Connection failed
                reason_length = struct.unpack('!I', self.socket.recv(4))[0]
                reason = self.socket.recv(reason_length).decode('utf-8')
                raise VNCError(f"Connection failed: {reason}")
            
            # Read security types
            security_types = []
            for _ in range(num_types):
                security_types.append(struct.unpack('!B', self.socket.recv(1))[0])
            
            logger.debug(f"Available security types: {security_types}")
            
            # Choose security type (prefer None (1) if available, otherwise VNC auth (2))
            if 1 in security_types:  # None
                self.socket.send(struct.pack('!B', 1))
                # Read security result
                result = struct.unpack('!I', self.socket.recv(4))[0]
                if result != 0:
                    raise VNCError("Security handshake failed")
                    
            elif 2 in security_types:  # VNC Authentication
                if not self.password:
                    raise VNCError("VNC authentication required but no password provided")
                self.socket.send(struct.pack('!B', 2))
                
                # VNC authentication (simplified - just fail for now)
                raise VNCError("VNC password authentication not yet implemented")
                
            else:
                raise VNCError(f"No supported security types: {security_types}")
            
            return True
            
        except Exception as e:
            logger.error(f"Security negotiation failed: {e}")
            return False
    
    def _do_client_init(self) -> bool:
        """Initialize client and get server info"""
        try:
            # Send client initialization (shared=1)
            self.socket.send(struct.pack('!B', 1))
            
            # Read server initialization (24 bytes: width(2) + height(2) + pixel_format(16) + name_length(4))
            server_init = self.socket.recv(24)
            if len(server_init) < 24:
                raise VNCError(f"Invalid server initialization: got {len(server_init)} bytes, expected 24")
            
            # Parse server initialization
            (self.width, self.height, pixel_format, name_length) = struct.unpack('!HH16sI', server_init)
            
            # Read name string
            name = ""
            if name_length > 0:
                name_data = self.socket.recv(name_length)
                if len(name_data) == name_length:
                    name = name_data.decode('utf-8', errors='ignore')
                else:
                    logger.warning(f"Expected {name_length} bytes for name, got {len(name_data)}")
            
            logger.info(f"Connected to '{name}' ({self.width}x{self.height})")
            
            # Set pixel format (use raw 32-bit RGBA)
            self._set_pixel_format()
            
            # Set encodings
            self._set_encodings()
            
            return True
            
        except Exception as e:
            logger.error(f"Client initialization failed: {e}")
            return False
    
    def _set_pixel_format(self):
        """Set pixel format to 32-bit RGBA"""
        pixel_format = struct.pack('!BBBBHHHBBBxxx',
            32,  # bits-per-pixel
            24,  # depth
            0,   # big-endian-flag
            1,   # true-colour-flag
            255, # red-max
            255, # green-max
            255, # blue-max
            16,  # red-shift
            8,   # green-shift
            0    # blue-shift
        )
        
        message = struct.pack('!Bxxx', self.SET_PIXEL_FORMAT) + pixel_format
        self.socket.send(message)
    
    def _set_encodings(self):
        """Set supported encodings"""
        encodings = [self.RAW_ENCODING]  # Only support RAW for now
        
        message = struct.pack('!BxH', self.SET_ENCODINGS, len(encodings))
        for encoding in encodings:
            message += struct.pack('!i', encoding)
        
        self.socket.send(message)
    
    def capture_screen(self) -> Optional[Image.Image]:
        """Capture the current screen as a PIL Image"""
        if not self.connected:
            return None
            
        try:
            with self._lock:
                # Request framebuffer update
                self._request_framebuffer_update(0, 0, self.width, self.height, incremental=False)
                
                # Read and process framebuffer update
                return self._read_framebuffer_update()
                
        except Exception as e:
            logger.error(f"Screen capture failed: {e}")
            return None
    
    def _request_framebuffer_update(self, x: int, y: int, width: int, height: int, incremental: bool = True):
        """Request a framebuffer update"""
        message = struct.pack('!BBHHHH', 
            self.FRAMEBUFFER_UPDATE_REQUEST,
            1 if incremental else 0,
            x, y, width, height
        )
        self.socket.send(message)
    
    def _recv_all(self, size: int) -> Optional[bytes]:
        """Receive exactly size bytes from socket"""
        data = b''
        while len(data) < size:
            try:
                chunk = self.socket.recv(size - len(data))
                if not chunk:
                    return None
                data += chunk
            except Exception as e:
                logger.error(f"Error receiving {size} bytes: {e}")
                return None
        return data
    
    def _read_framebuffer_update(self) -> Optional[Image.Image]:
        """Read a framebuffer update message with optimized processing"""
        if not self.socket:
            return None
            
        try:
            # Store original timeout
            original_timeout = self.socket.gettimeout()
            self.socket.settimeout(5.0)  # 5 second timeout for frame reads
            
            try:
                # Read message header (4 bytes)
                header = self._recv_all(4)
                if not header:
                    return None
                    
                msg_type, padding, num_rects = struct.unpack('!BBH', header)
                
                if msg_type != self.FRAMEBUFFER_UPDATE:
                    logger.warning(f"Unexpected message type: {msg_type}")
                    return None
                    
                logger.debug(f"Framebuffer update: {num_rects} rectangles")
            finally:
                # Restore original timeout
                self.socket.settimeout(original_timeout)
            
            # Create numpy array for fast pixel manipulation
            image_array = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            
            # Process rectangles
            for rect_idx in range(num_rects):
                # Read rectangle header (12 bytes)
                rect_header = self._recv_all(12)
                if not rect_header:
                    logger.error(f"Failed to read rectangle {rect_idx} header")
                    return None
                    
                x, y, w, h, encoding = struct.unpack('!HHHHi', rect_header)
                logger.debug(f"Rectangle {rect_idx}: ({x},{y}) {w}x{h} encoding={encoding}")
                
                if encoding == self.RAW_ENCODING:
                    # For RAW encoding, each pixel is typically 4 bytes (BGRA)
                    bytes_per_pixel = 4
                    data_size = w * h * bytes_per_pixel
                    
                    pixel_data = self._recv_all(data_size)
                    if not pixel_data:
                        logger.error(f"Failed to read {data_size} bytes for rectangle {rect_idx}")
                        return None
                    
                    # Bounds checking
                    if y + h > self.height or x + w > self.width:
                        logger.warning(f"Rectangle bounds exceed image size: ({x},{y}) {w}x{h}")
                        continue
                    
                    # Convert bytes to numpy array for vectorized processing
                    pixel_array = np.frombuffer(pixel_data, dtype=np.uint8)
                    pixel_array = pixel_array.reshape((h, w, bytes_per_pixel))
                    
                    # Vectorized BGRA to RGB conversion (much faster than loops!)
                    # Extract BGR channels and ignore alpha
                    bgr_data = pixel_array[:, :, :3]  # Take only BGR, skip alpha
                    rgb_data = bgr_data[:, :, ::-1]   # Reverse to get RGB
                    
                    # Copy to the correct region of the image
                    image_array[y:y+h, x:x+w] = rgb_data
                    
                else:
                    logger.warning(f"Unsupported encoding: {encoding}")
                    # Skip this rectangle data - we need to read and discard it
                    # For now, just return None to avoid getting stuck
                    return None
            
            # Convert numpy array back to PIL Image
            return Image.fromarray(image_array)
            
        except Exception as e:
            logger.error(f"Failed to read framebuffer update: {e}", exc_info=True)
            return None
    
    def send_key_event(self, key: int, down: bool):
        """Send a key event"""
        if not self.connected:
            return
            
        try:
            message = struct.pack('!BBxxI', 
                self.KEY_EVENT,
                1 if down else 0,
                key
            )
            self.socket.send(message)
            
        except Exception as e:
            logger.error(f"Failed to send key event: {e}")
    
    def send_pointer_event(self, x: int, y: int, button_mask: int):
        """Send a pointer (mouse) event"""
        if not self.connected:
            return
            
        try:
            # Clamp coordinates
            x = max(0, min(x, self.width - 1))
            y = max(0, min(y, self.height - 1))
            
            message = struct.pack('!BBHH', 
                self.POINTER_EVENT,
                button_mask,
                x, y
            )
            self.socket.send(message)
            
        except Exception as e:
            logger.error(f"Failed to send pointer event: {e}")
    
    def is_connected(self) -> bool:
        """Check if the VNC connection is still alive"""
        if not self.connected or not self.socket:
            return False
        
        try:
            # Try to send a small framebuffer update request to test connection
            # This is non-destructive and will tell us if the connection is dead
            original_timeout = self.socket.gettimeout()
            self.socket.settimeout(1.0)  # Short timeout for health check
            
            try:
                # Request a small 1x1 area update (incremental)
                message = struct.pack('!BBHHHH', 
                    self.FRAMEBUFFER_UPDATE_REQUEST,
                    1,  # incremental
                    0, 0, 1, 1
                )
                self.socket.send(message)
                return True
            finally:
                self.socket.settimeout(original_timeout)
                
        except Exception as e:
            logger.debug(f"Connection health check failed: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from VNC server"""
        self.connected = False
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        logger.info("Disconnected from VNC server") 