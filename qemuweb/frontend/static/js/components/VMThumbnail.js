Vue.component('vm-thumbnail', {
    props: {
        vmId: {
            type: String,
            required: true
        },
        vmState: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            socket: null,
            canvas: null,
            ctx: null,
            connected: false,
            refreshInterval: null,
            lastFrameTime: 0,
            maxWidth: 800,
            isInitialized: false,
            retryCount: 0,
            maxRetries: 3
        };
    },
    mounted() {
        // Don't initialize canvas here, wait for vmState watcher
        if (this.vmState === 'running') {
            this.$nextTick(() => {
                this.initializeCanvas();
            });
        }
    },
    beforeDestroy() {
        this.cleanup();
    },
    watch: {
        vmState: {
            immediate: true,
            handler(newState, oldState) {
                if (newState === 'running') {
                    this.$nextTick(() => {
                        this.initializeCanvas();
                        if (!this.socket) {
                            this.initializeDisplay();
                        }
                    });
                } else if (newState !== 'running' && this.socket) {
                    this.cleanup();
                }
            }
        }
    },
    methods: {
        initializeCanvas() {
            // Only initialize if canvas exists and isn't already initialized
            const canvasEl = this.$refs.canvas;
            if (canvasEl && !this.ctx) {
                this.canvas = canvasEl;
                this.ctx = this.canvas.getContext('2d');
                console.log('Canvas initialized successfully');
            }
        },
        initializeDisplay() {
            if (!this.ctx) {
                console.log('Waiting for canvas to be ready...');
                setTimeout(() => {
                    if (this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        this.initializeDisplay();
                    }
                }, 500);
                return;
            }
            
            this.setupSocket();
            
            // Wait a bit before starting the refresh interval to allow VM to initialize
            setTimeout(() => {
                if (!this.isInitialized && this.retryCount < this.maxRetries) {
                    console.log('Retrying display initialization...');
                    this.retryCount++;
                    this.cleanup();
                    this.initializeDisplay();
                    return;
                }
                
                // Only set up refresh interval if we're initialized
                if (this.isInitialized) {
                    this.refreshInterval = setInterval(() => {
                        if (this.connected && Date.now() - this.lastFrameTime > 1900) {
                            this.socket.emit('request_frame', { vm_id: this.vmId });
                        }
                    }, 2000);
                }
            }, 2000);
        },
        setupSocket() {
            if (this.socket) {
                this.cleanup();
            }
            
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Thumbnail socket connected');
                this.connected = true;
                this.socket.emit('init_display', { vm_id: this.vmId });
            });
            
            this.socket.on('disconnect', () => {
                console.log('Thumbnail socket disconnected');
                this.connected = false;
            });
            
            this.socket.on('error', (error) => {
                console.error('Thumbnail socket error:', error);
            });
            
            this.socket.on('vm_frame', this.handleFrame);
        },
        
        async handleFrame(data) {
            try {
                if (!this.ctx) {
                    return; // Canvas not ready yet
                }
                
                if (!data || !data.frame || typeof data.width !== 'number' || typeof data.height !== 'number') {
                    return;  // Silently ignore invalid frames during initialization
                }

                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = (error) => {
                        console.error('Failed to load frame image:', error);
                        reject(error);
                    };
                    img.src = `data:image/png;base64,${data.frame}`;
                });
                
                if (!this.$el || !this.canvas) {
                    return;  // Component is not ready yet
                }
                
                const containerWidth = this.$el.clientWidth;
                if (!containerWidth) {
                    return;  // Container not ready yet
                }
                
                const scale = Math.min(1, containerWidth / data.width);
                const width = Math.max(data.width * scale, 640);
                const height = Math.max(data.height * scale, 360);
                
                if (this.canvas.width !== width || this.canvas.height !== height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                }
                
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0, width, height);
                this.lastFrameTime = Date.now();
                
                // Mark as initialized after first successful frame
                if (!this.isInitialized) {
                    this.isInitialized = true;
                    console.log('Thumbnail display initialized successfully');
                }
            } catch (error) {
                console.error('Error loading thumbnail frame:', error);
            }
        },
        
        cleanup() {
            this.isInitialized = false;
            this.retryCount = 0;
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.connected = false;
            this.ctx = null;  // Clear context reference
        }
    },
    template: `
        <div class="vm-thumbnail">
            <div v-if="vmState === 'running'" class="relative">
                <canvas ref="canvas" class="rounded-lg shadow-md"></canvas>
                <div class="absolute top-2 right-2">
                    <div :class="['status-dot', connected ? 'connected' : 'disconnected']"></div>
                </div>
            </div>
            <div v-else class="placeholder rounded-lg shadow-md flex items-center justify-center">
                <span class="text-gray-500">{{ vmState === 'stopped' ? 'VM is stopped' : 'Loading...' }}</span>
            </div>
        </div>
    `
}); 