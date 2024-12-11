# QEMU Web Manager

A web-based interface for managing QEMU virtual machines. This application allows you to create, configure, and manage QEMU VMs through a modern web interface.

## Features

- Create and manage QEMU virtual machines
- Support for multiple architectures (x86_64, aarch64, arm, riscv64)
- Real-time VM status monitoring (CPU, memory usage)
- Optional KVM acceleration support
- Headless or VNC-based operation
- WebSocket-based real-time updates

## Prerequisites

- Python 3.7+
- QEMU installed on your system
- Modern web browser

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

## Usage

1. Start the application:
```bash
python app.py
```

2. Open your web browser and navigate to `http://localhost:5000`

3. Create a new VM:
   - Fill in the VM configuration form
   - Provide a valid disk image path (qcow2 format)
   - Choose the desired architecture and settings
   - Click "Create VM"

4. Monitor and manage your VMs:
   - View real-time CPU and memory usage
   - Stop VMs when needed
   - Toggle between headless and VNC modes

## Configuration Options

- **Name**: Unique identifier for your VM
- **CPU**: CPU model (e.g., qemu64, host)
- **Memory**: RAM allocation in MB
- **Disk Path**: Path to your qcow2 disk image
- **Architecture**: Target architecture for emulation
- **KVM**: Enable/disable KVM acceleration (when available)
- **Headless Mode**: Run without graphics (serial console only)

## Security Considerations

- This application is designed for local use
- No authentication is implemented by default
- Use with caution in networked environments

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 