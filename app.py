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
from vnc_client import VNCClient
import base64
import cv2
import numpy as np
from io import BytesIO
from PIL import Image

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

# Configure root logger
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Get our logger
logger = logging.getLogger(__name__)
logger.handlers = []  # Remove any existing handlers

# Add file handler
app_log_file = os.path.join(LOG_DIR, 'app.log')
file_handler = logging.FileHandler(app_log_file)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Add this line to force debug output for subprocess calls
logger.debug("Subprocess debug enabled")

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
    port: Optional[int] = None  # Add explicit port field
    websocket_port: Optional[int] = None  # Add explicit websocket_port field

    def to_dict(self):
        return {
            "type": self.type,
            "address": self.address,
            "password": self.password,
            "port": self.port,  # Include port in serialization
            "websocket_port": self.websocket_port  # Include websocket_port in serialization
        }

    @staticmethod
    def from_dict(data):
        display = DisplayConfig(
            type=data.get("type", "spice"),
            address=data.get("address", "127.0.0.1"),
            password=data.get("password")
        )
        # Explicitly set port and websocket_port if they exist
        if "port" in data:
            display.port = int(data["port"]) if data["port"] else None
        if "websocket_port" in data:
            display.websocket_port = int(data["websocket_port"]) if data["websocket_port"] else None
        return display

@dataclass_json
@dataclass
class VMConfig:
    name: str
    cpu: str = config['qemu']['default_cpu']
    memory: int = config['qemu']['default_memory']
    cpu_cores: int = 1
    cpu_threads: int = 1
    network_type: str = "user"  # "user", "bridge", "none"
    network_bridge: str = "virbr0"  # Default bridge device
    rtc_base: str = "utc"  # "utc" or "localtime"
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

def list_directory(path: str = None) -> List[Dict]:
    """List directory contents with file information."""
    try:
        if path is None:
            path = os.getcwd()  # Start in current directory
        path = os.path.abspath(path)
        if not os.path.exists(path):
            return []

        items = []
        # Add parent directory entry if not at root
        if path != '/':
            parent_path = os.path.dirname(path)
            items.append({
                'name': '..',
                'path': parent_path,
                'type': 'directory',
                'size': None,
                'modified': None,
                'is_parent': True  # Flag to identify parent directory
            })

        for item in os.scandir(path):
            try:
                is_dir = item.is_dir()
                if is_dir or item.name.endswith(('.qcow2', '.img', '.iso', '.raw')):
                    items.append({
                        'name': item.name,
                        'path': os.path.join(path, item.name),
                        'type': 'directory' if is_dir else 'file',
                        'size': item.stat().st_size if not is_dir else None,
                        'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                        'is_parent': False
                    })
            except (PermissionError, OSError):
                continue

        return sorted(items, key=lambda x: (not x.get('is_parent', False), x['type'] == 'file', x['name'].lower()))
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
    CACHE_FILE = 'qemu_capabilities.json'
    
    def __init__(self):
        self.available = False
        self.architectures = []
        self.has_spice = False
        self.has_kvm = False
        self.version = None
        self.error = None
        self.cpu_models = {}
        self.machine_types = {}
        
        # Try to load from cache first
        if self.load_cache():
            logger.info("Loaded QEMU capabilities from cache")
        else:
            logger.info("Detecting QEMU capabilities...")
            self.detect_capabilities()
            self.save_cache()

    def load_cache(self) -> bool:
        """Load capabilities from cache file if valid."""
        try:
            if os.path.exists(self.CACHE_FILE):
                with open(self.CACHE_FILE, 'r') as f:
                    cache = json.load(f)
                
                # Verify QEMU version matches
                current_version = self._get_qemu_version()
                if current_version and current_version == cache.get('version'):
                    # Verify architectures match
                    current_arches = self._detect_architectures()
                    if set(current_arches) == set(cache.get('architectures', [])):
                        # Cache is valid, load all data
                        self.available = cache['available']
                        self.architectures = cache['architectures']
                        self.has_spice = cache['has_spice']
                        self.has_kvm = cache['has_kvm']
                        self.version = cache['version']
                        self.cpu_models = cache['cpu_models']
                        self.machine_types = cache['machine_types']
                        return True
                    else:
                        logger.info("Architectures changed, cache invalid")
                else:
                    logger.info("QEMU version changed, cache invalid")
            return False
        except Exception as e:
            logger.error(f"Error loading capabilities cache: {str(e)}")
            return False

    def save_cache(self):
        """Save current capabilities to cache file."""
        try:
            cache = {
                'available': self.available,
                'architectures': self.architectures,
                'has_spice': self.has_spice,
                'has_kvm': self.has_kvm,
                'version': self.version,
                'cpu_models': self.cpu_models,
                'machine_types': self.machine_types
            }
            with open(self.CACHE_FILE, 'w') as f:
                json.dump(cache, f, indent=2)
            logger.info("Saved QEMU capabilities to cache")
        except Exception as e:
            logger.error(f"Error saving capabilities cache: {str(e)}")

    def _get_qemu_version(self) -> Optional[str]:
        """Get QEMU version string."""
        try:
            for arch in ['x86_64', 'aarch64', 'arm']:
                result = subprocess.run([f'qemu-system-{arch}', '--version'], 
                                     capture_output=True, text=True)
                if result.returncode == 0:
                    return result.stdout.split('\n')[0]
        except:
            pass
        return None

    def detect_capabilities(self):
        """Detect all QEMU capabilities and populate data."""
        try:
            self.version = self._get_qemu_version()
            if not self.version:
                self.error = "No QEMU system emulators found"
                return

            self.available = True
            self.architectures = self._detect_architectures()
            
            # Detect capabilities for all architectures
            logger.info("Detecting capabilities for all architectures...")
            for arch in self.architectures:
                logger.info(f"Processing {arch}...")
                self.cpu_models[arch] = self.get_cpu_models(arch)
                self.machine_types[arch] = self.get_machine_types(arch)
                logger.info(f"Found {len(self.cpu_models[arch])} CPU models and "
                          f"{len(self.machine_types[arch])} machine types for {arch}")

            # Detect SPICE and KVM support
            self._detect_spice_support()
            self._detect_kvm_support()

        except Exception as e:
            self.error = f"Error detecting QEMU capabilities: {str(e)}"
            logger.error(self.error, exc_info=True)

    def get_cpu_models(self, arch: str) -> List[str]:
        """Get available CPU models for the specified architecture."""
        if arch not in self.cpu_models:
            try:
                cmd = [f'qemu-system-{arch}', '-cpu', 'help']
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    models = []
                    for line in result.stdout.split('\n'):
                        if arch in ['x86_64', 'i386']:
                            # Look for lines containing x86 CPU model names
                            if "x86 " in line and "'" in line:
                                try:
                                    model = line.split("'")[1].strip()
                                    if model:
                                        models.append(model)
                                except IndexError:
                                    continue
                        else:
                            # For non-x86 architectures
                            parts = line.strip().split(' ')
                            if parts and not any(x in parts[0] for x in ['Available', 'Recognized', 'x86']):
                                models.append(parts[0])
                
                    self.cpu_models[arch] = models
                    logger.debug(f"Found {len(models)} CPU models for {arch}")
                else:
                    logger.warning(f"CPU model detection failed for {arch}")
                    self.cpu_models[arch] = []
            except Exception as e:
                logger.error(f"Error detecting CPU models for {arch}: {str(e)}")
                self.cpu_models[arch] = []
        
        return self.cpu_models[arch]

    def get_machine_types(self, arch: str) -> List[str]:
        """Get available machine types for the specified architecture."""
        logger.debug(f"=== Getting machine types for {arch} ===")
        
        # Try direct command first
        try:
            cmd = f"qemu-system-{arch} -machine help"
            logger.debug(f"Running direct command: {cmd}")
            process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate()
            logger.debug(f"Direct command stdout:\n{stdout}")
            logger.debug(f"Direct command stderr:\n{stderr}")
            logger.debug(f"Direct command return code: {process.returncode}")
        except Exception as e:
            logger.debug(f"Direct command failed: {str(e)}")

        if arch not in self.machine_types:
            try:
                cmd = [f'qemu-system-{arch}', '-machine', 'help']
                logger.debug(f"Running command: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    types = []
                    for line in result.stdout.split('\n'):
                        if line.strip() and not line.startswith('Supported'):
                            try:
                                machine = line.split(' ')[0].strip()
                                if machine and not machine.startswith('Type'):
                                    types.append(machine)
                                    logger.debug(f"Found machine type: {machine}")
                            except Exception as e:
                                logger.debug(f"Failed to parse line: {line}, error: {str(e)}")
                
                    self.machine_types[arch] = types
                    logger.info(f"Found {len(types)} machine types for {arch}")
                else:
                    logger.warning(f"Machine type detection failed for {arch}: {result.stderr}")
                    self.machine_types[arch] = []
            except Exception as e:
                logger.error(f"Error detecting machine types for {arch}: {str(e)}", exc_info=True)
                self.machine_types[arch] = []
        
        return self.machine_types[arch]

    def to_dict(self):
        return {
            'available': self.available,
            'architectures': self.architectures,
            'has_spice': self.has_spice,
            'has_kvm': self.has_kvm,
            'version': self.version,
            'error': self.error,
            'cpu_models': self.cpu_models,
            'machine_types': self.machine_types
        }

    def _detect_architectures(self) -> List[str]:
        """Detect available QEMU system architectures."""
        found_arches = set()
        
        # Try using glob to find QEMU binaries
        try:
            import glob
            qemu_binaries = glob.glob('/usr/bin/qemu-system-*')
            for binary in qemu_binaries:
                arch = os.path.basename(binary).replace('qemu-system-', '')
                if arch and os.access(binary, os.X_OK):
                    found_arches.add(arch)
        except:
            pass

        # If that didn't work, search common paths
        if not found_arches:
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
                                arch = file.replace('qemu-system-', '')
                                if arch:
                                    found_arches.add(arch)

        # If still no architectures found, try direct binary checks
        if not found_arches:
            common_arches = ['x86_64', 'i386', 'aarch64', 'arm', 'riscv64', 'ppc64', 'sparc64']
            for arch in common_arches:
                try:
                    result = subprocess.run([f'qemu-system-{arch}', '--version'],
                                         capture_output=True, text=True)
                    if result.returncode == 0:
                        found_arches.add(arch)
                except FileNotFoundError:
                    continue

        return sorted(list(found_arches))

    def _detect_spice_support(self):
        """Detect SPICE support."""
        try:
            cmd = [f'qemu-system-{self.architectures[0]}', '-device', 'help']
            result = subprocess.run(cmd, capture_output=True, text=True)
            self.has_spice = 'spice-' in result.stdout.lower()
            
            if not self.has_spice:
                # Try spice help command
                cmd = [f'qemu-system-{self.architectures[0]}', '-spice', 'help']
                result = subprocess.run(cmd, capture_output=True, text=True)
                self.has_spice = result.returncode == 0
                
            if not self.has_spice:
                # Check general help
                cmd = [f'qemu-system-{self.architectures[0]}', '--help']
                result = subprocess.run(cmd, capture_output=True, text=True)
                self.has_spice = '-spice' in result.stdout
        except:
            self.has_spice = False

    def _detect_kvm_support(self):
        """Detect KVM support."""
        try:
            cmd = [f'qemu-system-{self.architectures[0]}', '-accel', 'help']
            result = subprocess.run(cmd, capture_output=True, text=True)
            self.has_kvm = 'kvm' in result.stdout.lower()

            # Additional check for KVM on Linux
            if os.path.exists('/dev/kvm'):
                try:
                    os.access('/dev/kvm', os.R_OK | os.W_OK)
                    self.has_kvm = True
                except:
                    pass
        except:
            self.has_kvm = False

# Initialize QEMU capabilities
qemu_caps = QEMUCapabilities()
if not qemu_caps.available:
    logger.error(f"QEMU not available: {qemu_caps.error}")
else:
    logger.info(f"QEMU version: {qemu_caps.version}")
    logger.info(f"Available architectures: {', '.join(qemu_caps.architectures)}")
    logger.info(f"SPICE support: {'Yes' if qemu_caps.has_spice else 'No'}")
    logger.info(f"KVM support: {'Yes' if qemu_caps.has_kvm else 'No'}")

def get_process_cpu_usage(pid: int) -> float:
    """Get CPU usage for a process and all its children."""
    try:
        parent = psutil.Process(pid)
        # Get parent and all children processes
        processes = [parent] + parent.children(recursive=True)
        total_cpu = 0
        for process in processes:
            try:
                total_cpu += process.cpu_percent(interval=None)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return total_cpu
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return 0.0

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
        self.cpu_stats = {}  # Store previous CPU times for calculation

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
            "-smp", f"cores={config.cpu_cores},threads={config.cpu_threads}",
            "-m", str(config.memory),
            "-rtc", f"base={config.rtc_base}"
        ]
        
        # Add network configuration
        if config.network_type == "none":
            cmd.extend(["-net", "none"])
        elif config.network_type == "bridge":
            cmd.extend([
                "-netdev", f"bridge,id=net0,br={config.network_bridge}",
                "-device", "virtio-net-pci,netdev=net0"
            ])
        else:  # user networking (default)
            cmd.extend([
                "-netdev", "user,id=net0",
                "-device", "virtio-net-pci,netdev=net0"
            ])
        
        # Add disk devices
        for i, disk in enumerate(config.disks):
            if disk.type == "cdrom":
                drive_args = f"file={disk.path},media=cdrom"
                if disk.readonly:
                    drive_args += ",readonly=on"
            else:
                # For Windows XP, prefer IDE interface with simple configuration
                if config.arch in ['x86_64', 'i386'] and disk.interface == 'ide':
                    # Use legacy style for IDE drives
                    if i == 0:
                        cmd.extend(["-hda", disk.path])
                    elif i == 1:
                        cmd.extend(["-hdb", disk.path])
                    elif i == 2:
                        cmd.extend(["-hdc", disk.path])
                    elif i == 3:
                        cmd.extend(["-hdd", disk.path])
                    continue  # Skip the -drive argument for IDE drives

                # For all other cases, use the new -drive syntax
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
                
                # Use manually configured port if available, otherwise find a free one
                if hasattr(config.display, 'port') and config.display.port:
                    port = config.display.port
                    # Verify the port is available
                    try:
                        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                            s.bind(('127.0.0.1', port))
                    except socket.error:
                        logger.warning(f"Configured VNC port {port} is not available, finding a new port")
                        success, port = find_free_port(VNC_PORT_START, VNC_PORT_RANGE)
                        if not success:
                            raise RuntimeError("No available VNC ports found")
                else:
                    success, port = find_free_port(VNC_PORT_START, VNC_PORT_RANGE)
                    if not success:
                        raise RuntimeError("No available VNC ports found")
                
                # Store the runtime port in the display config
                config.display.port = port
                
                # Calculate VNC display number (port - 5900)
                vnc_display = config.display.port - VNC_PORT_START
                cmd.extend(["-vnc", f":{vnc_display}"])
                
                # Add USB tablet for better mouse handling in VNC
                cmd.extend(["-usbdevice", "tablet"])
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
            if not hasattr(config.display, 'port') or config.display.port is None:
                logger.error(f"Missing port configuration for VM {vm_name}")
                return False

            # For VNC, we need to add the standard VNC port offset
            target_port = config.display.port
            if config.display.type == "vnc":
                target_port = VNC_PORT_START + (config.display.port - VNC_PORT_START)

            # Always allocate a new websocket port for this session
            success, ws_port = find_free_port(SPICE_WS_PORT_START, SPICE_PORT_RANGE)
            if not success:
                raise RuntimeError("No available WebSocket ports found")
            config.display.websocket_port = ws_port

            if config.display.websocket_port is None:
                logger.error(f"Failed to allocate websocket port for VM {vm_name}")
                return False

            # Convert ports to strings and ensure proper formatting
            proxy_cmd = [
                "websockify",
                str(config.display.websocket_port),  # Convert websocket port to string
                f"{config.display.address}:{target_port}"  # Format target as host:port
            ]

            logger.debug(f"Starting WebSocket proxy with command: {' '.join(proxy_cmd)}")
            
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
            # Initialize psutil Process object
            p = psutil.Process(process.pid)
            
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
                    # Get CPU usage for the main process and all children
                    cpu_percent = 0
                    try:
                        # Get all child processes
                        children = p.children(recursive=True)
                        # Sum CPU usage from main process and all children
                        cpu_percent = p.cpu_percent(interval=None)
                        for child in children:
                            try:
                                cpu_percent += child.cpu_percent(interval=None)
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                continue
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        cpu_percent = 0

                    # Get memory info
                    try:
                        mem_info = p.memory_info()
                        # Also sum memory from child processes
                        for child in p.children(recursive=True):
                            try:
                                mem_info = psutil.pmem(
                                    mem_info.rss + child.memory_info().rss,
                                    mem_info.vms + child.memory_info().vms
                                )
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                continue
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        mem_info = psutil.pmem(0, 0)
                    
                    status = {
                        'name': vm_name,
                        'cpu_usage': cpu_percent,
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
                
                # Only clear runtime display ports if they weren't manually configured
                if name in self.vms:
                    config = self.vms[name]
                    # For VNC, keep manually configured ports
                    if config.display.type == 'vnc' and hasattr(config.display, 'port'):
                        # Keep the port configuration
                        pass
                    else:
                        # Clear runtime ports for SPICE or auto-assigned VNC ports
                        if hasattr(config.display, 'port'):
                            delattr(config.display, 'port')
                    # Always clear websocket port as it's runtime-only
                    if hasattr(config.display, 'websocket_port'):
                        delattr(config.display, 'websocket_port')

                return True
            except subprocess.TimeoutExpired:
                process.kill()
                return True
            except Exception as e:
                logger.error(f"Error stopping VM {name}: {str(e)}")
                return False
        return False

    def get_vm_status(self, name: str) -> Dict:
        """Get current status of a VM."""
        config = self.vms.get(name)
        if not config:
            return None

        process = self.processes.get(name)
        if process:
            try:
                cpu_usage = get_process_cpu_usage(process.pid)
                return {
                    'name': name,
                    'running': True,
                    'cpu_usage': cpu_usage,
                    'config': config,
                    'display': config.display.to_dict() if hasattr(config, 'display') else None
                }
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                # Process died or can't access it
                self.processes.pop(name, None)
                return {
                    'name': name,
                    'running': False,
                    'cpu_usage': 0,
                    'config': config,
                    'display': None
                }
        return {
            'name': name,
            'running': False,
            'cpu_usage': 0,
            'config': config,
            'display': None
        }

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

class DisplayManager:
    def __init__(self):
        self.clients = {}  # Dictionary to store VNC clients by VM name
        self.frame_interval = 1/30  # 30 FPS target

    def connect_vnc(self, vm_name, host, port, password=None):
        try:
            client = VNCClient(host, port, password)
            self.clients[vm_name] = {
                'client': client,
                'last_frame_time': 0
            }
            return True
        except Exception as e:
            logger.error(f"Failed to connect VNC for VM {vm_name}: {str(e)}")
            return False

    def disconnect_vnc(self, vm_name):
        if vm_name in self.clients:
            try:
                self.clients[vm_name]['client'].disconnect()
            except:
                pass
            del self.clients[vm_name]

    def get_frame(self, vm_name):
        if vm_name not in self.clients:
            return None

        try:
            client = self.clients[vm_name]['client']
            frame = client.get_frame()
            
            # Convert frame to JPEG
            success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if not success:
                return None
            
            return base64.b64encode(buffer).decode('utf-8')
        except Exception as e:
            logger.error(f"Error getting frame for VM {vm_name}: {str(e)}")
            return None

    def send_key_event(self, vm_name, key_code, down):
        if vm_name in self.clients:
            try:
                self.clients[vm_name]['client'].send_key(key_code, down)
            except Exception as e:
                logger.error(f"Error sending key event for VM {vm_name}: {str(e)}")

    def send_pointer_event(self, vm_name, x, y, button_mask):
        if vm_name in self.clients:
            try:
                self.clients[vm_name]['client'].send_pointer(x, y, button_mask)
            except Exception as e:
                logger.error(f"Error sending pointer event for VM {vm_name}: {str(e)}")


# Initialize managers
display_manager = DisplayManager()
vm_manager = VMManager()

# Add SocketIO event handlers
@socketio.on('connect_display')
def handle_connect_display(data):
    vm_name = data['vm_name']
    vm = vm_manager.vms.get(vm_name)
    if not vm:
        return {'success': False, 'error': 'VM not found'}

    if not vm.running:
        return {'success': False, 'error': 'VM is not running'}

    success = display_manager.connect_vnc(
        vm_name, 
        'localhost', 
        vm.display.port,
        vm.display.password
    )

    if success:
        # Start frame sending loop for this client
        def send_frames():
            while True:
                frame = display_manager.get_frame(vm_name)
                if frame:
                    emit('frame', {'vm_name': vm_name, 'frame': frame})
                eventlet.sleep(display_manager.frame_interval)

        eventlet.spawn(send_frames)
        return {'success': True}
    return {'success': False, 'error': 'Failed to connect to display'}

@socketio.on('disconnect_display')
def handle_disconnect_display(data):
    vm_name = data['vm_name']
    display_manager.disconnect_vnc(vm_name)

@socketio.on('key_event')
def handle_key_event(data):
    vm_name = data['vm_name']
    key_code = data['key_code']
    down = data['down']
    display_manager.send_key_event(vm_name, key_code, down)

@socketio.on('pointer_event')
def handle_pointer_event(data):
    vm_name = data['vm_name']
    x = data['x']
    y = data['y']
    button_mask = data['button_mask']
    display_manager.send_pointer_event(vm_name, x, y, button_mask)

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
            
        # Ensure display configuration is properly handled
        if hasattr(config.display, 'port') and config.display.port:
            # Convert port to int if it's a string
            config.display.port = int(config.display.port)
            
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
