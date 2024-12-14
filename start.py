#!/usr/bin/env python3

import eventlet
eventlet.monkey_patch()

from qemuweb.web.app import create_app, socketio
from qemuweb.config.manager import config

def main():
    app = create_app()
    web_config = config['web_interface']
    socketio.run(app, 
                host=web_config['host'],
                port=web_config['port'],
                debug=web_config['debug'],
                use_reloader=False)

if __name__ == '__main__':
    main() 