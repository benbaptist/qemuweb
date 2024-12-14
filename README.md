# QEMUWeb

A modern web interface for managing QEMU virtual machines. This application provides a user-friendly way to create, manage, and interact with QEMU virtual machines through your web browser.

## Features

- Create and manage QEMU virtual machines
- Live VM console access through VNC
- Real-time VM status monitoring
- Support for multiple architectures and machine types
- KVM acceleration support (when available)
- Disk device management
- VM configuration persistence
- Real-time VM logs viewing
- Command-line interface with configuration overrides
- Automatic configuration management in ~/.config/qemuweb
- Support for custom configuration directories

## Requirements

- Python 3.8 or higher
- QEMU
- Python dependencies:
  - `flask`
  - `flask-socketio`
  - `eventlet`
  - `python-engineio`
  - `python-socketio`
  - `opencv-python`
  - `numpy`
  - `pillow`
  - `psutil`
  - `dataclasses-json`
  - `websockify`

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/benbaptist/qemuweb.git
   cd qemuweb
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install the package:
   ```bash
   pip install -e .
   ```

4. Install QEMU and required system packages:
   ```bash
   # On Ubuntu/Debian:
   sudo apt-get install qemu-system qemu-utils

   # On macOS with Homebrew:
   brew install qemu

   # On Windows:
   # Download and install QEMU from https://www.qemu.org/download/
   ```

## Configuration

By default, the application stores its configuration files in `~/.config/qemuweb/`:

1. `config.json`: General application settings
2. `vm_configs.json`: Virtual machine configurations

These files will be automatically:
- Created with default values if they don't exist
- Migrated from the current directory if legacy configs are found
- Updated with any missing default values when the application starts

You can specify a custom configuration directory using the `--config-dir` option.

## Usage

### Command Line Interface

The `qemuweb` command will be available after installation. You can run it with various options:

```bash
# Run with default settings
qemuweb

# Override host and port
qemuweb --host localhost --port 8000

# Enable/disable debug mode
qemuweb --debug
qemuweb --no-debug

# Use a custom configuration directory
qemuweb --config-dir /path/to/custom/config
```

### Web Interface

1. Start the application using the command above

2. Open your web browser and navigate to:
   ```
   http://localhost:5000  # Or your configured host:port
   ```

3. Create a new VM:
   - Click "New VM" in the header
   - Fill in the VM configuration form
   - Click "Save Configuration"

4. Start a VM:
   - Select the VM from the sidebar
   - Click the "Start" button
   - Once started, click "Connect Display" to access the VM console

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- QEMU team for the amazing virtualization software
- Flask team for the web framework
- Click team for the CLI framework
- All contributors to the project
  