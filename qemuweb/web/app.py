from flask import Flask
from flask_socketio import SocketIO
import eventlet
import logging

from ..config.manager import config
from ..core.machine import VMManager
from ..core.capabilities import QEMUCapabilities
from ..core.vnc import DisplayManager

# Configure logging
logging.basicConfig(level=logging.INFO)

# Initialize SocketIO without an app
socketio = SocketIO()

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__,
                static_folder='../frontend/static',
                template_folder='../frontend/templates')

    # Configure app
    app.config['SECRET_KEY'] = 'dev'  # Change this in production
    app.config['JSON_SORT_KEYS'] = False
    
    # Initialize extensions
    socketio.init_app(app, async_mode='eventlet')
    
    with app.app_context():
        # Initialize global objects
        app.vm_manager = VMManager()
        app.display_manager = DisplayManager()
        app.qemu_capabilities = QEMUCapabilities()
        
        # Set up VM manager callbacks
        app.vm_manager.set_callbacks(
            status_callback=lambda status: socketio.emit('vm_status', status),
            stopped_callback=lambda name: socketio.emit('vm_stopped', {'name': name})
        )
    
        # Register blueprints
        from .routes import bp as routes_bp, init_socketio
        app.register_blueprint(routes_bp)
        
        # Initialize Socket.IO event handlers
        init_socketio(socketio)
    
        # Register error handlers
        @app.errorhandler(404)
        def not_found_error(error):
            return {'error': 'Not found'}, 404

        @app.errorhandler(500)
        def internal_error(error):
            return {'error': 'Internal server error'}, 500
    
    return app