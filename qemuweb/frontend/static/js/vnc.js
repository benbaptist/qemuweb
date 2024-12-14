class VNCDisplay {
    constructor(socket) {
        this.socket = socket;
        this.canvas = document.getElementById('vnc-display');
        this.ctx = this.canvas.getContext('2d');
        this.connected = false;
        this.currentVM = null;
        this.setupEventListeners();
    }

    connect(vmName) {
        if (this.connected) {
            this.disconnect();
        }
        
        this.currentVM = vmName;
        this.socket.emit('connect_display', { vm_name: vmName });
    }

    disconnect() {
        if (this.currentVM) {
            this.socket.emit('disconnect_display', { vm_name: this.currentVM });
            this.currentVM = null;
            this.connected = false;
            this.clearDisplay();
        }
    }

    clearDisplay() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    updateFrame(frame) {
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = 'data:image/jpeg;base64,' + frame;
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseEvent(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseEvent(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseEvent(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyEvent(e, true));
        document.addEventListener('keyup', (e) => this.handleKeyEvent(e, false));

        // Socket events
        this.socket.on('display_connected', (data) => {
            this.connected = data.status === 'success';
            if (!this.connected) {
                console.error('Failed to connect to display:', data.message);
            }
        });

        this.socket.on('display_frame', (data) => {
            if (data.vm_name === this.currentVM) {
                this.updateFrame(data.frame);
            }
        });
    }

    handleMouseEvent(e) {
        if (!this.connected || !this.currentVM) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) * (this.canvas.width / rect.width));
        const y = Math.floor((e.clientY - rect.top) * (this.canvas.height / rect.height));
        
        let buttonMask = 0;
        if (e.buttons !== undefined) {
            if (e.buttons & 1) buttonMask |= 1;      // Left
            if (e.buttons & 2) buttonMask |= 4;      // Right
            if (e.buttons & 4) buttonMask |= 2;      // Middle
        }

        this.socket.emit('pointer_event', {
            vm_name: this.currentVM,
            x: x,
            y: y,
            button_mask: buttonMask
        });
    }

    handleKeyEvent(e, down) {
        if (!this.connected || !this.currentVM) return;
        
        // Prevent default browser actions for certain keys
        if (e.key === 'F11' || e.key === 'F5' || 
            (e.ctrlKey && (e.key === 'r' || e.key === 'w'))) {
            e.preventDefault();
        }

        this.socket.emit('key_event', {
            vm_name: this.currentVM,
            key_code: this.translateKeyCode(e),
            down: down
        });
    }

    translateKeyCode(e) {
        // This is a simplified key translation
        // In a real implementation, you'd want a more complete mapping
        return e.keyCode;
    }
} 