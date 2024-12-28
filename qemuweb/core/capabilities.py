import subprocess
import re
import logging
import shutil
import os
from typing import Dict, List, Optional

class QEMUCapabilities:
    def __init__(self):
        self.available = False
        self.version = None
        self.has_kvm = False
        self.has_spice = False
        self.architectures: List[str] = []
        self.cpu_models: Dict[str, List[str]] = {}
        self.machine_types: Dict[str, List[str]] = {}
        self.display_devices: Dict[str, List[str]] = {}
        self.error = None
        
        self._detect_capabilities()
    
    def _detect_capabilities(self):
        """Detect QEMU capabilities."""
        try:
            # Check if QEMU is installed
            qemu_path = shutil.which('qemu-system-x86_64')
            if not qemu_path:
                self.error = "QEMU is not installed"
                logging.error(self.error)
                return
            
            # Get QEMU version
            result = subprocess.run([qemu_path, '--version'], 
                                 capture_output=True, text=True)
            self.version = result.stdout.split('\n')[0]
            logging.info(f"QEMU version: {self.version}")
            
            # Detect available architectures
            self.architectures = self._detect_architectures()
            logging.info(f"Available architectures: {', '.join(self.architectures)}")
            
            # Check KVM support
            self.has_kvm = self._check_kvm_support()
            logging.info(f"KVM support: {'available' if self.has_kvm else 'not available'}")
            
            # Check SPICE support
            self.has_spice = self._check_spice_support()
            logging.info(f"SPICE support: {'available' if self.has_spice else 'not available'}")
            
            # Get CPU models and machine types for each architecture
            for arch in self.architectures:
                self.cpu_models[arch] = self._get_cpu_models(arch)
                self.machine_types[arch] = self._get_machine_types(arch)
                self.display_devices[arch] = self._get_display_devices(arch)
                logging.debug(f"Architecture {arch}:")
                logging.debug(f"  CPU models: {', '.join(self.cpu_models[arch])}")
                logging.debug(f"  Machine types: {', '.join(self.machine_types[arch])}")
                logging.debug(f"  Display devices: {', '.join(self.display_devices[arch])}")

            # Detect available display devices
            all_display_devices = set()
            for arch, devices in self.display_devices.items():
                all_display_devices.update(devices)
            logging.info(f"Available display devices: {', '.join(all_display_devices)}")
            
            self.available = True
            
        except Exception as e:
            self.error = str(e)
            logging.error(f"Error detecting QEMU capabilities: {e}")
    
    def _detect_architectures(self) -> List[str]:
        """Detect available QEMU system architectures."""
        architectures = []
        arch_pattern = re.compile(r'qemu-system-([a-zA-Z0-9_]+)')
        
        paths = os.environ['PATH'].split(os.pathsep)
        for path in paths:
            try:
                if os.path.exists(path):
                    for file in os.listdir(path):
                        match = arch_pattern.match(file)
                        if match:
                            arch = match.group(1)
                            if arch not in architectures:
                                architectures.append(arch)
            except (PermissionError, OSError) as e:
                # Skip directories we can't access and log at debug level since this is expected
                logging.debug(f"Skipping directory {path} during architecture detection: {e}")
                continue
        
        return sorted(architectures)
    
    def _check_kvm_support(self) -> bool:
        """Check if KVM is supported."""
        try:
            result = subprocess.run(['qemu-system-x86_64', '-accel', 'help'],
                                 capture_output=True, text=True)
            return 'kvm' in result.stdout.lower()
        except:
            return False
    
    def _check_spice_support(self) -> bool:
        """Check if SPICE is supported."""
        try:
            # First check if spice-server is mentioned in help
            result = subprocess.run(['qemu-system-x86_64', '-device', 'help'],
                                 capture_output=True, text=True)
            if 'spice-server' not in result.stderr.lower():
                return False

            # Then verify SPICE options work
            result = subprocess.run(['qemu-system-x86_64', '-spice', 'help'],
                                 capture_output=True, text=True)
            return 'spice: spice is not supported' not in result.stderr.lower()
        except:
            return False
    
    def _get_cpu_models(self, arch: str) -> List[str]:
        """Get available CPU models for an architecture."""
        try:
            result = subprocess.run([f'qemu-system-{arch}', '-cpu', 'help'],
                                 capture_output=True, text=True)
            models = []
            for line in result.stdout.split('\n'):
                if line.startswith('x86 '):  # For x86 architectures
                    models.append(line.split()[1])
                elif line.strip() and not line.startswith('Available'):  # For other architectures
                    models.append(line.split()[0])
            return sorted(models)
        except:
            return []
    
    def _get_machine_types(self, arch: str) -> List[str]:
        """Get available machine types for an architecture."""
        try:
            result = subprocess.run([f'qemu-system-{arch}', '-machine', 'help'],
                                 capture_output=True, text=True)
            types = []
            for line in result.stdout.split('\n'):
                if line.strip() and not line.startswith('Supported'):
                    machine_type = line.split()[0]
                    if machine_type not in ['none', 'help']:
                        types.append(machine_type)
            return sorted(types)
        except:
            return []
    
    def _get_display_devices(self, arch: str) -> List[str]:
        """Get available display devices for an architecture."""
        try:
            result = subprocess.run([f'qemu-system-{arch}', '-device', 'help'],
                                 capture_output=True, text=True)
            devices = []
            
            # Common display device patterns to look for
            display_patterns = [
                r'VGA compatible controller',
                r'Display controller',
                r'virtio-gpu',
                r'qxl',
                r'cirrus-vga',
                r'ati-vga',
                r'vmware-svga',
                r'bochs-display',
                r'ramfb'
            ]
            
            for line in result.stdout.split('\n'):
                line = line.lower()

                for pattern in display_patterns:
                    if re.search(pattern.lower(), line):
                        # Extract the device name (first word in the line)
                        device_name = line.split()[1][1:-2]
                        if device_name not in devices:
                            devices.append(device_name)
            
            return sorted(devices)
        except Exception as e:
            logging.error(f"Error detecting display devices for {arch}: {e}")
            return []
    
    def to_dict(self) -> Dict:
        """Convert capabilities to dictionary."""
        return {
            'available': self.available,
            'version': self.version,
            'has_kvm': self.has_kvm,
            'has_spice': self.has_spice,
            'architectures': self.architectures,
            'cpu_models': self.cpu_models,
            'machine_types': self.machine_types,
            'display_devices': self.display_devices,
            'error': self.error
        }