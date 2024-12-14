import json
from pathlib import Path
from typing import Dict, Any

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

def load_config() -> Dict[str, Any]:
    """Load configuration from file or create default if not exists."""
    try:
        if Path(CONFIG_FILE).exists():
            with open(CONFIG_FILE, 'r') as f:
                loaded_config = json.load(f)
                # Merge with defaults to ensure all required keys exist
                return _merge_configs(DEFAULT_CONFIG, loaded_config)
        else:
            # Save default config if no config exists
            with open(CONFIG_FILE, 'w') as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)
            return DEFAULT_CONFIG
    except Exception as e:
        print(f"Error loading config: {e}")
        return DEFAULT_CONFIG

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