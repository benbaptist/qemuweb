import click
import eventlet
from pathlib import Path
eventlet.monkey_patch()

from .web.app import create_app, socketio
from .config.manager import ConfigManager, DEFAULT_CONFIG_DIR

@click.command()
@click.option('--host', default=None, help='Host to bind to')
@click.option('--port', default=None, type=int, help='Port to bind to')
@click.option('--debug/--no-debug', default=None, help='Enable debug mode')
@click.option('--config-dir', type=click.Path(path_type=Path), default=None,
              help=f'Configuration directory (default: {DEFAULT_CONFIG_DIR})')
def run(host, port, debug, config_dir):
    """Run the QEMU Web Interface"""
    # Initialize config manager with custom directory if provided
    config_manager = ConfigManager(config_dir)
    
    # Create Flask app
    app = create_app()
    
    # Override config with CLI arguments if provided
    web_config = config_manager.config['web_interface'].copy()
    if host is not None:
        web_config['host'] = host
    if port is not None:
        web_config['port'] = port
    if debug is not None:
        web_config['debug'] = debug
    
    socketio.run(app,
                host=web_config['host'],
                port=web_config['port'],
                debug=web_config['debug'],
                use_reloader=False) 