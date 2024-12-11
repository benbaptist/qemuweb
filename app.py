import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
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
VNC_PORT_START = 5900  # QEMU's :0 maps to 5900
VNC_PORT_RANGE = 200   # We'll check ports 5900-6099

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

@dataclass_json
@dataclass
class VMConfig:
    name: str
    cpu: str
    memory: int  # in MB
    disk_path: str
    enable_kvm: bool = False
    headless: bool = False
    vnc_port: Optional[int] = None
    arch: str = "x86_64"
    machine: str = "q35"
    additional_args: List[str] = field(default_factory=list)

class VMManager:
    def __init__(self):
        self.vms: Dict[str, VMConfig] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.monitor_threads: Dict[str, threading.Thread] = {}
        self.stop_events: Dict[str, threading.Event] = {}
        self.vnc_ports: Dict[str, int] = {}  # Track VNC ports in use
        self.load_vm_configs()
        
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
    
    def generate_qemu_command(self, config: VMConfig) -> List[str]:
        cmd = [
            f"qemu-system-{config.arch}",
            "-machine", config.machine,
            "-cpu", config.cpu,
            "-m", str(config.memory)
        ]
        
        if config.disk_path:
            cmd.extend(["-drive", f"file={config.disk_path},format=qcow2"])
        
        if config.enable_kvm:
            cmd.extend(["-enable-kvm"])
            
        if not config.headless:
            # Find an available VNC port if not specified
            if config.vnc_port is None:
                success, port = find_free_vnc_port()
                if not success:
                    raise RuntimeError("No available VNC ports found")
                config.vnc_port = port
                self.save_vm_configs()  # Save the assigned port
            
            cmd.extend(["-vnc", f":{config.vnc_port}"])
            self.vnc_ports[config.name] = config.vnc_port
            logger.info(f"VM {config.name} assigned VNC port {config.vnc_port} (TCP port {VNC_PORT_START + config.vnc_port})")
        else:
            cmd.extend(["-nographic"])
            
        if config.additional_args:
            cmd.extend(config.additional_args)
            
        return cmd
    
    def _setup_vm_logging(self, vm_name: str) -> tuple:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        log_file = os.path.join(LOG_DIR, f'{vm_name}_{timestamp}.log')
        return open(log_file, 'w')
    
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

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5011, use_reloader=False) 
