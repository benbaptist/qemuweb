import cv2
import numpy as np
from typing import Dict, Optional, Tuple
import base64
from io import BytesIO
from PIL import Image

class DisplayManager:
    def __init__(self):
        self.vnc_clients: Dict[str, VNCClient] = {}

    def connect_vnc(self, vm_name: str, host: str, port: int, password: Optional[str] = None) -> bool:
        """Connect to a VNC server for a VM."""
        try:
            if vm_name in self.vnc_clients:
                self.disconnect_vnc(vm_name)
            
            client = VNCClient()
            if client.connect(host, port, password):
                self.vnc_clients[vm_name] = client
                return True
            return False
        except Exception as e:
            print(f"Error connecting to VNC: {e}")
            return False

    def disconnect_vnc(self, vm_name: str):
        """Disconnect VNC client for a VM."""
        if vm_name in self.vnc_clients:
            try:
                self.vnc_clients[vm_name].disconnect()
            except Exception:
                pass
            finally:
                del self.vnc_clients[vm_name]

    def get_frame(self, vm_name: str) -> Optional[str]:
        """Get the current frame from VNC as a base64 encoded image."""
        if vm_name not in self.vnc_clients:
            return None
        
        try:
            frame = self.vnc_clients[vm_name].get_frame()
            if frame is not None:
                # Convert frame to RGB format
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # Convert to PIL Image
                image = Image.fromarray(frame_rgb)
                
                # Save to bytes buffer
                buffer = BytesIO()
                image.save(buffer, format='JPEG', quality=95)
                
                # Convert to base64
                return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except Exception as e:
            print(f"Error getting frame: {e}")
        
        return None

    def send_key_event(self, vm_name: str, key_code: int, down: bool) -> bool:
        """Send a key event to the VNC client."""
        if vm_name in self.vnc_clients:
            try:
                self.vnc_clients[vm_name].send_key_event(key_code, down)
                return True
            except Exception as e:
                print(f"Error sending key event: {e}")
        return False

    def send_pointer_event(self, vm_name: str, x: int, y: int, button_mask: int) -> bool:
        """Send a pointer event to the VNC client."""
        if vm_name in self.vnc_clients:
            try:
                self.vnc_clients[vm_name].send_pointer_event(x, y, button_mask)
                return True
            except Exception as e:
                print(f"Error sending pointer event: {e}")
        return False 