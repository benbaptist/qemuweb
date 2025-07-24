from flask import Blueprint, render_template, jsonify, request, send_from_directory, current_app
from flask_socketio import emit
from pathlib import Path
from typing import Dict, List
import eventlet
import logging
import signal
import platform
import psutil
import sys
import atexit
from eventlet.greenthread import GreenThread

from .app import socketio, create_app
from ..core.machine import VMConfig
from ..core.display import VMDisplay
from ..config.manager import config_manager

bp = Blueprint('main', __name__)

# Store active display connections
vm_displays: Dict[str, VMDisplay] = {}
shutdown_event = eventlet.event.Event()

def stop_vm_process(vm_name: str, process, timeout: int = 5):
    """Helper function to stop a VM process."""
    try:
        logging.info(f"Stopping VM: {vm_name}")
        # First try graceful shutdown
        process.terminate()
        try:
            process.wait(timeout=timeout)
            return True
        except:
            logging.warning(f"VM {vm_name} did not stop gracefully, forcing...")
            process.kill()
            process.wait(timeout=1)
            return True
    except Exception as e:
        logging.error(f"Error stopping VM {vm_name}: {e}")
        return False

def cleanup_resources():
    """Clean up all resources."""
    if not current_app:
        return
        
    # Stop all VMs first
    if hasattr(current_app, 'vm_manager'):
        logging.info("Stopping all VMs...")
        # Get list of running VMs
        running_vms = [(name, vm) for name, vm in current_app.vm_manager.processes.items() if vm.poll() is None]
        
        # Stop each VM
        for vm_name, process in running_vms:
            stop_vm_process(vm_name, process)
            
    # Clean up display connections
    for session_id, display in list(vm_displays.items()):
        try:
            logging.info(f"Cleaning up display for session {session_id}")
            display.stop_streaming()
            display.disconnect()
        except Exception as e:
            logging.error(f"Error cleaning up display for session {session_id}: {e}")
    vm_displays.clear()

def signal_handler(signo, frame):
    """Handle shutdown signals."""
    if shutdown_event.ready():  # If we're already shutting down, exit immediately
        sys.exit(1)
        
    logging.info("Initiating shutdown...")
    shutdown_event.send(True)  # Signal all workers to stop
    
    # Stop accepting new connections
    if socketio and hasattr(socketio, 'server'):
        try:
            socketio.server.eio.shutdown()
        except:
            pass
    
    # Clean up resources
    cleanup_resources()
    
    # Exit cleanly
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

@bp.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@bp.route('/api/system/info', methods=['GET'])
def get_system_info():
    """Get system information."""
    try:
        info = {
            'os_name': platform.system(),
            'os_version': platform.release(),
            'python_version': platform.python_version(),
            'cpu_count': psutil.cpu_count(logical=True),
            'memory_total': psutil.virtual_memory().total // (1024 * 1024),  # Convert to MB
            'hostname': platform.node()
        }
        return jsonify(info)
    except Exception as e:
        logging.error(f"Error getting system info: {e}")
        return jsonify({'error': str(e)}), 500

@bp.route('/api/vms', methods=['GET'])
def list_vms():
    """List all VMs."""
    return jsonify(current_app.vm_manager.get_all_vms())

@bp.route('/api/vms', methods=['POST'])
def create_vm():
    """Create a new VM configuration."""
    try:
        config = VMConfig.create_from_dict(request.get_json(), current_app.qemu_capabilities)
        if current_app.vm_manager.add_vm(config.to_dict()):
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Failed to create VM'}), 400
    except Exception as e:
        logging.error(f"Error creating VM: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 400

@bp.route('/api/vms/<name>', methods=['DELETE'])
def delete_vm(name: str):
    """Delete a VM configuration."""
    if current_app.vm_manager.remove_vm(name):
        return jsonify({'success': True})
    error_msg = 'VM not found'
    logging.error(f"Failed to delete VM {name}: {error_msg}")
    return jsonify({'success': False, 'error': error_msg}), 404

@bp.route('/api/vms/<name>/start', methods=['POST'])
def start_vm(name: str):
    """Start a VM."""
    success, error = current_app.vm_manager.start_vm(name)
    if success:
        return jsonify({'success': True})
    logging.error(f"Failed to start VM {name}: {error}")
    return jsonify({'success': False, 'error': error}), 400

@bp.route('/api/vms/<name>/stop', methods=['POST'])
def stop_vm(name: str):
    """Stop a VM."""
    if current_app.vm_manager.stop_vm(name):
        return jsonify({'success': True})
    error_msg = f"Failed to stop VM {name}"
    logging.error(error_msg)
    return jsonify({'success': False, 'error': error_msg}), 400

@bp.route('/api/vms/<name>/restart', methods=['POST'])
def restart_vm(name: str):
    """Restart a VM using ACPI shutdown."""
    success, error = current_app.vm_manager.restart_vm(name)
    if success:
        return jsonify({'success': True})
    logging.error(f"Failed to restart VM {name}: {error}")
    return jsonify({'success': False, 'error': error}), 400

@bp.route('/api/vms/<name>/reset', methods=['POST'])
def reset_vm(name: str):
    """Hard reset a VM."""
    success, error = current_app.vm_manager.reset_vm(name)
    if success:
        return jsonify({'success': True})
    logging.error(f"Failed to reset VM {name}: {error}")
    return jsonify({'success': False, 'error': error}), 400

@bp.route('/api/vms/<name>/shutdown', methods=['POST'])
def shutdown_vm(name: str):
    """ACPI shutdown a VM."""
    success, error = current_app.vm_manager.shutdown_vm(name)
    if success:
        return jsonify({'success': True})
    logging.error(f"Failed to shutdown VM {name}: {error}")
    return jsonify({'success': False, 'error': error}), 400

@bp.route('/api/vms/<name>/poweroff', methods=['POST'])
def power_off_vm(name: str):
    """Force power off a VM (kill process)."""
    success, error = current_app.vm_manager.power_off_vm(name)
    if success:
        return jsonify({'success': True})
    logging.error(f"Failed to power off VM {name}: {error}")
    return jsonify({'success': False, 'error': error}), 400

@bp.route('/api/vms/<name>/status', methods=['GET'])
def get_vm_status(name: str):
    """Get VM status."""
    status = current_app.vm_manager.get_vm_status(name)
    if status:
        return jsonify(status)
    error_msg = f"VM {name} not found"
    logging.error(error_msg)
    return jsonify({'success': False, 'error': error_msg}), 404

@bp.route('/api/browse', methods=['GET'])
def browse_files():
    """Browse files in a directory."""
    path = request.args.get('path', '/')
    return jsonify(current_app.vm_manager.list_directory(path))

@bp.route('/api/vms/<name>', methods=['PUT'])
def update_vm(name: str):
    """Update VM configuration."""
    try:
        if current_app.vm_manager.update_vm(name, request.json, current_app.qemu_capabilities):
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Failed to update VM'}), 400
    except Exception as e:
        error_msg = f"Error updating VM {name}: {str(e)}"
        logging.error(error_msg)
        return jsonify({'success': False, 'error': error_msg}), 400

@bp.route('/api/qemu/capabilities', methods=['GET'])
def get_qemu_capabilities():
    """Get QEMU capabilities."""
    return jsonify(current_app.qemu_capabilities.to_dict())

@bp.route('/api/vms/<name>/logs', methods=['GET'])
def get_vm_logs(name: str):
    """Get VM logs."""
    try:
        # Get all log files for this VM, sorted by timestamp (newest first)
        log_files = sorted(
            config_manager.logs_dir.glob(f'{name}_*.log'),
            key=lambda x: x.stat().st_mtime,
            reverse=True
        )
        
        if log_files:
            # Read the most recent log file
            with open(log_files[0], 'r') as f:
                logs = f.readlines()
            return jsonify({'success': True, 'logs': logs})
        
        return jsonify({'success': True, 'logs': []})
    except Exception as e:
        current_app.logger.error(f"Error reading logs for VM {name}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/api/vms/<name>/display', methods=['GET'])
def get_vm_display(name: str):
    """Get VM display information."""
    vm = current_app.vm_manager.get_vm(name)
    if not vm:
        return jsonify({'success': False, 'error': 'VM not found'}), 404
    
    display_info = {
        'type': vm.display.type,
        'address': vm.display.address,
        'port': vm.display.port,
        'password': vm.display.password if hasattr(vm.display, 'password') else None
    }
    return jsonify(display_info)

@bp.route('/vm/<vm_id>/display')
def vm_display(vm_id):
    """Render the VM display page."""
    return render_template('vm_display.html', vm_id=vm_id)

@bp.route('/api/disks/create', methods=['POST'])
def create_disk():
    """Create a new blank disk image using qemu-img."""
    data = request.get_json()
    path = data.get('path')
    size = data.get('size')
    fmt = data.get('format', 'qcow2')
    if not path or not size:
        return jsonify({'success': False, 'error': 'Missing path or size'}), 400
    from ..core.machine import DiskDevice
    try:
        success = DiskDevice.create_blank_disk(path, int(size), fmt)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Failed to create disk image'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# WebSocket routes
@socketio.on('connect')
def handle_connect():
    """Handle new socket connections."""
    logging.info('Client connected')

@socketio.on('init_display')
def handle_init_display(data):
    """Initialize display connection for a VM."""
    vm_id = data.get('vm_id')
    session_id = request.sid  # Store session ID
    logging.info(f'Initializing display for VM {vm_id}')
    
    if not vm_id:
        emit('error', {'message': 'No VM ID provided'})
        return
        
    # Get VM config and create display
    all_vms = current_app.vm_manager.get_all_vms()
    vm = next((vm for vm in all_vms if vm.get('name') == vm_id), None)
    if not vm:
        logging.error(f'VM not found: {vm_id}')
        emit('error', {'message': 'VM not found'})
        return
        
    # Get display info
    display_info = vm.get('display', {})
    if not display_info or not display_info.get('port'):
        logging.error(f'Display not configured for VM: {vm_id}')
        emit('error', {'message': 'VM display not configured'})
        return
        
    try:
        # Create display handler
        port = display_info['port']
        logging.info(f'Creating display handler for port {port}')
        display = VMDisplay(host='localhost', port=port)
        
        # Store the display before spawning the thread
        vm_displays[session_id] = display
        
        def _connect_and_stream():
            try:
                display.connect_and_stream(socketio, session_id)
            except Exception as e:
                logging.error(f'Error in connect_and_stream: {e}', exc_info=True)
                socketio.emit('error', {'message': f'Display connection failed: {str(e)}'}, room=session_id)
            
        eventlet.spawn(_connect_and_stream)
        logging.info(f'Display initialization started for VM {vm_id} on port {port}')
        
    except Exception as e:
        logging.error(f'Error initializing display: {e}', exc_info=True)
        emit('error', {'message': f'Display initialization failed: {str(e)}'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle socket disconnections."""
    if request.sid in vm_displays:
        display = vm_displays[request.sid]
        display.stop_streaming()
        eventlet.spawn_after(0, display.disconnect)
        del vm_displays[request.sid]
    logging.info('Client disconnected')

@socketio.on('vm_input')
def handle_vm_input(data):
    """Handle VM input events from the client."""
    if request.sid not in vm_displays:
        logging.warning(f'No display found for session {request.sid}')
        return
        
    display = vm_displays[request.sid]
    try:
        eventlet.spawn_after(0, display.handle_input, data['type'], data)
    except Exception as e:
        logging.error(f'Error handling input event: {e}') 