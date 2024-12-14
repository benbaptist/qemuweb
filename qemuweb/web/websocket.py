from flask_socketio import emit
import eventlet
from typing import Dict, Optional
from threading import Event

class WebSocketManager:
    def __init__(self):
        self.frame_events: Dict[str, Event] = {}
        self.active_displays: Dict[str, bool] = {}

    def start_frame_stream(self, vm_name: str, display_manager) -> None:
        """Start streaming frames for a VM."""
        if vm_name in self.active_displays:
            return

        self.active_displays[vm_name] = True
        self.frame_events[vm_name] = Event()

        def send_frames():
            while self.active_displays.get(vm_name, False):
                frame = display_manager.get_frame(vm_name)
                if frame:
                    emit('display_frame', {
                        'vm_name': vm_name,
                        'frame': frame
                    })
                eventlet.sleep(0.033)  # ~30 FPS

        eventlet.spawn(send_frames)

    def stop_frame_stream(self, vm_name: str) -> None:
        """Stop streaming frames for a VM."""
        self.active_displays[vm_name] = False
        if vm_name in self.frame_events:
            self.frame_events[vm_name].set()
            del self.frame_events[vm_name]

    def is_streaming(self, vm_name: str) -> bool:
        """Check if a VM is currently streaming frames."""
        return self.active_displays.get(vm_name, False) 