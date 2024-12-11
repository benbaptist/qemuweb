import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request, send_from_directory, Response
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
import random
from typing import Dict, Optional, List, Tuple
from datetime import datetime
from pathlib import Path
import time

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
    "spice": {
        "start_port": 5000,
        "port_range": 200,
        "websocket_start_port": 6000,
        "host": "localhost"
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

app = Flask(__name__, static_url_path='/static', static_folder='static')
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app)

VM_CONFIG_FILE = 'vm_configs.json'
VNC_PORT_START = config['vnc']['start_port']
VNC_PORT_RANGE = config['vnc']['port_range']
SPICE_PORT_START = config['spice']['start_port']
SPICE_PORT_RANGE = config['spice']['port_range']
SPICE_WS_PORT_START = config['spice']['websocket_start_port']

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

@dataclass
class DisplayConfig:
    type: str = "spice"  # "spice" or "vnc"
    address: str = "127.0.0.1"
    password: Optional[str] = None

    def to_dict(self):
        return {
            "type": self.type,
            "address": self.address,
            "password": self.password,
            "port": getattr(self, 'port', None),
            "websocket_port": getattr(self, 'websocket_port', None)
        }

    @staticmethod
    def from_dict(data):
        return DisplayConfig(
            type=data.get("type", "spice"),
            address=data.get("address", "127.0.0.1"),
            password=data.get("password")
        )

@dataclass_json
@dataclass
class VMConfig:
    name: str
    cpu: str = config['qemu']['default_cpu']
    memory: int = config['qemu']['default_memory']
    disks: List[DiskDevice] = field(default_factory=list)
    enable_kvm: bool = False
    headless: bool = False
    display: DisplayConfig = field(default_factory=lambda: DisplayConfig())
    arch: str = "x86_64"
    machine: str = config['qemu']['default_machine']
    additional_args: List[str] = field(default_factory=list)

    def to_dict(self):
        data = super().to_dict()
        data['disks'] = [disk.to_dict() for disk in self.disks]
        data['display'] = self.display.to_dict()
        return data

    @classmethod
    def from_dict(cls, data):
        if 'disks' in data:
            data['disks'] = [DiskDevice.from_dict(d) for d in data['disks']]
        if 'display' in data:
            data['display'] = DisplayConfig.from_dict(data['display'])
        elif 'vnc_port' in data:  # Handle legacy configs
            display = DisplayConfig(type="vnc", port=data['vnc_port'])
            data['display'] = display
            del data['vnc_port']
        return cls(**data)

def find_free_port(start_port: int, port_range: int) -> Tuple[bool, int]:
    """Find a free port in the given range."""
    for port in range(start_port, start_port + port_range):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return True, port
        except socket.error:
            continue
    return False, -1

def generate_random_password(length: int = 12) -> str:
    """Generate a random password for SPICE authentication."""
    import string
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

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

def check_websockify_available():
    """Check if websockify is available in the system."""
    try:
        subprocess.run(['websockify', '--help'], 
                     stdout=subprocess.PIPE, 
                     stderr=subprocess.PIPE, 
                     check=True)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False

class QEMUCapabilities:
    def __init__(self):
        self.available = False
        self.architectures = []
        self.has_spice = False
        self.has_kvm = False
        self.version = None
        self.error = None
        self.detect_capabilities()

    def detect_capabilities(self):
        """Detect QEMU capabilities and available architectures."""
        try:
            # First try to get version from any available QEMU binary
            version_cmd = None
            for arch in ['x86_64', 'aarch64', 'arm']:
                try:
                    result = subprocess.run([f'qemu-system-{arch}', '--version'], 
                                         capture_output=True, text=True)
                    if result.returncode == 0:
                        self.version = result.stdout.split('\n')[0]
                        version_cmd = f'qemu-system-{arch}'
                        break
                except FileNotFoundError:
                    continue

            if not version_cmd:
                self.error = "No QEMU system emulators found"
                return

            self.available = True

            # Get list of all available QEMU system emulators
            try:
                # Try using 'which' to find qemu binaries (works on most Unix systems)
                result = subprocess.run(['which', '-a', 'qemu-system-*'], 
                                     capture_output=True, text=True, shell=True)
                qemu_binaries = result.stdout.strip().split('\n')
            except:
                # Fallback: search in common paths
                qemu_binaries = []
                search_paths = [
                    '/usr/bin',
                    '/usr/local/bin',
                    '/opt/homebrew/bin',
                    '/usr/local/opt/qemu/bin'
                ] + os.environ.get('PATH', '').split(os.pathsep)

                for path in search_paths:
                    if os.path.exists(path):
                        for file in os.listdir(path):
                            if file.startswith('qemu-system-'):
                                full_path = os.path.join(path, file)
                                if os.access(full_path, os.X_OK):
                                    qemu_binaries.append(full_path)

            # Extract architectures from binary names
            found_arches = set()
            for binary in qemu_binaries:
                arch = os.path.basename(binary).replace('qemu-system-', '')
                if arch and arch != '*':  # Filter out the wildcard if 'which' didn't expand
                    found_arches.add(arch)

            # If no architectures found, try another method
            if not found_arches:
                # Try to get supported machines which can indicate architecture support
                try:
                    result = subprocess.run([version_cmd, '-machine', 'help'],
                                         capture_output=True, text=True)
                    if result.returncode == 0:
                        # At minimum, we know this architecture is supported
                        arch = version_cmd.replace('qemu-system-', '')
                        found_arches.add(arch)
                except:
                    pass

                # Try some common architectures directly
                common_arches = ['x86_64', 'aarch64', 'arm', 'riscv64', 'ppc64', 'sparc64']
                for arch in common_arches:
                    try:
                        result = subprocess.run([f'qemu-system-{arch}', '--version'],
                                             capture_output=True, text=True)
                        if result.returncode == 0:
                            found_arches.add(arch)
                    except FileNotFoundError:
                        continue

            self.architectures = sorted(list(found_arches))

            # Check for SPICE support by looking for spice-related options
            try:
                help_output = subprocess.run([version_cmd, '-device', 'help'],
                                          capture_output=True, text=True)
                self.has_spice = any('spice' in line.lower() for line in help_output.stdout.split('\n'))
                
                if not self.has_spice:
                    # Double check with -spice help
                    spice_help = subprocess.run([version_cmd, '-spice', 'help'],
                                             capture_output=True, text=True)
                    self.has_spice = spice_help.returncode == 0
            except:
                self.has_spice = False

            # Check for KVM support
            try:
                kvm_output = subprocess.run([version_cmd, '-accel', 'help'],
                                         capture_output=True, text=True)
                self.has_kvm = 'kvm' in kvm_output.stdout.lower()

                # Additional check for KVM on Linux
                if os.path.exists('/dev/kvm'):
                    try:
                        os.access('/dev/kvm', os.R_OK | os.W_OK)
                        self.has_kvm = True
                    except:
                        pass
            except:
                self.has_kvm = False

            if not self.architectures:
                logger.warning("No QEMU architectures detected despite QEMU being available")

        except Exception as e:
            self.error = f"Error detecting QEMU capabilities: {str(e)}"
            logger.error(f"QEMU capability detection error: {str(e)}", exc_info=True)

    def to_dict(self):
        return {
            'available': self.available,
            'architectures': self.architectures,
            'has_spice': self.has_spice,
            'has_kvm': self.has_kvm,
            'version': self.version,
            'error': self.error
        }

# Initialize QEMU capabilities
qemu_caps = QEMUCapabilities()
if not qemu_caps.available:
    logger.error(f"QEMU not available: {qemu_caps.error}")
else:
    logger.info(f"QEMU version: {qemu_caps.version}")
    logger.info(f"Available architectures: {', '.join(qemu_caps.architectures)}")
    logger.info(f"SPICE support: {'Yes' if qemu_caps.has_spice else 'No'}")
    logger.info(f"KVM support: {'Yes' if qemu_caps.has_kvm else 'No'}")

class VMManager:
    def __init__(self):
        self.vms: Dict[str, VMConfig] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.monitor_threads: Dict[str, threading.Thread] = {}
        self.stop_events: Dict[str, threading.Event] = {}
        self.websocket_processes: Dict[str, subprocess.Popen] = {}  # Combined for both SPICE and VNC
        self.websockify_available = check_websockify_available()
        if not self.websockify_available:
            logger.warning("websockify not found. Remote display support will be limited.")
        self.load_vm_configs()

    def generate_qemu_command(self, config: VMConfig) -> List[str]:
        # Verify QEMU is available for this architecture
        if not qemu_caps.available:
            raise RuntimeError(f"QEMU is not available: {qemu_caps.error}")
        
        if config.arch not in qemu_caps.architectures:
            raise RuntimeError(f"Architecture {config.arch} is not supported by this QEMU installation")

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
        
        # Only add KVM if it's supported and requested
        if config.enable_kvm:
            if not qemu_caps.has_kvm:
                logger.warning(f"KVM requested for VM {config.name} but not available, continuing without KVM")
            else:
                cmd.extend(["-enable-kvm"])
            
        if not config.headless:
            # Try SPICE first if requested and available
            if config.display.type == "spice" and qemu_caps.has_spice:
                success, port = find_free_port(SPICE_PORT_START, SPICE_PORT_RANGE)
                if not success:
                    raise RuntimeError("No available SPICE ports found")
                
                # Store the runtime port in the display config
                config.display.port = port
                
                # Also allocate a WebSocket port
                success, ws_port = find_free_port(SPICE_WS_PORT_START, SPICE_PORT_RANGE)
                if not success:
                    raise RuntimeError("No available WebSocket ports found")
                config.display.websocket_port = ws_port
                
                if not config.display.password:
                    config.display.password = generate_random_password()

                cmd.extend([
                    "-spice", 
                    f"port={config.display.port},addr={config.display.address}"
                    f",password={config.display.password}"
                ])
                
                # Add SPICE agent and GL acceleration
                cmd.extend([
                    "-device", "virtio-serial-pci",
                    "-device", "virtserialport,chardev=spicechannel0,name=com.redhat.spice.0",
                    "-chardev", "spicevmc,id=spicechannel0,name=vdagent",
                    "-device", "qxl-vga,vgamem_mb=64",
                    "-device", "virtio-tablet-pci",
                    "-device", "virtio-keyboard-pci"
                ])
            else:  # Fallback to VNC
                if config.display.type == "spice":
                    logger.warning(f"SPICE requested for VM {config.name} but not available, falling back to VNC")
                    config.display.type = "vnc"
                
                success, port = find_free_port(VNC_PORT_START, VNC_PORT_RANGE)
                if not success:
                    raise RuntimeError("No available VNC ports found")
                
                # Store the runtime port in the display config
                config.display.port = port
                
                # Calculate VNC display number (port - 5900)
                vnc_display = config.display.port - VNC_PORT_START
                cmd.extend(["-vnc", f":{vnc_display}"])
        else:
            cmd.extend(["-nographic"])
            
        if config.additional_args:
            cmd.extend(config.additional_args)
            
        return cmd

    def start_websocket_proxy(self, vm_name: str, config: VMConfig) -> bool:
        if not self.websockify_available:
            logger.warning(f"Cannot start WebSocket proxy for VM {vm_name}: websockify not installed")
            return False

        try:
            if not hasattr(config.display, 'port'):
                logger.error(f"Missing port configuration for VM {vm_name}")
                return False

            # For VNC, we need to add the standard VNC port offset
            target_port = config.display.port
            if config.display.type == "vnc":
                target_port = VNC_PORT_START + (config.display.port - VNC_PORT_START)

            # Allocate a WebSocket port if not already assigned
            if not hasattr(config.display, 'websocket_port'):
                success, ws_port = find_free_port(SPICE_WS_PORT_START, SPICE_PORT_RANGE)
                if not success:
                    raise RuntimeError("No available WebSocket ports found")
                config.display.websocket_port = ws_port

            proxy_cmd = [
                "websockify",
                str(config.display.websocket_port),
                f"{config.display.address}:{target_port}"
            ]
            
            process = subprocess.Popen(
                proxy_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Check if the process started successfully
            time.sleep(1)  # Give the process a moment to start
            if process.poll() is not None:
                _, stderr = process.communicate()
                error_msg = stderr.decode('utf-8').strip()
                logger.error(f"WebSocket proxy failed to start: {error_msg}")
                return False
            
            self.websocket_processes[vm_name] = process
            logger.info(f"Started WebSocket proxy for VM {vm_name} on port {config.display.websocket_port}")
            return True
        except Exception as e:
            logger.error(f"Failed to start WebSocket proxy for VM {vm_name}: {str(e)}")
            return False

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
            config.display.port = None
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
                self.websocket_processes.pop(name, None)
                del self.vms[name]
                self.save_vm_configs()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to remove VM {name}: {str(e)}")
            return False
    
    def start_vm(self, name: str) -> Tuple[bool, Optional[str]]:
        try:
            if name not in self.vms:
                return False, "VM not found"
                
            config = self.vms[name]
            
            # Check if SPICE is requested but not available
            if not config.headless and config.display.type == "spice" and not qemu_caps.has_spice:
                logger.warning(f"Switching VM {name} to VNC mode as SPICE is not available")
                config.display.type = "vnc"
                config.display.port = None  # Reset port to get a new VNC port
                self.save_vm_configs()
            
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
            
            # Check if the process started successfully
            if process.poll() is not None:
                error_msg = f"VM process failed to start with return code {process.returncode}"
                logger.error(error_msg)
                log_file.close()
                return False, error_msg
            
            self.processes[name] = process
            
            # Start WebSocket proxy if needed
            if not config.headless:
                if not self.start_websocket_proxy(name, config):
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    return False, "Failed to start WebSocket proxy"
            
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
            
            return True, None
        except Exception as e:
            error_msg = f"Failed to start VM {name}: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
    
    def _monitor_vm(self, vm_name: str, stop_event: threading.Event, log_file):
        process = self.processes.get(vm_name)
        if not process:
            return
            
        try:
            while not stop_event.is_set():
                if process.poll() is not None:
                    logger.info(f"VM {vm_name} has stopped with return code {process.returncode}")
                    self.processes.pop(vm_name, None)
                    if vm_name in self.websocket_processes:
                        try:
                            self.websocket_processes[vm_name].terminate()
                            self.websocket_processes[vm_name].wait(timeout=5)
                        except:
                            self.websocket_processes[vm_name].kill()
                        finally:
                            self.websocket_processes.pop(vm_name, None)
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
                        'display': self.vms[vm_name].display.to_dict() if not self.vms[vm_name].headless else None
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
                # Stop WebSocket proxy if running
                if name in self.websocket_processes:
                    try:
                        self.websocket_processes[name].terminate()
                        self.websocket_processes[name].wait(timeout=5)
                    except:
                        self.websocket_processes[name].kill()
                    finally:
                        self.websocket_processes.pop(name, None)
                
                # Set the stop event first
                if name in self.stop_events:
                    self.stop_events[name].set()
                
                process.terminate()
                process.wait(timeout=5)
                
                # Clean up
                self.processes.pop(name, None)
                if name in self.monitor_threads:
                    self.monitor_threads[name].join(timeout=5)
                self.monitor_threads.pop(name, None)
                self.stop_events.pop(name, None)
                
                # Clear runtime display ports
                if name in self.vms and hasattr(self.vms[name].display, 'port'):
                    delattr(self.vms[name].display, 'port')
                if name in self.vms and hasattr(self.vms[name].display, 'websocket_port'):
                    delattr(self.vms[name].display, 'websocket_port')

                return True
            except subprocess.TimeoutExpired:
                process.kill()
                return True
            except Exception as e:
                logger.error(f"Error stopping VM {name}: {str(e)}")
                return False
        return False

    def get_vm_status(self, name: str) -> Optional[dict]:
        if name not in self.vms:
            return None
            
        config = self.vms[name]
        process = self.processes.get(name)
        
        status = {
            'name': name,
            'config': config.to_dict(),
            'running': False,
            'display': config.display.to_dict() if not config.headless else None
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

    def _setup_vm_logging(self, vm_name: str) -> tuple:
        """Set up logging for a VM."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        log_path = os.path.join(LOG_DIR, f'{vm_name}_{timestamp}.log')
        log_file = open(log_path, 'w')
        logger.info(f"VM {vm_name} logs will be written to {log_path}")
        return log_file

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
    success, error = vm_manager.start_vm(name)
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': error}), 400

@app.route('/api/vms/<name>/stop', methods=['POST'])
def stop_vm(name):
    success = vm_manager.stop_vm(name)
    return jsonify({'success': success})

@app.route('/api/vms/<name>/status', methods=['GET'])
def get_vm_status(name):
    status = vm_manager.get_vm_status(name)
    if status:
        config = vm_manager.vms.get(name)
        if config and not config.headless:
            status['display'] = config.display.to_dict()
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

@app.route('/api/qemu/capabilities', methods=['GET'])
def get_qemu_capabilities():
    return jsonify(qemu_caps.to_dict())

@app.route('/api/vms/<name>/logs', methods=['GET'])
def get_vm_logs(name):
    try:
        vm = vm_manager.vms.get(name)
        if not vm:
            return jsonify({'success': False, 'error': 'VM not found'}), 404

        # Get the latest log file for this VM
        log_files = sorted([f for f in os.listdir(LOG_DIR) 
                          if f.startswith(f'{name}_')], reverse=True)
        
        if not log_files:
            return jsonify({'success': True, 'logs': []})

        latest_log = os.path.join(LOG_DIR, log_files[0])
        
        # Read the last 1000 lines (configurable)
        try:
            with open(latest_log, 'r') as f:
                # Use deque with maxlen for memory efficiency
                from collections import deque
                lines = deque(f, 1000)
                return jsonify({
                    'success': True,
                    'logs': list(lines)
                })
        except Exception as e:
            logger.error(f"Error reading log file for VM {name}: {str(e)}")
            return jsonify({'success': False, 'error': f'Error reading log file: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error getting logs for VM {name}: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    logger.info(f"Starting web interface on {config['web_interface']['host']}:{config['web_interface']['port']}")
    socketio.run(
        app,
        host=config['web_interface']['host'],
        port=config['web_interface']['port'],
        debug=config['web_interface']['debug'],
        use_reloader=False  # Disable reloader to prevent issues
    ) 
