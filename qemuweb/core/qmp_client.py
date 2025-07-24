import socket
import json
import logging
import time
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

class QMPClient:
    """QEMU Monitor Protocol client for power management operations."""
    
    def __init__(self, socket_path: str):
        self.socket_path = socket_path
        self.socket = None
        self.connected = False
        self.capabilities = []
        
    def connect(self, timeout: float = 5.0) -> bool:
        """Connect to QEMU QMP socket."""
        try:
            self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.socket.settimeout(timeout)
            self.socket.connect(self.socket_path)
            
            # Read initial greeting
            greeting = self._read_response()
            if not greeting or 'QMP' not in greeting:
                logger.error(f"Invalid QMP greeting: {greeting}")
                return False
            
            # Enable QMP capabilities
            self._send_command({"execute": "qmp_capabilities"})
            response = self._read_response()
            
            if response and 'return' in response:
                self.connected = True
                logger.info(f"Connected to QMP socket: {self.socket_path}")
                return True
            else:
                logger.error(f"Failed to enable QMP capabilities: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to connect to QMP socket {self.socket_path}: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from QMP socket."""
        self.connected = False
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
    
    def _send_command(self, command: Dict[str, Any]) -> bool:
        """Send a command to QEMU."""
        if not self.socket:
            return False
        
        try:
            message = json.dumps(command) + '\n'
            self.socket.send(message.encode('utf-8'))
            return True
        except Exception as e:
            logger.error(f"Failed to send QMP command: {e}")
            return False
    
    def _read_response(self) -> Optional[Dict[str, Any]]:
        """Read a response from QEMU."""
        if not self.socket:
            return None
        
        try:
            data = self.socket.recv(4096).decode('utf-8')
            if data:
                # Handle multiple JSON objects in the response
                lines = data.strip().split('\n')
                for line in lines:
                    if line.strip():
                        try:
                            return json.loads(line)
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.error(f"Failed to read QMP response: {e}")
        
        return None
    
    def system_powerdown(self) -> bool:
        """Send ACPI shutdown signal to the VM."""
        return self._execute_command("system_powerdown")
    
    def system_reset(self) -> bool:
        """Send hard reset signal to the VM."""
        return self._execute_command("system_reset")
    
    def quit(self) -> bool:
        """Quit QEMU (force shutdown)."""
        return self._execute_command("quit")
    
    def _execute_command(self, command: str) -> bool:
        """Execute a QMP command and check for success."""
        if not self.connected:
            if not self.connect():
                return False
        
        try:
            if not self._send_command({"execute": command}):
                return False
                
            response = self._read_response()
            
            if response and 'return' in response:
                logger.info(f"QMP command '{command}' executed successfully")
                return True
            elif response and 'error' in response:
                logger.error(f"QMP command '{command}' failed: {response['error']}")
                return False
            elif response and 'event' in response:
                # Some commands like system_reset send events instead of return
                logger.info(f"QMP command '{command}' executed successfully (event: {response['event']})")
                return True
            else:
                logger.error(f"Unexpected QMP response for '{command}': {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error executing QMP command '{command}': {e}")
            return False
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.disconnect() 