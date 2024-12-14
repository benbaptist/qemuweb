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

## Project Structure

```
qemuweb/
├── start.py                    # Entry point script
├── requirements.txt            # Dependencies
├── README.md                   # Documentation
├── qemuweb/                   # Main package directory
│   ├── __init__.py
│   ├── core/                  # Core QEMU interaction
│   │   ├── __init__.py
│   │   ├── machine.py        # VM management and lifecycle
│   │   ├── capabilities.py   # QEMU capabilities handling
│   │   └── vnc.py           # VNC connection handling
│   ├── web/                  # Web application
│   │   ├── __init__.py
│   │   ├── app.py           # Flask application setup
│   │   ├── routes.py        # API routes
│   │   └── websocket.py     # WebSocket handling
│   ├── config/              # Configuration management
│   │   ├── __init__.py
│   │   └── manager.py       # Config loading and validation
│   └── frontend/            # Frontend assets
│       ├── static/
│       │   ├── js/
│       │   │   ├── machine.js     # VM control interface
│       │   │   ├── vnc.js         # VNC client logic
│       │   │   └── websocket.js   # WebSocket client
│       │   ├── css/
│       │   └── img/
│       └── templates/
│           └── index.html    # Main template
```

## Requirements

- Python 3.8 or higher
- QEMU
- VNC client support in your browser
- Websockify (for VNC over WebSocket)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/qemuweb.git
   cd qemuweb
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
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

The application uses two main configuration files:

1. `config.json`: General application settings
2. `vm_configs.json`: Virtual machine configurations

These files will be created automatically with default values when you first run the application.

## Usage

1. Start the application:
   ```bash
   python start.py
   ```

2. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

3. Create a new VM:
   - Click "New VM" in the header
   - Fill in the VM configuration form
   - Click "Save Configuration"

4. Start a VM:
   - Select the VM from the sidebar
   - Click the "Start" button
   - Once started, click "Connect Display" to access the VM console

## Development

The project uses a modular structure:

- `core/`: Contains the core QEMU interaction logic
- `web/`: Contains the Flask web application
- `config/`: Handles configuration management
- `frontend/`: Contains all frontend assets

To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- QEMU team for the amazing virtualization software
- Flask team for the web framework
- All contributors to the project
  