from flask import Blueprint, render_template, jsonify, request, send_from_directory, current_app
from flask_socketio import emit
from pathlib import Path
from typing import Dict, List
import eventlet
import logging

from .app import socketio
from ..core.machine import VMConfig
from ..config.manager import config_manager

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

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

# WebSocket routes
@socketio.on('connect_display')
def handle_connect_display(data):
    """Handle display connection request."""
    vm_name = data.get('vm_name')
    if vm_name in current_app.vm_manager.vms:
        config = current_app.vm_manager.vms[vm_name]
        if config.display.type == 'vnc' and config.display.port:
            if current_app.display_manager.connect_vnc(vm_name, config.display.address, 
                                        config.display.port, config.display.password):
                emit('display_connected', {'status': 'success'})
                return
    emit('display_connected', {'status': 'error', 'message': 'Failed to connect to display'})

@socketio.on('disconnect_display')
def handle_disconnect_display(data):
    """Handle display disconnection request."""
    vm_name = data.get('vm_name')
    current_app.display_manager.disconnect_vnc(vm_name)

@socketio.on('key_event')
def handle_key_event(data):
    """Handle keyboard event."""
    vm_name = data.get('vm_name')
    key_code = data.get('key_code')
    down = data.get('down', True)
    current_app.display_manager.send_key_event(vm_name, key_code, down)

@socketio.on('pointer_event')
def handle_pointer_event(data):
    """Handle pointer event."""
    vm_name = data.get('vm_name')
    x = data.get('x')
    y = data.get('y')
    button_mask = data.get('button_mask')
    current_app.display_manager.send_pointer_event(vm_name, x, y, button_mask) 

# Register Socket.IO event handlers
def init_socketio(socketio):
    socketio.on_event('connect_display', handle_connect_display)
    socketio.on_event('disconnect_display', handle_disconnect_display)
    socketio.on_event('key_event', handle_key_event)
    socketio.on_event('pointer_event', handle_pointer_event)

    @socketio.on('connect')
    def handle_connect():
        logging.info('Client connected')

    @socketio.on('disconnect')
    def handle_disconnect():
        logging.info('Client disconnected') 