import json
import os
from pathlib import Path
from typing import Dict, Any
import shutil

# Config directory setup
CONFIG_DIR = Path.home() / '.config' / 'qemuweb'
CONFIG_FILE = CONFIG_DIR / 'config.json'
VM_CONFIGS_FILE = CONFIG_DIR / 'vm_configs.json'

# Legacy paths for migration
LEGACY_CONFIG_FILE = Path('config.json')
LEGACY_VM_CONFIGS_FILE = Path('vm_configs.json')

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

def ensure_config_dir():
    """Create config directory if it doesn't exist."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

def migrate_legacy_configs():
    """Migrate configs from current directory to ~/.config/qemuweb if they exist."""
    if LEGACY_CONFIG_FILE.exists() and not CONFIG_FILE.exists():
        shutil.copy2(LEGACY_CONFIG_FILE, CONFIG_FILE)
        print(f"Migrated legacy config from {LEGACY_CONFIG_FILE} to {CONFIG_FILE}")
    
    if LEGACY_VM_CONFIGS_FILE.exists() and not VM_CONFIGS_FILE.exists():
        shutil.copy2(LEGACY_VM_CONFIGS_FILE, VM_CONFIGS_FILE)
        print(f"Migrated legacy VM configs from {LEGACY_VM_CONFIGS_FILE} to {VM_CONFIGS_FILE}")

def load_config() -> Dict[str, Any]:
    """Load configuration from file or create default if not exists."""
    ensure_config_dir()
    migrate_legacy_configs()
    
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'r') as f:
                loaded_config = json.load(f)
                # Merge with defaults to ensure all required keys exist
                return _merge_configs(DEFAULT_CONFIG, loaded_config)
        else:
            # Save default config if no config exists
            with open(CONFIG_FILE, 'w') as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)
            print(f"Created new config file at {CONFIG_FILE}")
            return DEFAULT_CONFIG
    except Exception as e:
        print(f"Error loading config: {e}")
        print(f"Using default configuration")
        return DEFAULT_CONFIG

def save_config(config: Dict[str, Any]):
    """Save configuration to file."""
    ensure_config_dir()
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

def _merge_configs(default: Dict[str, Any], loaded: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge loaded config with defaults."""
    merged = default.copy()
    
    for key, value in loaded.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _merge_configs(merged[key], value)
        else:
            merged[key] = value
            
    return merged

# Load configuration on module import
config = load_config() 