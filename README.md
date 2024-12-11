# QEMU Web Manager

A modern web-based interface for managing QEMU virtual machines. This application provides a comprehensive solution for creating, managing, and interacting with QEMU VMs through an intuitive web interface.

## Features

### VM Management
- Create and manage QEMU virtual machines
- Dynamic architecture detection and support
- Automatic detection of QEMU capabilities
- Real-time VM status monitoring (CPU, memory usage)
- Persistent VM configurations
- Support for multiple storage devices (HDDs and CD-ROMs)

### Display Support
- SPICE protocol support with automatic fallback to VNC
- Web-based VNC access via noVNC
- Fullscreen mode support
- Automatic display scaling
- Special key combinations support (e.g., Ctrl+Alt+Del)

### Storage Management
- Multiple disk support per VM
- Support for various disk interfaces (VirtIO, IDE, SCSI)
- CD-ROM device support
- File browser for disk image selection
- Support for multiple disk formats (QCOW2, raw)

### System Integration
- Optional KVM acceleration with automatic detection
- Dynamic port allocation for displays
- Comprehensive logging system
- Automatic capability detection
- Cross-platform support

## Prerequisites

### Required
- Python 3.7+
- QEMU installation
- Modern web browser
- `websockify` for remote display support

### Optional
- KVM support for hardware acceleration
- SPICE support in QEMU build
- VirtIO drivers for guest OS

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/qemu-web-manager.git
cd qemu-web-manager
```

2. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install the required packages:
```bash
pip install -r requirements.txt
```

## Configuration

The application uses a `config.json` file for global settings:

```json
{
    "web_interface": {
        "host": "0.0.0.0",
        "port": 5000,
        "debug": true
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
```

## Usage

1. Start the application:
```bash
python app.py
```

2. Access the web interface at `http://localhost:5000` (or configured port)

3. Create a new VM:
   - Click "Create New VM"
   - Configure basic settings (name, CPU, memory)
   - Add storage devices
   - Choose display type (SPICE or VNC)
   - Configure additional options

4. Manage VMs:
   - Start/Stop VMs
   - Monitor resource usage
   - Access VM display
   - Modify VM configurations
   - Add/remove storage devices

## Coding Practices

### Python Code Style
- Follow PEP 8 guidelines
- Use type hints for function arguments and return values
- Use docstrings for classes and functions
- Keep functions focused and single-purpose
- Use meaningful variable and function names

### Error Handling
- Use proper exception handling with specific exceptions
- Log errors with appropriate context
- Provide user-friendly error messages
- Implement graceful fallbacks where possible

### Logging
- Use the Python logging module
- Include timestamp and severity level
- Log important operations and errors
- Maintain separate logs for application and VMs

### Frontend Code Style
- Use Vue.js best practices
- Keep components modular
- Use proper event handling
- Implement responsive design
- Follow BEM methodology for CSS

### Security Practices
- Validate all user inputs
- Sanitize file paths
- Use secure defaults
- Implement proper access controls
- Handle sensitive data appropriately

### Testing
- Write unit tests for core functionality
- Test error handling paths
- Verify VM management operations
- Test display protocol fallbacks
- Validate configuration handling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the coding practices
4. Add appropriate tests
5. Submit a pull request

## Troubleshooting

### Common Issues
1. Display Connection Issues
   - Verify QEMU installation
   - Check port availability
   - Verify websockify installation
   - Check browser WebSocket support

2. VM Start Failures
   - Verify QEMU installation
   - Check disk image paths
   - Verify architecture support
   - Check system resources

3. Performance Issues
   - Enable KVM when available
   - Use VirtIO devices
   - Optimize memory allocation
   - Check host system resources

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- QEMU project
- noVNC project
- SPICE project
- Vue.js framework
- Flask framework 