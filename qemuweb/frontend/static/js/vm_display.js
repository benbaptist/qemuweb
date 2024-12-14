class VMDisplay {
    constructor(canvasId, socket) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.socket = socket;
        this.scale = 1.0;
        this.framesReceived = 0;
        this.setupEventListeners();
        this.setupSocketHandlers();
        console.log('VMDisplay initialized');
    }

    setupSocketHandlers() {
        this.socket.on('vm_frame', async (data) => {
            console.log(`Received frame ${++this.framesReceived}: ${data.width}x${data.height}, ${data.frame.length} bytes`);
            
            const blob = new Blob([data.frame], { type: 'image/png' });
            const imgUrl = URL.createObjectURL(blob);
            const img = new Image();
            
            img.onload = () => {
                // Update canvas size if needed
                if (this.canvas.width !== data.width || this.canvas.height !== data.height) {
                    console.log(`Resizing canvas to ${data.width}x${data.height}`);
                    this.canvas.width = data.width;
                    this.canvas.height = data.height;
                }
                
                // Clear and draw new frame
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(imgUrl);
            };
            
            img.onerror = (error) => {
                console.error('Error loading frame image:', error);
            };
            
            img.src = imgUrl;
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            // Pass VM ID as a query parameter
            const vmId = new URLSearchParams(window.location.search).get('vm_id');
            if (vmId) {
                this.socket.emit('init_display', { vm_id: vmId });
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            this.socket.emit('vm_input', {
                type: 'mousemove',
                x: x,
                y: y
            });
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            this.socket.emit('vm_input', {
                type: 'mousedown',
                x: x,
                y: y,
                button: e.button
            });
        });

        this.canvas.addEventListener('mouseup', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            this.socket.emit('vm_input', {
                type: 'mouseup',
                x: x,
                y: y,
                button: e.button
            });
        });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (document.activeElement === this.canvas) {
                e.preventDefault();
                this.socket.emit('vm_input', {
                    type: 'keydown',
                    key: e.key
                });
            }
        });

        document.addEventListener('keyup', (e) => {
            if (document.activeElement === this.canvas) {
                e.preventDefault();
                this.socket.emit('vm_input', {
                    type: 'keyup',
                    key: e.key
                });
            }
        });
    }

    setScale(scale) {
        this.scale = scale;
        this.canvas.style.transform = `scale(${scale})`;
        this.canvas.style.transformOrigin = 'top left';
        console.log(`Display scale set to ${scale}`);
    }
} 