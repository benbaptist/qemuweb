import logging
# Aggressively disable all web framework logging at the very start
logging.getLogger('werkzeug').disabled = True
logging.getLogger('werkzeug').setLevel(logging.ERROR)
logging.getLogger('socketio').setLevel(logging.ERROR)
logging.getLogger('engineio').setLevel(logging.ERROR)

from flask import Flask
from flask_socketio import SocketIO
from logging.handlers import RotatingFileHandler
import os
import sys

from ..config.manager import config, config_manager
from ..core.machine import VMManager
from ..core.capabilities import QEMUCapabilities
from ..core.vnc import DisplayManager

# Initialize SocketIO without an app
socketio = SocketIO(logger=False, engineio_logger=False)

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
    
    # Create console handler for our app logs
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s'
    ))
    console_handler.setLevel(logging.INFO)
    
    # Configure root logger for our application
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[file_handler, console_handler]
    )
    
    # Set Flask logger to use our handlers
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
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
    
    # Initialize extensions with logging disabled
    socketio.init_app(app, 
                     logger=False, 
                     engineio_logger=False,
                     cors_allowed_origins="*",
                     ping_timeout=5,
                     ping_interval=25,
                     log_output=False)
    
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