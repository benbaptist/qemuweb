from dataclasses import dataclass, field
from dataclasses_json import dataclass_json
from typing import Dict, Optional, List, Tuple
import threading
import subprocess
import psutil
import logging
import json
from pathlib import Path
from datetime import datetime
import time
import os
import atexit
from ..config.manager import config_manager, DEFAULT_CONFIG

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
    type: str = "vnc"  # Will be set based on QEMU capabilities
    address: str = "127.0.0.1"
    password: Optional[str] = None
    port: Optional[int] = None
    websocket_port: Optional[int] = None

    def to_dict(self):
        return {
            "type": self.type,
            "address": self.address,
            "password": self.password,
            "port": self.port,
            "websocket_port": self.websocket_port
        }

    @staticmethod
    def from_dict(data, qemu_caps=None):
        # Default to VNC if SPICE is not available
        default_type = "spice" if qemu_caps and qemu_caps.has_spice else "vnc"
        display_type = data.get("type", default_type)
        
        # Force VNC if SPICE is requested but not available
        if display_type == "spice" and (not qemu_caps or not qemu_caps.has_spice):
            display_type = "vnc"
            logging.warning("SPICE requested but not available, falling back to VNC")
        
        display = DisplayConfig(
            type=display_type,
            address=data.get("address", "127.0.0.1"),
            password=data.get("password")
        )
        if "port" in data:
            display.port = int(data["port"]) if data["port"] else None
        if "websocket_port" in data:
            display.websocket_port = int(data["websocket_port"]) if data["websocket_port"] else None
        return display

@dataclass_json
@dataclass
class VMConfig:
    name: str
    cpu: str = DEFAULT_CONFIG['qemu']['default_cpu']
    memory: int = DEFAULT_CONFIG['qemu']['default_memory']
    cpu_cores: int = 1
    cpu_threads: int = 1
    network_type: str = "user"
    network_bridge: str = "virbr0"
    rtc_base: str = "utc"
    disks: List[DiskDevice] = field(default_factory=list)
    enable_kvm: bool = False
    headless: bool = False
    display: DisplayConfig = field(default_factory=lambda: DisplayConfig())
    arch: str = "x86_64"
    machine: str = DEFAULT_CONFIG['qemu']['default_machine']
    additional_args: List[str] = field(default_factory=list)

    def to_dict(self):
        data = {
            'name': self.name,
            'cpu': self.cpu,
            'memory': self.memory,
            'cpu_cores': self.cpu_cores,
            'cpu_threads': self.cpu_threads,
            'network_type': self.network_type,
            'network_bridge': self.network_bridge,
            'rtc_base': self.rtc_base,
            'disks': [disk.to_dict() for disk in self.disks],
            'enable_kvm': self.enable_kvm,
            'headless': self.headless,
            'display': self.display.to_dict(),
            'arch': self.arch,
            'machine': self.machine,
            'additional_args': self.additional_args
        }
        return data

    @staticmethod
    def create_from_dict(data: Dict, qemu_caps=None) -> 'VMConfig':
        """Create a VMConfig instance from a dictionary, with QEMU capabilities."""
        config_data = data.copy()
        
        # Handle disks
        if 'disks' in config_data:
            config_data['disks'] = [DiskDevice.from_dict(d) for d in config_data['disks']]
        else:
            config_data['disks'] = []

        # Handle display
        if 'display' in config_data:
            config_data['display'] = DisplayConfig.from_dict(config_data['display'], qemu_caps)
        elif 'vnc_port' in config_data:  # Legacy support
            config_data['display'] = DisplayConfig(type="vnc", port=config_data.pop('vnc_port'))
        else:
            config_data['display'] = DisplayConfig()  # Always default to VNC

        # Get current config for defaults
        current_config = config_manager.config

        # Ensure all fields have default values
        defaults = {
            'cpu': current_config['qemu']['default_cpu'],
            'memory': current_config['qemu']['default_memory'],
            'cpu_cores': 1,
            'cpu_threads': 1,
            'network_type': 'user',
            'network_bridge': 'virbr0',
            'rtc_base': 'utc',
            'enable_kvm': False,
            'headless': False,
            'arch': 'x86_64',
            'machine': current_config['qemu']['default_machine'],
            'additional_args': []
        }
        
        for key, default in defaults.items():
            if key not in config_data:
                config_data[key] = default

        return VMConfig(**config_data)

class VMManager:
    def __init__(self):
        self.vms: Dict[str, VMConfig] = {}
        self.processes: Dict[str, subprocess.Popen] = {}
        self.stop_events: Dict[str, threading.Event] = {}
        self.monitor_threads: Dict[str, threading.Thread] = {}
        self.status_callback = None
        self.stopped_callback = None
        
        self.load_vm_configs()
        # Register cleanup on exit
        atexit.register(self._cleanup_all_vms)
        
    def _cleanup_all_vms(self):
        """Clean up all running VMs on program exit."""
        logging.info("Cleaning up all running VMs...")
        # Get list of running VMs first since we'll be modifying the processes dict
        running_vms = [(name, process) for name, process in self.processes.items() if process.poll() is None]
        
        for vm_name, process in running_vms:
            try:
                logging.info(f"Stopping VM {vm_name} during cleanup")
                self.stop_vm(vm_name)
            except Exception as e:
                logging.error(f"Error stopping VM {vm_name} during cleanup: {e}")
                # Force kill if stop_vm failed
                try:
                    process.kill()
                    process.wait(timeout=1)
                except Exception as kill_error:
                    logging.error(f"Error force killing VM {vm_name}: {kill_error}")

    def set_callbacks(self, status_callback, stopped_callback):
        self.status_callback = status_callback
        self.stopped_callback = stopped_callback

    def load_vm_configs(self):
        """Load VM configurations from file."""
        try:
            data = config_manager.load_vm_configs()
            # Handle both old (dict) and new (list) formats
            if isinstance(data, dict):
                for name, config in data.items():
                    vm_config = VMConfig.from_dict(config)
                    self.vms[name] = vm_config
            else:  # list format
                for vm_data in data:
                    vm_config = VMConfig.from_dict(vm_data)
                    self.vms[vm_config.name] = vm_config
            logging.info(f"Loaded {len(self.vms)} VM configurations")
        except Exception as e:
            logging.error(f"Error loading VM configs: {str(e)}")
            self.vms = {}

    def save_vm_configs(self):
        """Save VM configurations to file."""
        try:
            data = [vm.to_dict() for vm in self.vms.values()]
            config_manager.save_vm_configs(data)
            logging.info(f"Saved {len(self.vms)} VM configurations")
        except Exception as e:
            logging.error(f"Error saving VM configs: {e}")

    def get_all_vms(self) -> List[Dict]:
        """Get all VM configurations with their current status."""
        return [self.get_vm_status(name) for name in self.vms.keys() if self.get_vm_status(name) is not None]

    def add_vm(self, config_data: Dict) -> bool:
        """Add a new VM configuration."""
        try:
            vm_config = VMConfig.create_from_dict(config_data)
            if vm_config.name in self.vms:
                logging.error(f"VM with name {vm_config.name} already exists")
                return False
            self.vms[vm_config.name] = vm_config
            self.save_vm_configs()
            logging.info(f"Added new VM: {vm_config.name}")
            return True
        except Exception as e:
            logging.error(f"Error adding VM: {e}")
            return False

    def update_vm(self, name: str, config_data: Dict, qemu_caps=None) -> bool:
        """Update a VM configuration."""
        try:
            if name not in self.vms:
                logging.error(f"VM {name} not found")
                return False
            
            if name in self.processes:
                logging.error(f"Cannot modify running VM {name}")
                return False
            
            vm_config = VMConfig.create_from_dict(config_data, qemu_caps)
            if vm_config.name != name:
                logging.error(f"Cannot change VM name from {name} to {vm_config.name}")
                return False
            
            self.vms[name] = vm_config
            self.save_vm_configs()
            logging.info(f"Updated VM: {name}")
            return True
        except Exception as e:
            logging.error(f"Error updating VM {name}: {e}")
            return False

    def remove_vm(self, name: str) -> bool:
        """Remove a VM configuration."""
        if name in self.vms:
            if name in self.processes:
                self.stop_vm(name)
            del self.vms[name]
            self.save_vm_configs()
            logging.info(f"Removed VM: {name}")
            return True
        return False

    def start_vm(self, name: str) -> Tuple[bool, Optional[str]]:
        """Start a VM."""
        if name not in self.vms:
            return False, "VM not found"
        
        if name in self.processes and self.processes[name].poll() is None:
            return False, "VM is already running"
        
        try:
            vm = self.vms[name]
            cmd = self._build_qemu_command(vm)
            logging.info(f"Starting VM {name} with command: {' '.join(cmd)}")
            
            # Set up logging for the VM
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            log_path = config_manager.get_log_path(name, timestamp)
            log_file = open(log_path, 'w')
            logging.info(f"VM {name} logs will be written to {log_path}")
            
            # Start the process
            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                # Don't use preexec_fn on macOS
                start_new_session=True if os.name != 'nt' else False
            )
            
            # Wait a short time to check if process started successfully
            time.sleep(1)
            if process.poll() is not None:
                error_msg = "Process failed to start"
                try:
                    with open(log_path, 'r') as f:
                        error_msg = f.read().strip()
                except:
                    pass
                log_file.close()
                return False, error_msg
            
            self.processes[name] = process
            self._start_monitor_thread(name)
            
            # Wait for display to be ready if not headless
            if not vm.headless and hasattr(vm.display, 'port'):
                time.sleep(2)  # Give VNC/SPICE server time to start
            
            logging.info(f"Started VM: {name}")
            return True, None
            
        except Exception as e:
            error_msg = f"Failed to start VM: {str(e)}"
            logging.error(error_msg)
            return False, error_msg

    def stop_vm(self, name: str) -> bool:
        """Stop a VM."""
        if name not in self.processes:
            return False
        
        try:
            process = self.processes[name]
            if process.poll() is None:  # Process is still running
                # Try graceful shutdown first
                process.terminate()
                try:
                    process.wait(timeout=5)  # Wait up to 5 seconds for graceful shutdown
                except subprocess.TimeoutExpired:
                    process.kill()  # Force kill if it doesn't shut down gracefully
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass
            
            # Signal monitor thread to stop
            if name in self.stop_events:
                self.stop_events[name].set()
            
            # Clean up
            self.processes.pop(name, None)
            self.monitor_threads.pop(name, None)
            self.stop_events.pop(name, None)
            
            logging.info(f"Stopped VM: {name}")
            
            if self.stopped_callback:
                self.stopped_callback(name)
            
            return True
            
        except Exception as e:
            logging.error(f"Error stopping VM {name}: {e}")
            return False

    def get_vm_status(self, name: str) -> Optional[Dict]:
        """Get VM status."""
        if name not in self.vms:
            return None
        
        vm_config = self.vms[name]
        is_running = False
        
        if name in self.processes:
            process = self.processes[name]
            try:
                # Check if process is still running and not a zombie
                if process.poll() is None:
                    psutil_proc = psutil.Process(process.pid)
                    if psutil_proc.status() != psutil.STATUS_ZOMBIE:
                        is_running = True
                else:
                    # Process has terminated, clean up
                    self.processes.pop(name, None)
            except (psutil.NoSuchProcess, psutil.ZombieProcess, ProcessLookupError):
                # Process is dead or zombie, clean up
                self.processes.pop(name, None)
        
        status = {
            'name': name,
            'running': is_running,
            'config': vm_config.to_dict(),
            'cpu_usage': 0,
            'memory_mb': 0
        }
        
        if is_running:
            try:
                psutil_proc = psutil.Process(self.processes[name].pid)
                if psutil_proc.status() != psutil.STATUS_ZOMBIE:
                    status['cpu_usage'] = psutil_proc.cpu_percent(interval=0.1)
                    status['memory_mb'] = psutil_proc.memory_info().rss / 1024 / 1024
                    
                    # Include display information if available
                    if not vm_config.headless and hasattr(vm_config.display, 'port'):
                        display_info = vm_config.display.to_dict()
                        display_info['raw_port'] = vm_config.display.port  # Add the actual port number
                        status['display'] = display_info
            except (psutil.NoSuchProcess, psutil.ZombieProcess, ProcessLookupError) as e:
                logging.warning(f"Process monitoring error for VM {name}: {str(e)}")
                self.processes.pop(name, None)
                status['running'] = False
        
        return status

    def _build_qemu_command(self, vm: VMConfig) -> List[str]:
        """Build QEMU command line arguments."""
        cmd = [f"qemu-system-{vm.arch}"]
        
        # Basic configuration
        cmd.extend(["-name", vm.name])
        cmd.extend(["-cpu", vm.cpu])
        cmd.extend(["-smp", f"cores={vm.cpu_cores},threads={vm.cpu_threads}"])
        cmd.extend(["-m", str(vm.memory)])
        cmd.extend(["-machine", vm.machine])
        
        # KVM support
        if vm.enable_kvm:
            cmd.append("-enable-kvm")
        
        # Network
        if vm.network_type == "user":
            cmd.append("-nic")
            cmd.append("user,model=virtio-net-pci")
        elif vm.network_type == "bridge":
            cmd.extend(["-nic", f"bridge,br={vm.network_bridge},model=virtio-net-pci"])
        
        # RTC
        cmd.extend(["-rtc", f"base={vm.rtc_base}"])
        
        # Display
        if vm.headless:
            cmd.append("-nographic")
        else:
            # Add USB controller and tablet for better mouse handling
            cmd.extend(["-device", "qemu-xhci,id=xhci"])  # USB 3.0 controller with ID
            cmd.extend(["-device", "usb-tablet,bus=xhci.0"])  # Connect tablet to XHCI controller
            
            if vm.display.type == "vnc":
                if vm.display.port is None:
                    # Find a free port in the VNC range
                    success, port = self._find_free_port(5900, 6000)
                    if not success:
                        raise RuntimeError("No free VNC ports available")
                    vm.display.port = port
                vnc_display = vm.display.port - 5900
                vnc_options = [f"{vm.display.address}:{vnc_display}"]
                if vm.display.password:
                    vnc_options.append("password=on")
                # VNC mouse handling is managed by the USB tablet device above
                cmd.extend(["-vnc", ",".join(vnc_options)])
            elif vm.display.type == "spice":
                if vm.display.port is None:
                    # Find a free port in the SPICE range
                    success, port = self._find_free_port(5930, 6030)
                    if not success:
                        raise RuntimeError("No free SPICE ports available")
                    vm.display.port = port
                
                spice_options = [
                    f"port={vm.display.port}",
                    f"addr={vm.display.address}",
                    "disable-ticketing=on"  # Allow connections without authentication if no password
                ]
                if vm.display.password:
                    spice_options.append(f"password={vm.display.password}")
                cmd.extend(["-spice", ",".join(spice_options)])
                
                # Add SPICE agent and GL support
                cmd.extend(["-device", "virtio-serial"])
                cmd.extend(["-chardev", "spicevmc,id=vdagent,name=vdagent"])
                cmd.extend(["-device", "virtserialport,chardev=vdagent,name=com.redhat.spice.0"])
        
        # Disks
        for disk in vm.disks:
            disk_opts = []
            if disk.type == "cdrom":
                disk_opts.append("media=cdrom")
            if disk.readonly:
                disk_opts.append("readonly=on")
            
            cmd.extend([
                "-drive",
                f"file={disk.path},if={disk.interface},format={disk.format}" + 
                (f",{','.join(disk_opts)}" if disk_opts else "")
            ])
        
        # Additional arguments
        cmd.extend(vm.additional_args)
        
        return cmd

    def _find_free_port(self, start_port: int, end_port: int) -> Tuple[bool, Optional[int]]:
        """Find a free port in the given range."""
        import socket
        for port in range(start_port, end_port):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(("", port))
                    return True, port
            except OSError:
                continue
        return False, None

    def _start_monitor_thread(self, name: str):
        """Start a thread to monitor VM status."""
        stop_event = threading.Event()
        self.stop_events[name] = stop_event
        
        def monitor_vm():
            while not stop_event.is_set():
                if name not in self.processes:
                    break
                
                process = self.processes[name]
                try:
                    if process.poll() is not None:  # Process has terminated
                        # Clean up zombie process
                        try:
                            process.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            pass
                        
                        # Remove from processes dict and notify
                        self.processes.pop(name, None)
                        if self.stopped_callback:
                            self.stopped_callback(name)
                        break
                    
                    if self.status_callback:
                        status = self.get_vm_status(name)
                        if status:
                            self.status_callback(status)
                
                except (psutil.NoSuchProcess, psutil.ZombieProcess, ProcessLookupError) as e:
                    logging.warning(f"Process monitoring error for VM {name}: {str(e)}")
                    self.processes.pop(name, None)
                    if self.stopped_callback:
                        self.stopped_callback(name)
                    break
                
                time.sleep(1)  # Update status every second
            
            # Clean up when thread exits
            self.monitor_threads.pop(name, None)
            self.stop_events.pop(name, None)
        
        thread = threading.Thread(target=monitor_vm, daemon=True)
        thread.start()
        self.monitor_threads[name] = thread