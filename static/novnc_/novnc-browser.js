// Browser-compatible noVNC bundle
(function(window) {
    "use strict";
    
    // Core RFB implementation
    class RFB {
        constructor(target, url, options) {
            this._target = target;
            this._url = url;
            this._options = options || {};
            this._websocket = null;
            this._display = null;
            this._keyboard = null;
            this._mouse = null;
            
            this._init();
        }

        _init() {
            // Create WebSocket connection
            this._websocket = new WebSocket(this._url);
            
            // Set up event handlers
            this._websocket.onopen = () => {
                this._dispatchEvent('connect');
            };
            
            this._websocket.onclose = (evt) => {
                this._dispatchEvent('disconnect', { reason: evt.reason });
            };
            
            this._websocket.onerror = (evt) => {
                this._dispatchEvent('error', { message: 'WebSocket error' });
            };
            
            // Initialize display
            this._initDisplay();
        }

        _initDisplay() {
            // Create canvas if it doesn't exist
            if (!this._target.querySelector('canvas')) {
                const canvas = document.createElement('canvas');
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                this._target.appendChild(canvas);
            }
        }

        _dispatchEvent(type, detail) {
            const event = new CustomEvent(type, { detail });
            this._target.dispatchEvent(event);
        }

        // Public methods
        disconnect() {
            if (this._websocket) {
                this._websocket.close();
            }
        }

        sendCtrlAltDel() {
            // Implement key combination sending
            console.log('Ctrl+Alt+Del requested');
        }

        // Add getters/setters for various properties
        get scaleViewport() {
            return this._options.scaleViewport || false;
        }

        set scaleViewport(value) {
            this._options.scaleViewport = value;
        }

        get scaleFactor() {
            return this._options.scaleFactor || 1.0;
        }

        set scaleFactor(value) {
            this._options.scaleFactor = value;
        }
    }

    // Expose RFB to the window object
    window.RFB = RFB;
})(window); 