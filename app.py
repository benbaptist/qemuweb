import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit
from dataclasses import dataclass, field
from dataclasses_json import dataclass_json
import os
import json
import subprocess
import psutil
import threading
import logging
import queue
import socket
from typing import Dict, Optional, List, Tuple
from datetime import datetime
from pathlib import Path

# Load configuration
CONFIG_FILE = 'config.json'
DEFAULT_CONFIG = {
    "web_interface": {
        "host": "0.0.0.0",
        "port": 5000,
        "debug": True
    },
    "vnc": {
        "start_port": 5900,
        "port_range": 200
    },
    "qemu": {
        "default_memory": 1024,
        "default_cpu": "qemu64",
        "default_machine": "q35"
    }
}

def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
        else:
            # Create default config file if it doesn't exist
            with open(CONFIG_FILE, 'w') as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)
            return DEFAULT_CONFIG
    except Exception as e:
        logger.error(f"Error loading config: {str(e)}, using defaults")
        return DEFAULT_CONFIG

config = load_config()

# Configure logging
LOG_DIR = 'vm_logs'
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add a file handler for the main application log
app_log_file = os.path.join(LOG_DIR, 'app.log')
file_handler = logging.FileHandler(app_log_file)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

VM_CONFIG_FILE = 'vm_configs.json'
VNC_PORT_START = config['vnc']['start_port']
VNC_PORT_RANGE = config['vnc']['port_range']

@dataclass
class DiskDevice:
    path: str
    type: str = "hdd"  # "hdd" or "cdrom"
    format: str = "qcow2"
    interface: str = "virtio"  # virtio, ide, scsi
    readonly: bool = False

    def to_dict(self):
        return {
            "path": self.path,
            "type": self.type,
            "format": self.format,
            "interface": self.interface,
            "readonly": self.readonly
        }

    @staticmethod
    def from_dict(data):
        return DiskDevice(
            path=data.get("path", ""),
            type=data.get("type", "hdd"),
            format=data.get("format", "qcow2"),
            interface=data.get("interface", "virtio"),
            readonly=data.get("readonly", False)
        )

@dataclass_json
@dataclass
class VMConfig:
    name: str
    cpu: str = config['qemu']['default_cpu']
    memory: int = config['qemu']['default_memory']  # in MB
    disks: List[DiskDevice] = field(default_factory=list)
    enable_kvm: bool = False
    headless: bool = False
    vnc_port: Optional[int] = None
    arch: str = "x86_64"
    machine: str = config['qemu']['default_machine']
    additional_args: List[str] = field(default_factory=list)

    def to_dict(self):
        data = super().to_dict()
        data['disks'] = [disk.to_dict() for disk in self.disks]
        return data

    @classmethod
    def from_dict(cls, data):
        if 'disks' in data:
            data['disks'] = [DiskDevice.from_dict(d) for d in data['disks']]
        return cls(**data)

def find_free_vnc_port() -> Tuple[bool, int]:
    """Find a free VNC port starting from VNC_PORT_START"""
    for port in range(VNC_PORT_START, VNC_PORT_START + VNC_PORT_RANGE):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return True, port - VNC_PORT_START  # Convert to QEMU VNC display number
        except socket.error:
            continue
    return False, -1

def list_directory(path: str = "/") -> List[Dict]:
    """List directory contents with file information."""
    try:
        path = os.path.abspath(path)
        if not os.path.exists(path):
            return []

        items = []
        for item in os.scandir(path):
            try:
                is_dir = item.is_dir()
                if is_dir or item.name.endswith(('.qcow2', '.img', '.iso', '.raw')):
                    items.append({
                        'name': item.name,
                        'path': os.path.join(path, item.name),
                        'type': 'directory' if is_dir else 'file',
                        'size': item.stat().st_size if not is_dir else None,
                        'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                    })
            except (PermissionError, OSError):
                continue

        return sorted(items, key=lambda x: (x['type'] == 'file', x['name'].lower()))
    except Exception as e:
        logger.error(f"Error listing directory {path}: {str(e)}")
        return []

class VMManager:
    def __init__(self):
        self.vms: Dict[str, VMConfig] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.monitor_threads: Dict[str, threading.Thread] = {}
        self.stop_events: Dict[str, threading.Event] = {}
        self.vnc_ports: Dict[str, int] = {}
        self.load_vm_configs()

    def generate_qemu_command(self, config: VMConfig) -> List[str]:
        cmd = [
            f"qemu-system-{config.arch}",
            "-machine", config.machine,
            "-cpu", config.cpu,
            "-m", str(config.memory)
        ]
        
        # Add disk devices
        for i, disk in enumerate(config.disks):
            if disk.type == "cdrom":
                drive_args = f"file={disk.path},media=cdrom"
                if disk.readonly:
                    drive_args += ",readonly=on"
            else:
                drive_args = f"file={disk.path},format={disk.format}"
                if disk.interface == "virtio":
                    drive_args += ",if=virtio"
                elif disk.interface == "ide":
                    drive_args += f",if=ide,index={i}"
                elif disk.interface == "scsi":
                    drive_args += f",if=scsi,index={i}"
            
            cmd.extend(["-drive", drive_args])
        
        if config.enable_kvm:
            cmd.extend(["-enable-kvm"])
            
        if not config.headless:
            if config.vnc_port is None:
                success, port = find_free_vnc_port()
                if not success:
                    raise RuntimeError("No available VNC ports found")
                config.vnc_port = port
                self.save_vm_configs()
            
            cmd.extend(["-vnc", f":{config.vnc_port}"])
            self.vnc_ports[config.name] = config.vnc_port
            logger.info(f"VM {config.name} assigned VNC port {config.vnc_port} (TCP port {VNC_PORT_START + config.vnc_port})")
        else:
            cmd.extend(["-nographic"])
            
        if config.additional_args:
            cmd.extend(config.additional_args)
            
        return cmd
    
    def load_vm_configs(self):
        try:
            if os.path.exists(VM_CONFIG_FILE):
                with open(VM_CONFIG_FILE, 'r') as f:
                    configs = json.load(f)
                    self.vms = {
                        name: VMConfig.from_dict(config)
                        for name, config in configs.items()
                    }
        except Exception as e:
            logger.error(f"Error loading VM configs: {str(e)}")
            self.vms = {}
            
    def save_vm_configs(self):
        try:
            configs = {
                name: config.to_dict()
                for name, config in self.vms.items()
            }
            with open(VM_CONFIG_FILE, 'w') as f:
                json.dump(configs, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving VM configs: {str(e)}")
    
    def add_vm(self, config: VMConfig) -> bool:
        try:
            # Clear any previously assigned VNC port
            config.vnc_port = None
            self.vms[config.name] = config
            self.save_vm_configs()
            return True
        except Exception as e:
            logger.error(f"Failed to add VM {config.name}: {str(e)}")
            return False
    
    def remove_vm(self, name: str) -> bool:
        try:
            if name in self.vms:
                # Stop the VM if it's running
                if name in self.processes:
                    self.stop_vm(name)
                # Stop monitoring if active
                if name in self.stop_events:
                    self.stop_events[name].set()
                    if name in self.monitor_threads:
                        self.monitor_threads[name].join(timeout=5)
                # Remove from all dictionaries
                self.stop_events.pop(name, None)
                self.monitor_threads.pop(name, None)
                self.vnc_ports.pop(name, None)
                del self.vms[name]
                self.save_vm_configs()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to remove VM {name}: {str(e)}")
            return False
    
    def start_vm(self, name: str) -> bool:
        try:
            if name not in self.vms:
                return False
                
            config = self.vms[name]
            cmd = self.generate_qemu_command(config)
            logger.info(f"Starting VM {name} with command: {' '.join(cmd)}")
            
            # Set up logging for the VM
            log_file = self._setup_vm_logging(name)
            
            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )
            
            self.processes[name] = process
            
            # Create a new stop event for this VM
            self.stop_events[name] = threading.Event()
            
            # Start monitoring thread
            monitor_thread = threading.Thread(
                target=self._monitor_vm,
                args=(name, self.stop_events[name], log_file),
                daemon=True
            )
            self.monitor_threads[name] = monitor_thread
            monitor_thread.start()
            
            return True
        except Exception as e:
            logger.error(f"Failed to start VM {name}: {str(e)}")
            return False
    
    def _monitor_vm(self, vm_name: str, stop_event: threading.Event, log_file):
        process = self.processes.get(vm_name)
        if not process:
            return
            
        try:
            while not stop_event.is_set():
                if process.poll() is not None:
                    logger.info(f"VM {vm_name} has stopped with return code {process.returncode}")
                    self.processes.pop(vm_name, None)
                    self.vnc_ports.pop(vm_name, None)  # Release the VNC port
                    # Use eventlet's spawn to safely emit the event
                    eventlet.spawn(self._emit_vm_stopped, vm_name)
                    break
                    
                try:
                    cpu_percent = psutil.Process(process.pid).cpu_percent()
                    mem_info = psutil.Process(process.pid).memory_info()
                    
                    status = {
                        'name': vm_name,
                        'cpu_percent': cpu_percent,
                        'memory_mb': mem_info.rss / (1024 * 1024),
                        'running': True,
                        'config': self.vms[vm_name].to_dict(),
                        'vnc_port': self.vnc_ports.get(vm_name)
                    }
                    
                    # Use eventlet's spawn to safely emit the event
                    eventlet.spawn(self._emit_vm_status, status)
                except Exception as e:
                    logger.error(f"Error monitoring VM {vm_name}: {str(e)}")
                    break
                    
                eventlet.sleep(2)
        finally:
            # Clean up thread references and close log file
            self.monitor_threads.pop(vm_name, None)
            self.stop_events.pop(vm_name, None)
            try:
                log_file.close()
            except:
                pass
    
    def _emit_vm_status(self, status):
        with app.app_context():
            socketio.emit('vm_status', status)
        
    def _emit_vm_stopped(self, vm_name):
        with app.app_context():
            socketio.emit('vm_stopped', {'name': vm_name})
    
    def stop_vm(self, name: str) -> bool:
        process = self.processes.get(name)
        if process:
            try:
                # Set the stop event first
                if name in self.stop_events:
                    self.stop_events[name].set()
                
                process.terminate()
                process.wait(timeout=5)
                
                # Clean up
                self.processes.pop(name, None)
                self.vnc_ports.pop(name, None)  # Release the VNC port
                if name in self.monitor_threads:
                    self.monitor_threads[name].join(timeout=5)
                self.monitor_threads.pop(name, None)
                self.stop_events.pop(name, None)
                
                return True
            except subprocess.TimeoutExpired:
                process.kill()
                return True
            except Exception as e:
                logger.error(f"Error stopping VM {name}: {str(e)}")
                return False
        return False

    def get_vm_status(self, name: str) -> dict:
        if name not in self.vms:
            return None
            
        config = self.vms[name]
        process = self.processes.get(name)
        
        status = {
            'name': name,
            'config': config.to_dict(),
            'running': False,
            'vnc_port': self.vnc_ports.get(name)
        }
        
        if process:
            try:
                cpu_percent = psutil.Process(process.pid).cpu_percent()
                mem_info = psutil.Process(process.pid).memory_info()
                status.update({
                    'cpu_percent': cpu_percent,
                    'memory_mb': mem_info.rss / (1024 * 1024),
                    'running': True
                })
            except:
                pass
                
        return status

    def get_all_vms(self) -> List[dict]:
        return [
            self.get_vm_status(name) for name in self.vms.keys()
        ]

vm_manager = VMManager()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/vms', methods=['GET'])
def list_vms():
    return jsonify(vm_manager.get_all_vms())

@app.route('/api/vms', methods=['POST'])
def create_vm():
    config = VMConfig.from_dict(request.json)
    success = vm_manager.add_vm(config)
    return jsonify({'success': success})

@app.route('/api/vms/<name>', methods=['DELETE'])
def delete_vm(name):
    vm_manager.stop_vm(name)
    success = vm_manager.remove_vm(name)
    return jsonify({'success': success})

@app.route('/api/vms/<name>/start', methods=['POST'])
def start_vm(name):
    success = vm_manager.start_vm(name)
    return jsonify({'success': success})

@app.route('/api/vms/<name>/stop', methods=['POST'])
def stop_vm(name):
    success = vm_manager.stop_vm(name)
    return jsonify({'success': success})

@app.route('/api/vms/<name>/status', methods=['GET'])
def get_vm_status(name):
    status = vm_manager.get_vm_status(name)
    return jsonify(status)

@app.route('/api/browse', methods=['GET'])
def browse_files():
    path = request.args.get('path', '/')
    return jsonify(list_directory(path))

@app.route('/api/vms/<name>', methods=['PUT'])
def update_vm(name):
    if name not in vm_manager.vms:
        return jsonify({'success': False, 'error': 'VM not found'}), 404
        
    if name in vm_manager.processes:
        return jsonify({'success': False, 'error': 'Cannot modify running VM'}), 400
        
    try:
        config = VMConfig.from_dict(request.json)
        if config.name != name:
            return jsonify({'success': False, 'error': 'VM name cannot be changed'}), 400
            
        vm_manager.vms[name] = config
        vm_manager.save_vm_configs()
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating VM {name}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

if __name__ == '__main__':
    logger.info(f"Starting web interface on {config['web_interface']['host']}:{config['web_interface']['port']}")
    socketio.run(
        app,
        host=config['web_interface']['host'],
        port=config['web_interface']['port'],
        debug=config['web_interface']['debug'],
        use_reloader=False  # Disable reloader to prevent issues
    ) 
