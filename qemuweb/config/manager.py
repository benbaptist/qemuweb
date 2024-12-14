import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import shutil

# Default config directory setup
DEFAULT_CONFIG_DIR = Path.home() / '.config' / 'qemuweb'

class ConfigManager:
    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir if config_dir else DEFAULT_CONFIG_DIR
        
        # Config files
        self.config_file = self.config_dir / 'config.json'
        self.vm_file = self.config_dir / 'vm.json'
        self.capabilities_file = self.config_dir / 'capabilities.json'
        self.logs_dir = self.config_dir / 'logs'
        
        # Legacy paths for migration
        self.legacy_config_file = Path('config.json')
        self.legacy_vm_file = Path('vm_configs.json')
        self.legacy_capabilities_file = Path('qemu_capabilities.json')
        self.legacy_logs_dir = Path('vm_logs')
        
        # Initialize
        self.ensure_config_dir()
        self.migrate_legacy_files()
        self.config = self.load_config()

    def ensure_config_dir(self):
        """Create config directory and subdirectories if they don't exist."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def migrate_legacy_files(self):
        """Migrate configs and logs from current directory to config dir."""
        # Migrate config files
        if self.legacy_config_file.exists() and not self.config_file.exists():
            shutil.copy2(self.legacy_config_file, self.config_file)
            print(f"Migrated legacy config from {self.legacy_config_file} to {self.config_file}")
        
        if self.legacy_vm_file.exists() and not self.vm_file.exists():
            shutil.copy2(self.legacy_vm_file, self.vm_file)
            print(f"Migrated legacy VM configs from {self.legacy_vm_file} to {self.vm_file}")
        
        if self.legacy_capabilities_file.exists() and not self.capabilities_file.exists():
            shutil.copy2(self.legacy_capabilities_file, self.capabilities_file)
            print(f"Migrated QEMU capabilities from {self.legacy_capabilities_file} to {self.capabilities_file}")

        # Migrate logs
        if self.legacy_logs_dir.exists():
            for log_file in self.legacy_logs_dir.glob('*'):
                target_file = self.logs_dir / log_file.name
                if not target_file.exists():
                    shutil.copy2(log_file, target_file)
            print(f"Migrated logs from {self.legacy_logs_dir} to {self.logs_dir}")

    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file or create default if not exists."""
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    loaded_config = json.load(f)
                    # Merge with defaults to ensure all required keys exist
                    return self._merge_configs(DEFAULT_CONFIG, loaded_config)
            else:
                # Save default config if no config exists
                with open(self.config_file, 'w') as f:
                    json.dump(DEFAULT_CONFIG, f, indent=4)
                print(f"Created new config file at {self.config_file}")
                return DEFAULT_CONFIG
        except Exception as e:
            print(f"Error loading config: {e}")
            print(f"Using default configuration")
            return DEFAULT_CONFIG

    def save_config(self, config: Dict[str, Any]):
        """Save configuration to file."""
        with open(self.config_file, 'w') as f:
            json.dump(config, f, indent=4)

    def load_vm_configs(self) -> Dict[str, Any]:
        """Load VM configurations from file."""
        try:
            if self.vm_file.exists():
                with open(self.vm_file, 'r') as f:
                    return json.load(f)
            else:
                # Create empty VM configs if file doesn't exist
                empty_configs = {}
                with open(self.vm_file, 'w') as f:
                    json.dump(empty_configs, f, indent=4)
                print(f"Created new VM configs file at {self.vm_file}")
                return empty_configs
        except Exception as e:
            print(f"Error loading VM configs: {e}")
            print(f"Using empty VM configurations")
            return {}

    def save_vm_configs(self, vm_configs: Dict[str, Any]):
        """Save VM configurations to file."""
        with open(self.vm_file, 'w') as f:
            json.dump(vm_configs, f, indent=4)

    def load_capabilities(self) -> Dict[str, Any]:
        """Load QEMU capabilities from file."""
        try:
            if self.capabilities_file.exists():
                with open(self.capabilities_file, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"Error loading capabilities: {e}")
            return {}

    def save_capabilities(self, capabilities: Dict[str, Any]):
        """Save QEMU capabilities to file."""
        with open(self.capabilities_file, 'w') as f:
            json.dump(capabilities, f, indent=4)

    def get_log_path(self, vm_name: str, timestamp: str) -> Path:
        """Get the path for a VM log file."""
        return self.logs_dir / f'{vm_name}_{timestamp}.log'

    @staticmethod
    def _merge_configs(default: Dict[str, Any], loaded: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively merge loaded config with defaults."""
        merged = default.copy()
        
        for key, value in loaded.items():
            if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key] = ConfigManager._merge_configs(merged[key], value)
            else:
                merged[key] = value
                
        return merged

# Default configuration template
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

# Create default instance
config_manager = ConfigManager()
config = config_manager.config