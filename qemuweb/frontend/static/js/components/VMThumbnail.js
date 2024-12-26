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
            lastFrameTime: 0
        };
    },
    mounted() {
        this.canvas = this.$refs.canvas;
        this.ctx = this.canvas.getContext('2d');
        if (this.vmState === 'running') {
            this.setupSocket();
            // Request a new frame every 2 seconds
            this.refreshInterval = setInterval(() => {
                if (this.connected && Date.now() - this.lastFrameTime > 1900) {
                    this.socket.emit('request_frame', { vm_id: this.vmId });
                }
            }, 2000);
        }
    },
    beforeDestroy() {
        this.cleanup();
    },
    watch: {
        vmState(newState) {
            if (newState === 'running' && !this.socket) {
                this.setupSocket();
            } else if (newState !== 'running' && this.socket) {
                this.cleanup();
            }
        }
    },
    methods: {
        setupSocket() {
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
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = `data:image/png;base64,${data.frame}`;
                });
                
                // Update canvas size if needed while maintaining aspect ratio
                const maxWidth = 320;  // Maximum thumbnail width
                const scale = Math.min(1, maxWidth / data.width);
                const width = data.width * scale;
                const height = data.height * scale;
                
                if (this.canvas.width !== width || this.canvas.height !== height) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                }
                
                // Clear and draw new frame
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0, width, height);
                this.lastFrameTime = Date.now();
            } catch (error) {
                console.error('Error loading thumbnail frame:', error);
            }
        },
        
        cleanup() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.connected = false;
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