import click
import eventlet
eventlet.monkey_patch()

from .web.app import create_app, socketio
from .config.manager import config, DEFAULT_CONFIG

@click.command()
@click.option('--host', default=None, help='Host to bind to')
@click.option('--port', default=None, type=int, help='Port to bind to')
@click.option('--debug/--no-debug', default=None, help='Enable debug mode')
def run(host, port, debug):
    """Run the QEMU Web Interface"""
    app = create_app()
    
    # Override config with CLI arguments if provided
    web_config = config['web_interface'].copy()
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