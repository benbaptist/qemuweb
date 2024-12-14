from flask import Flask
from flask_socketio import SocketIO
import eventlet
import logging
from logging.handlers import RotatingFileHandler
import os

from ..config.manager import config, config_manager
from ..core.machine import VMManager
from ..core.capabilities import QEMUCapabilities
from ..core.vnc import DisplayManager

# Initialize SocketIO without an app
socketio = SocketIO()

def setup_logging(app):
    """Configure logging for the application."""
    # Create logs directory if it doesn't exist
    logs_dir = config_manager.logs_dir
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Set up application logger
    app_log_file = logs_dir / 'app.log'
    file_handler = RotatingFileHandler(app_log_file, maxBytes=1024*1024, backupCount=10)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    
    # Configure root logger
    logging.basicConfig(
        level=logging.INFO,
        handlers=[file_handler]
    )
    
    # Disable Werkzeug logger (Flask access logs)
    logging.getLogger('werkzeug').disabled = True
    
    # Set Flask logger to use our handlers
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('QEMUWeb startup')

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__,
                static_folder='../frontend/static',
                template_folder='../frontend/templates')

    # Configure app
    app.config['SECRET_KEY'] = 'dev'  # Change this in production
    app.config['JSON_SORT_KEYS'] = False
    
    # Set up logging
    setup_logging(app)
    
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
        from .routes import bp as routes_bp
        app.register_blueprint(routes_bp)
    
        # Register error handlers
        @app.errorhandler(404)
        def not_found_error(error):
            return {'error': 'Not found'}, 404

        @app.errorhandler(500)
        def internal_error(error):
            app.logger.error('Server Error', exc_info=error)
            return {'error': 'Internal server error'}, 500
    
    return app