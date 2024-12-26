Vue.component('vm-display', {
    template: `
        <div class="fixed inset-0 bg-black flex flex-col">
            <!-- Controls overlay - higher z-index than the display -->
            <div class="absolute top-4 right-4 z-[200] flex gap-4">
                <!-- Scale dropdown -->
                <div class="relative">
                    <button @click="showScaleMenu = !showScaleMenu" class="bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 flex items-center justify-center">
                        <i class="fas fa-search text-xl"></i>
                    </button>
                    <div v-if="showScaleMenu" class="absolute right-0 mt-2 py-2 w-48 bg-gray-800 rounded-lg shadow-xl">
                        <button @click="setScale(1.0); showScaleMenu = false" class="block w-full px-4 py-2 text-white hover:bg-gray-700">100%</button>
                        <button @click="setScale(1.5); showScaleMenu = false" class="block w-full px-4 py-2 text-white hover:bg-gray-700">150%</button>
                        <button @click="setScale(2.0); showScaleMenu = false" class="block w-full px-4 py-2 text-white hover:bg-gray-700">200%</button>
                        <button @click="fitToWindow(); showScaleMenu = false" class="block w-full px-4 py-2 text-white hover:bg-gray-700">Fit to Window</button>
                    </div>
                </div>
                <!-- Close button -->
                <button @click="$emit('close')" class="bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 flex items-center justify-center">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>

            <!-- Display container -->
            <div class="flex-1 flex items-center justify-center overflow-hidden touch-none" ref="container" 
                @wheel="handleWheel"
                @touchstart="handleTouchStart"
                @touchmove="handleTouchMove"
                @touchend="handleTouchEnd"
                @mousemove="handleMouseMove">
                <div class="w-full h-full flex items-center justify-center" :style="transformStyle">
                    <canvas ref="canvas" tabindex="1" @contextmenu.prevent></canvas>
                </div>
            </div>
        </div>
    `,

    props: {
        vmId: {
            type: String,
            required: true
        }
    },

    data() {
        return {
            socket: null,
            canvas: null,
            ctx: null,
            scale: 1.0,
            panX: 0,
            panY: 0,
            framesReceived: 0,
            connected: false,
            resizeObserver: null,
            showScaleMenu: false,
            touchState: {
                lastTouchDistance: null,
                lastPanPosition: null,
                isPanning: false,
                lastMousePosition: null,
                isMovingMouse: false
            },
            mouseState: {
                lastPosition: null,
                isDown: false
            }
        };
    },

    computed: {
        transformStyle() {
            return {
                transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`,
                transformOrigin: 'center'
            };
        }
    },

    mounted() {
        console.log('VMDisplay mounted');
        this.canvas = this.$refs.canvas;
        this.ctx = this.canvas.getContext('2d');
        this.setupSocket();
        this.setupEventListeners();
        
        // Setup resize observer
        this.resizeObserver = new ResizeObserver(() => {
            this.fitToWindow();
        });
        this.resizeObserver.observe(this.$refs.container);
        
        // Initial fit
        this.$nextTick(() => {
            this.fitToWindow();
        });
    },

    beforeDestroy() {
        this.cleanup();
    },

    methods: {
        setupSocket() {
            console.log('Setting up socket connection');
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Socket connected');
                this.connected = true;
                this.socket.emit('init_display', { vm_id: this.vmId });
            });
            
            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
                this.connected = false;
            });
            
            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                this.$emit('error', error);
            });
            
            this.socket.on('vm_frame', this.handleFrame);
        },
        
        async handleFrame(data) {
            console.log(`Received frame ${++this.framesReceived}: ${data.width}x${data.height}`);
            
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = `data:image/png;base64,${data.frame}`;
                });
                
                // Update canvas size if needed
                if (this.canvas.width !== data.width || this.canvas.height !== data.height) {
                    console.log(`Resizing canvas to ${data.width}x${data.height}`);
                    this.canvas.width = data.width;
                    this.canvas.height = data.height;
                }
                
                // Clear and draw new frame
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0);
            } catch (error) {
                console.error('Error loading frame:', error);
            }
        },
        
        setupEventListeners() {
            // Mouse events
            this.canvas.addEventListener('mousemove', this.handleMouseMove);
            this.canvas.addEventListener('mousedown', this.handleMouseDown);
            this.canvas.addEventListener('mouseup', this.handleMouseUp);
            
            // Keyboard events
            document.addEventListener('keydown', this.handleKeyDown);
            document.addEventListener('keyup', this.handleKeyUp);
        },
        
        handleMouseMove(e) {
            if (!this.connected) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            
            this.socket.emit('vm_input', { 
                type: 'mousemove',
                x: x,
                y: y
            });
        },
        
        handleMouseDown(e) {
            if (!this.connected) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            this.socket.emit('vm_input', { type: 'mousedown', x, y, button: e.button });
        },
        
        handleMouseUp(e) {
            if (!this.connected) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.scale);
            const y = Math.floor((e.clientY - rect.top) / this.scale);
            this.socket.emit('vm_input', { type: 'mouseup', x, y, button: e.button });
        },
        
        handleKeyDown(e) {
            if (!this.connected || document.activeElement !== this.canvas) return;
            e.preventDefault();
            this.socket.emit('vm_input', { type: 'keydown', key: e.key });
        },
        
        handleKeyUp(e) {
            if (!this.connected || document.activeElement !== this.canvas) return;
            e.preventDefault();
            this.socket.emit('vm_input', { type: 'keyup', key: e.key });
        },

        handleWheel(e) {
            if (e.ctrlKey) {
                // Zoom
                e.preventDefault();
                const delta = e.deltaY * -0.01;
                const newScale = Math.max(0.1, Math.min(5, this.scale + delta));
                this.scale = newScale;
            } else {
                // Pan
                this.panX -= e.deltaX;
                this.panY -= e.deltaY;
            }
        },

        handleTouchStart(e) {
            if (e.touches.length === 2) {
                // Two fingers - pan/zoom the view
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.touchState.lastTouchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                this.touchState.isPanning = true;
                this.touchState.isMovingMouse = false;
            } else if (e.touches.length === 1) {
                // One finger - move the mouse cursor
                this.touchState.lastMousePosition = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
                this.touchState.isMovingMouse = true;
                this.touchState.isPanning = false;
            }
        },

        handleTouchMove(e) {
            e.preventDefault();
            
            if (e.touches.length === 2 && this.touchState.isPanning) {
                // Two fingers - pan/zoom the view
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );

                if (this.touchState.lastTouchDistance) {
                    const delta = distance - this.touchState.lastTouchDistance;
                    const newScale = Math.max(0.1, Math.min(5, this.scale + delta * 0.01));
                    this.scale = newScale;
                }

                // Calculate center point for panning
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;
                
                if (this.touchState.lastPanPosition) {
                    this.panX += centerX - this.touchState.lastPanPosition.x;
                    this.panY += centerY - this.touchState.lastPanPosition.y;
                }

                this.touchState.lastPanPosition = { x: centerX, y: centerY };
                this.touchState.lastTouchDistance = distance;
            } else if (e.touches.length === 1 && this.touchState.isMovingMouse) {
                // One finger - move the mouse cursor
                const touch = e.touches[0];
                if (this.touchState.lastMousePosition) {
                    const deltaX = touch.clientX - this.touchState.lastMousePosition.x;
                    const deltaY = touch.clientY - this.touchState.lastMousePosition.y;
                    
                    // Get current mouse position relative to canvas
                    const rect = this.canvas.getBoundingClientRect();
                    const x = Math.floor((touch.clientX - rect.left) / this.scale);
                    const y = Math.floor((touch.clientY - rect.top) / this.scale);
                    
                    // Send mouse movement
                    if (this.connected) {
                        this.socket.emit('vm_input', { 
                            type: 'mousemove',
                            x: x,
                            y: y
                        });
                    }
                }
                
                this.touchState.lastMousePosition = {
                    x: touch.clientX,
                    y: touch.clientY
                };
            }
        },

        handleTouchEnd(e) {
            if (e.touches.length === 0) {
                // All fingers lifted
                this.touchState.lastTouchDistance = null;
                this.touchState.lastPanPosition = null;
                this.touchState.isPanning = false;
                this.touchState.isMovingMouse = false;
                this.touchState.lastMousePosition = null;
            } else if (e.touches.length === 1) {
                // One finger remaining - switch to mouse movement mode
                this.touchState.isPanning = false;
                this.touchState.isMovingMouse = true;
                this.touchState.lastMousePosition = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            }
        },
        
        setScale(scale) {
            this.scale = scale;
        },
        
        fitToWindow() {
            const container = this.$refs.container;
            if (!container || !this.canvas) return;

            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const canvasAspect = this.canvas.width / this.canvas.height;
            const containerAspect = containerWidth / containerHeight;

            if (containerAspect > canvasAspect) {
                this.scale = containerHeight / this.canvas.height;
            } else {
                this.scale = containerWidth / this.canvas.width;
            }

            // Reset pan position
            this.panX = 0;
            this.panY = 0;
        },
        
        cleanup() {
            if (this.canvas) {
                this.canvas.removeEventListener('mousemove', this.handleMouseMove);
                this.canvas.removeEventListener('mousedown', this.handleMouseDown);
                this.canvas.removeEventListener('mouseup', this.handleMouseUp);
            }
            
            document.removeEventListener('keydown', this.handleKeyDown);
            document.removeEventListener('keyup', this.handleKeyUp);
            
            if (this.socket) {
                this.socket.disconnect();
            }
            
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
        }
    }
});