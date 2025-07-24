Vue.component('vm-display', {
    template: `
        <div class="fixed inset-0 bg-black flex flex-col select-none">

            <!-- Desktop Toolbar -->
            <div v-if="isDesktop" 
                 class="flex-none w-full p-2 bg-gray-800 text-white z-50 flex justify-between items-center"
                 :class="{ 'hidden': isFullscreen }">
                <!-- Left Aligned Controls -->
                <div class="flex items-center gap-2">
                    <div class="relative">
                        <button @click="showScaleMenu = !showScaleMenu" class="p-2 rounded hover:bg-gray-700 flex items-center">
                            <i class="fas fa-search-plus mr-1"></i> {{ Math.round(scale * 100) }}%
                        </button>
                        <div v-if="showScaleMenu" class="absolute left-0 mt-1 py-1 w-40 bg-gray-700 rounded shadow-xl">
                            <a @click.prevent="setScale(1.0); showScaleMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">100%</a>
                            <a @click.prevent="setScale(1.5); showScaleMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">150%</a>
                            <a @click.prevent="setScale(2.0); showScaleMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">200%</a>
                            <hr class="border-gray-600 my-1">
                            <a @click.prevent="fitToWindow(); showScaleMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Fit to Window</a>
                            <a @click.prevent="zoomToActual(); showScaleMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Actual Size (100%)</a>
                        </div>
                    </div>
                    <div class="relative">
                        <button @click="showKeyboardMenu = !showKeyboardMenu" class="p-2 rounded hover:bg-gray-700 flex items-center" title="Keyboard Shortcuts">
                            <i class="fas fa-keyboard mr-1"></i> Shortcuts
                        </button>
                        <div v-if="showKeyboardMenu" class="absolute left-0 mt-1 py-1 w-48 bg-gray-700 rounded shadow-xl">
                            <a @click.prevent="sendCtrlAltDel(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+Alt+Delete</a>
                            <a @click.prevent="sendPrintScreen(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Print Screen</a>
                            <a @click.prevent="sendAltTab(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Alt+Tab</a>
                            <hr class="border-gray-600 my-1">
                            <a @click.prevent="sendCtrlC(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+C (Copy)</a>
                            <a @click.prevent="sendCtrlV(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+V (Paste)</a>
                            <a @click.prevent="sendCtrlX(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+X (Cut)</a>
                            <hr class="border-gray-600 my-1">
                            <a @click.prevent="sendCtrlZ(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+Z (Undo)</a>
                            <a @click.prevent="sendCtrlY(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Ctrl+Y (Redo)</a>
                            <a @click.prevent="sendWindowsKey(); showKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer">Windows Key</a>
                        </div>
                    </div>
                    <!-- Add more desktop controls here -->
                </div>
                <!-- Right Aligned Controls -->
                <div class="flex items-center gap-2">
                    <button @click="toggleFullscreen" class="p-2 rounded hover:bg-gray-700" title="Toggle Fullscreen">
                        <i class="fas" :class="isFullscreen ? 'fa-compress' : 'fa-expand'"></i>
                    </button>
                    <button @click="closeDisplay" class="p-2 rounded bg-red-600 hover:bg-red-500" title="Close VM Display">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Mobile FAB -->
            <div v-if="isMobile && !mobileToolbarOpen"
                 class="absolute p-3 bg-blue-600 text-white rounded-full shadow-lg cursor-pointer z-50"
                 :style="{ bottom: '20px', right: '20px' }"
                 @click="openMobileToolbar">
                <i class="fas fa-bars text-lg"></i>
            </div>

            <!-- Mobile Toolbar (Overlay) -->
            <div v-if="isMobile && mobileToolbarOpen"
                 class="absolute bottom-0 left-0 right-0 p-3 bg-gray-800 bg-opacity-90 z-40 flex flex-col gap-2 items-center text-white">
                 <div class="flex justify-around w-full mb-2">
                    <button @click="fitToWindow()" class="p-2 text-sm rounded hover:bg-gray-700">Fit</button>
                    <button @click="zoomToActual()" class="p-2 text-sm rounded hover:bg-gray-700">Actual</button>
                    <div class="relative">
                        <button @click="showMobileKeyboardMenu = !showMobileKeyboardMenu" class="p-2 text-sm rounded hover:bg-gray-700" title="Keyboard Shortcuts">Shortcuts</button>
                        <div v-if="showMobileKeyboardMenu" class="absolute bottom-full left-0 mb-1 py-1 w-40 bg-gray-700 rounded shadow-xl">
                            <a @click.prevent="sendCtrlAltDel(); showMobileKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer text-sm">Ctrl+Alt+Del</a>
                            <a @click.prevent="sendPrintScreen(); showMobileKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer text-sm">Print Screen</a>
                            <a @click.prevent="sendAltTab(); showMobileKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer text-sm">Alt+Tab</a>
                            <hr class="border-gray-600 my-1">
                            <a @click.prevent="sendCtrlC(); showMobileKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer text-sm">Copy</a>
                            <a @click.prevent="sendCtrlV(); showMobileKeyboardMenu = false" class="block px-3 py-1 text-white hover:bg-gray-600 cursor-pointer text-sm">Paste</a>
                        </div>
                    </div>
                 </div>
                 <div class="flex justify-around w-full">
                    <button @click="triggerVirtualKeyboard" class="p-2 rounded hover:bg-gray-700" title="Show Virtual Keyboard"><i class="fas fa-keyboard text-lg"></i></button>
                    <button @click="toggleFullscreen" class="p-2 rounded hover:bg-gray-700" title="Toggle Fullscreen"><i class="fas" :class="isFullscreen ? 'fa-compress' : 'fa-expand'"></i></button>
                    <button @click="closeMobileToolbar" class="p-2 rounded hover:bg-gray-700"><i class="fas fa-chevron-down text-lg"></i></button>
                    <button @click="closeDisplay" class="p-2 rounded bg-red-600 hover:bg-red-500" title="Close VM Display"><i class="fas fa-times text-lg"></i></button>
                 </div>
            </div>
            
            <!-- Virtual Keyboard Input (Hidden) -->
            <textarea v-if="isMobile" ref="virtualKeyboardInput" 
                      class="absolute opacity-0 pointer-events-none" 
                      style="left: -9999px; top: -9999px; resize: none;"
                      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                      @input="handleVirtualKeyboardInput"
                      @keydown="handleVirtualKeyboardKeyDown"
                      @blur="handleVirtualKeyboardBlur"></textarea>
            
            <!-- Display Area -->
            <div class="flex-1 overflow-hidden touch-none" ref="container" 
                @wheel.prevent="handleWheel"
                @mousedown.prevent="handleContainerMouseDown"
                @mousemove.prevent="handleContainerMouseMove"
                @mouseup.prevent="handleContainerMouseUp"
                @touchstart.prevent="handleTouchStart"
                @touchmove.prevent="handleTouchMove"
                @touchend.prevent="handleTouchEnd">
                
                <!-- Powered Off Overlay -->
                <div v-if="vmStatus === 'stopped'" 
                     class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-40">
                    <div class="text-center">
                        <div class="text-6xl mb-4">
                            <i class="fas fa-power-off text-gray-400"></i>
                        </div>
                        <h2 class="text-2xl font-bold mb-4">VM Powered Off</h2>
                        <p class="text-gray-300 mb-6">The virtual machine is currently stopped.</p>
                        <button @click="startVM" 
                                :disabled="startingVM"
                                class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center mx-auto">
                            <i v-if="startingVM" class="fas fa-spinner fa-spin mr-2"></i>
                            <i v-else class="fas fa-play mr-2"></i>
                            {{ startingVM ? 'Starting...' : 'Start VM' }}
                        </button>
                    </div>
                </div>
                
                <!-- Loading Overlay -->
                <div v-if="vmStatus === 'unknown'" 
                     class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-40">
                    <div class="text-center">
                        <div class="text-6xl mb-4">
                            <i class="fas fa-spinner fa-spin text-gray-400"></i>
                        </div>
                        <h2 class="text-2xl font-bold mb-4">Loading VM Status</h2>
                        <p class="text-gray-300">Checking virtual machine status...</p>
                    </div>
                </div>
                
                <!-- Reconnecting Overlay -->
                <div v-if="vmStatus === 'running' && reconnecting && !connected" 
                     class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-40">
                    <div class="text-center">
                        <div class="text-6xl mb-4">
                            <i class="fas fa-spinner fa-spin text-blue-400"></i>
                        </div>
                        <h2 class="text-2xl font-bold mb-4">Connecting to Display</h2>
                        <p class="text-gray-300">Establishing connection to virtual machine display...</p>
                    </div>
                </div>
                
                <canvas ref="canvas" tabindex="0" @contextmenu.prevent="handleContextMenu"
                        class="outline-none" 
                        :style="canvasStyle">
                </canvas>
            </div>
        </div>
    `,

    props: {
        vmId: { type: String, required: true }
    },

    data() {
        return {
            // Connection & VM Data
            socket: null,
            connected: false,
            vmCanvasWidth: 0,
            vmCanvasHeight: 0,
            framesReceived: 0,
            vmStatus: 'unknown', // Track VM status: 'running', 'stopped', 'unknown'
            startingVM: false, // Track if VM is currently starting
            reconnecting: false, // Track if we're in the middle of reconnection attempts

            // Display & Interaction State
            scale: 1.0,
            minScale: 0.1, // True minimum zoom level (e.g., 10%)
            maxScale: 5.0,
            panX: 0,
            panY: 0,
            isPanningWithMouse: false, // Specifically for mouse dragging
            lastMousePanPosition: { x: 0, y: 0 },
            isInFitToWindowMode: false, // Track if user is in fit-to-window mode
            lastViewportSize: { width: 0, height: 0 }, // Track viewport size for resize detection

            // Toolbar State
            isDesktop: !(/Mobi|Android/i.test(navigator.userAgent)),
            showScaleMenu: false,
            showKeyboardMenu: false,
            isMobile: /Mobi|Android/i.test(navigator.userAgent),
            mobileToolbarOpen: false,
            showMobileKeyboardMenu: false,
            
            // Fullscreen State
            isFullscreen: false,

            // Touch State
            touchState: {
                lastPinchDistance: null,
                // For two-finger pan
                lastTwoFingerPanPosition: { x: 0, y: 0},
                activeTouches: 0,
                isPinching: false,
                isTwoFingerPanning: false,
                hasPerformedGesture: false, // Track if any gesture occurred during this touch session
                gestureThreshold: 10, // Minimum movement to consider a gesture
                // For trackpad-like behavior
                lastSingleTouchPosition: null, 
                singleTouchStartPosition: null,
                isDraggingMouse: false,
                tapStartInfo: null, // { time: Date.now(), pos: {x,y}, count: 1|2 }
                twoFingerTapStartInfo: null,
                // Current mouse position on VM
                currentMouseX: 0,
                currentMouseY: 0,
            },
            
            // Input state
            mouseButtons: 0, // Bitmask for mouse buttons (0:left, 1:middle, 2:right)

            // Observers & Timers
            resizeObserver: null,
        };
    },

    computed: {
        canvasStyle() {
            return {
                transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`,
                transformOrigin: '0 0',
            };
        },
        containerObserverTarget() {
            return this.$refs.container;
        }
    },

    watch: {
        connected(newVal) {
            if (newVal) {
                this.$nextTick(() => {
                    if (this.$refs.canvas) {
                         this.$refs.canvas.focus();
                    }
                    // Initial fit done in mounted after vmCanvas dimensions are potentially available
                });
            }
        },
        containerObserverTarget(newTarget, oldTarget) {
            if (this.resizeObserver) {
                if (oldTarget) this.resizeObserver.unobserve(oldTarget);
                if (newTarget) this.resizeObserver.observe(newTarget);
            }
        },
        vmStatus(newStatus) {
            // When VM status changes, update connection state
            if (newStatus === 'stopped') {
                this.connected = false;
            } else if (newStatus === 'running' && !this.connected) {
                // VM is now running but we're not connected, try to reconnect
                this.$nextTick(() => {
                    this.reconnectDisplay();
                });
            }
        }
    },

    mounted() {
        this.setupSocket();
        this.setupGlobalEventListeners();
        this.setupResizeObserver();
        this.loadVMStatus();
        
        // Set up periodic status check for the overlay
        this.statusCheckInterval = setInterval(() => {
            if (this.vmStatus === 'stopped' || this.vmStatus === 'unknown' || this.startingVM) {
                this.loadVMStatus();
            }
        }, 2000); // Check every 2 seconds for stopped/unknown/starting states
        
        this.$nextTick(() => {
            if (this.containerObserverTarget) {
                this.resizeObserver.observe(this.containerObserverTarget);
                // Initialize viewport size tracking
                const rect = this.containerObserverTarget.getBoundingClientRect();
                this.lastViewportSize = { width: rect.width, height: rect.height };
            }
            // Initial fit will happen on first frame or if vmCanvas dimensions already known
            if(this.vmCanvasWidth > 0 && this.vmCanvasHeight > 0){
                this.fitToWindow(); // Enable fit-to-window mode by default
            }
            if (this.$refs.canvas) {
                 this.$refs.canvas.focus();
            }
        });
    },

    beforeDestroy() {
        this.cleanup();
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
    },

    methods: {
        // --- VM Status Management ---
        async loadVMStatus() {
            try {
                const response = await fetch(`/api/vms/${this.vmId}/status`);
                if (response.ok) {
                    const data = await response.json();
                    this.vmStatus = data.running ? 'running' : 'stopped';
                } else {
                    this.vmStatus = 'unknown';
                }
            } catch (error) {
                console.error('Failed to load VM status:', error);
                this.vmStatus = 'unknown';
            }
        },
        
        async startVM() {
            if (this.startingVM) return; // Prevent multiple simultaneous start requests
            
            this.startingVM = true;
            try {
                const response = await fetch(`/api/vms/${this.vmId}/start`, {
                    method: 'POST'
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to start VM: ${response.statusText}`);
                }

                // VM started successfully, status will be updated via WebSocket
                console.log('VM start request sent successfully');
                
                // Check status immediately and then periodically
                this.loadVMStatus();
                setTimeout(() => {
                    this.loadVMStatus();
                }, 1000);
                setTimeout(() => {
                    this.loadVMStatus();
                }, 3000);
                
            } catch (error) {
                console.error('Failed to start VM:', error);
                // You could show an error message to the user here
            } finally {
                this.startingVM = false;
            }
        },
        
        reconnectDisplay() {
            console.log('Attempting to reconnect display for VM:', this.vmId);
            
            // Set reconnecting flag
            this.reconnecting = true;
            
            // Clean up existing socket connection
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            
            // Reset connection state
            this.connected = false;
            this.framesReceived = 0;
            
            // Try to reconnect with retries
            this.attemptReconnect(0);
        },
        
        attemptReconnect(attemptCount) {
            const maxAttempts = 10; // Try for about 10 seconds
            const delay = 1000; // 1 second between attempts
            
            if (attemptCount >= maxAttempts) {
                console.log('Max reconnection attempts reached, giving up');
                this.reconnecting = false; // Clear reconnecting flag
                return;
            }
            
            console.log(`Reconnection attempt ${attemptCount + 1}/${maxAttempts}`);
            
            // Wait before attempting to reconnect
            setTimeout(() => {
                this.setupSocket();
                
                // Check if connection was successful after a short delay
                setTimeout(() => {
                    if (!this.connected) {
                        console.log('Reconnection failed, will retry...');
                        this.attemptReconnect(attemptCount + 1);
                    } else {
                        console.log('Reconnection successful!');
                        this.reconnecting = false; // Clear reconnecting flag
                    }
                }, 2000);
            }, delay);
        },

        // --- Toolbar Actions ---
        openMobileToolbar() {
            this.mobileToolbarOpen = true;
        },
        closeMobileToolbar() {
            this.mobileToolbarOpen = false;
        },
        closeDisplay() {
            this.$emit('close');
        },
        sendCtrlAltDel() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'Alt', code: 'AltLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'Delete', code: 'Delete' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Delete', code: 'Delete' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Alt', code: 'AltLeft' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        toggleFullscreen() {
            if (!document.fullscreenElement) {
                this.$el.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            } else {
                document.exitFullscreen();
            }
        },

        // --- Socket & VM Frame Handling ---
        setupSocket() {
            this.socket = io();
            this.socket.on('connect', () => {
                this.connected = true;
                this.socket.emit('init_display', { vm_id: this.vmId });
            });
            this.socket.on('disconnect', () => this.connected = false);
            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                // Don't show error messages during reconnection attempts
                if (!this.reconnecting) {
                    console.error('Display connection error:', error);
                }
            });
            this.socket.on('vm_frame', this.handleFrame);
            this.socket.on('resolution_changed', this.handleResolutionChange);
            
            // Listen for VM status changes
            this.socket.on('vm_stopped', (data) => {
                if (data.name === this.vmId) {
                    this.vmStatus = 'stopped';
                }
            });
            
            // Listen for VM status updates
            this.socket.on('vm_status', (data) => {
                if (data.name === this.vmId) {
                    this.vmStatus = data.running ? 'running' : 'stopped';
                }
            });
        },
        async handleFrame(data) {
            this.framesReceived++;
            if (!this.$refs.canvas) return;
            const canvas = this.$refs.canvas;
            const ctx = canvas.getContext('2d');

            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    // Support both JPEG (optimized) and PNG formats
            const format = data.format || 'png';  // Default to PNG for backwards compatibility
            img.src = `data:image/${format};base64,${data.frame}`;
                });

                let dimensionsChanged = false;
                if (this.vmCanvasWidth !== data.width || this.vmCanvasHeight !== data.height) {
                    console.log(`Resolution changed: ${this.vmCanvasWidth}x${this.vmCanvasHeight} → ${data.width}x${data.height}`);
                    
                    // Store old dimensions for smooth transition
                    const oldWidth = this.vmCanvasWidth;
                    const oldHeight = this.vmCanvasHeight;
                    
                    // Update our tracked dimensions
                    this.vmCanvasWidth = data.width;
                    this.vmCanvasHeight = data.height;
                    
                    // Update canvas internal drawing surface
                    canvas.width = data.width;
                    canvas.height = data.height;
                    
                    // Reset scale and pan to prevent weird cropping
                    this.scale = 1.0;
                    this.panX = 0;
                    this.panY = 0;
                    
                    // Initialize mouse position to center of screen for mobile
                    if (this.isMobile) {
                        this.touchState.currentMouseX = data.width / 2;
                        this.touchState.currentMouseY = data.height / 2;
                    }
                    
                    dimensionsChanged = true;
                }
                
                ctx.drawImage(img, 0, 0);

                if (dimensionsChanged) {
                    // Use multiple nextTick calls to ensure DOM is fully updated
                    this.$nextTick(() => {
                        this.$nextTick(() => {
                            this.fitToWindow(); // Enable fit-to-window mode on resolution change
                            console.log(`Resolution change handled: canvas=${canvas.width}x${canvas.height}, scale=${this.scale}`);
                        });
                    });
                } else if (this.framesReceived === 1) {
                    // Initialize mouse position for first frame on mobile
                    if (this.isMobile) {
                        this.touchState.currentMouseX = data.width / 2;
                        this.touchState.currentMouseY = data.height / 2;
                    }
                    this.$nextTick(() => this.fitToWindow()); // Enable fit-to-window mode on first frame
                }
            } catch (error) {
                console.error('Error loading frame:', error);
            }
        },

        handleResolutionChange(data) {
            console.log(`Received resolution change event: ${data.old_width}x${data.old_height} → ${data.new_width}x${data.new_height}`);
            
            // Pre-prepare for the resolution change
            const canvas = this.$refs.canvas;
            if (canvas) {
                // Clear any stale content
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Update canvas size immediately
                canvas.width = data.new_width;
                canvas.height = data.new_height;
                
                // Update our tracking variables
                this.vmCanvasWidth = data.new_width;
                this.vmCanvasHeight = data.new_height;
                
                // Reset scale and positioning for clean slate
                this.scale = 1.0;
                this.panX = 0;
                this.panY = 0;
                
                // Fit to window after resolution change
                this.$nextTick(() => {
                    this.$nextTick(() => {
                        this.fitToWindow(); // Enable fit-to-window mode on resolution change
                        console.log(`Resolution change pre-handled successfully`);
                    });
                });
            }
        },

        // --- Scaling and Panning Logic ---
        setScale(newScale, pivotClientX, pivotClientY) {
            if (!this.$refs.container || !this.vmCanvasWidth || !this.vmCanvasHeight) return;
            
            const containerRect = this.$refs.container.getBoundingClientRect();
            const currentScale = this.scale;
            
            newScale = Math.max(this.minScale, Math.min(newScale, this.maxScale));
            if (Math.abs(newScale - currentScale) < 0.001) return; // Avoid tiny changes

            const pivotX = pivotClientX === undefined ? containerRect.width / 2 : pivotClientX - containerRect.left;
            const pivotY = pivotClientY === undefined ? containerRect.height / 2 : pivotClientY - containerRect.top;

            const canvasPivotX = (pivotX - this.panX) / currentScale;
            const canvasPivotY = (pivotY - this.panY) / currentScale;

            this.scale = newScale;

            this.panX = pivotX - (canvasPivotX * this.scale);
            this.panY = pivotY - (canvasPivotY * this.scale);
            
            this.checkBoundsAndAdjustPan();
            this.showScaleMenu = false;
            
            // Manual scaling disables fit-to-window mode
            this.isInFitToWindowMode = false;
        },
        fitToWindow(isAutoResize = false) {
            if (!this.$refs.container || !this.vmCanvasWidth || !this.vmCanvasHeight) return;
            
            const container = this.$refs.container;
            const availableWidth = container.clientWidth;
            const availableHeight = container.clientHeight;

            if (availableWidth === 0 || availableHeight === 0) return; // Container not ready

            const newScaleX = availableWidth / this.vmCanvasWidth;
            const newScaleY = availableHeight / this.vmCanvasHeight;
            const newFitScale = Math.min(newScaleX, newScaleY);

            // Ensure scale is not less than the defined minScale, but don't update minScale itself here.
            this.scale = Math.max(this.minScale, newFitScale);
            
            this.panX = (availableWidth - (this.vmCanvasWidth * this.scale)) / 2;
            this.panY = (availableHeight - (this.vmCanvasHeight * this.scale)) / 2;
            
            this.checkBoundsAndAdjustPan();
            
            // Set fit-to-window mode flag when called explicitly (not during auto-resize)
            if (!isAutoResize) {
                this.isInFitToWindowMode = true;
            }
        },
        zoomToActual() {
            if (!this.$refs.container) return;
            const containerRect = this.$refs.container.getBoundingClientRect();
            // Pivot around center of container for zoomToActual
            this.setScale(1.0, containerRect.left + containerRect.width / 2, containerRect.top + containerRect.height / 2);
            // Zoom to actual disables fit-to-window mode
            this.isInFitToWindowMode = false;
        },
        checkBoundsAndAdjustPan() {
            if (!this.$refs.container || !this.vmCanvasWidth || !this.vmCanvasHeight) return;

            const container = this.$refs.container;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const canvasScaledWidth = this.vmCanvasWidth * this.scale;
            const canvasScaledHeight = this.vmCanvasHeight * this.scale;

            let targetX = this.panX;
            let targetY = this.panY;

            if (canvasScaledWidth <= containerWidth) {
                 targetX = (containerWidth - canvasScaledWidth) / 2;
            } else {
                targetX = Math.max(this.panX, containerWidth - canvasScaledWidth);
                targetX = Math.min(targetX, 0);
            }

            if (canvasScaledHeight <= containerHeight) {
                targetY = (containerHeight - canvasScaledHeight) / 2;
            } else {
                targetY = Math.max(this.panY, containerHeight - canvasScaledHeight);
                targetY = Math.min(targetY, 0);
            }
            
            if (this.scale < this.minScale + 0.001 && this.scale > this.minScale - 0.001) { // Effectively at minScale
                 targetX = (containerWidth - canvasScaledWidth) / 2;
                 targetY = (containerHeight - canvasScaledHeight) / 2;
            }

            if (Math.abs(this.panX - targetX) > 0.1 || Math.abs(this.panY - targetY) > 0.1) {
                 this.panX = targetX;
                 this.panY = targetY;
            }
        },

        // --- Event Listeners Setup & Cleanup ---
        setupGlobalEventListeners() {
            document.addEventListener('fullscreenchange', this.handleFullscreenChange);
            document.addEventListener('keydown', this.handleGlobalKeyDown);
            document.addEventListener('keyup', this.handleGlobalKeyUp);
            window.addEventListener('blur', this.handleWindowBlur);
            document.addEventListener('click', this.handleClickOutsideScaleMenu, true); // Capture phase
            
            // Add orientation change listener for mobile
            if (this.isMobile) {
                window.addEventListener('orientationchange', this.handleOrientationChange);
                window.addEventListener('resize', this.handleWindowResize);
            }
        },
        cleanup() {
            if (this.socket) this.socket.disconnect();
            if (this.resizeObserver && this.containerObserverTarget) {
                this.resizeObserver.unobserve(this.containerObserverTarget);
            }
            this.resizeObserver = null;
            
            document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
            document.removeEventListener('keydown', this.handleGlobalKeyDown);
            document.removeEventListener('keyup', this.handleGlobalKeyUp);
            window.removeEventListener('blur', this.handleWindowBlur);
            document.removeEventListener('click', this.handleClickOutsideScaleMenu, true);
            
            if (this.isMobile) {
                window.removeEventListener('orientationchange', this.handleOrientationChange);
                window.removeEventListener('resize', this.handleWindowResize);
            }
        },
        setupResizeObserver() {
            this.resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;
                
                const newWidth = entry.contentRect.width;
                const newHeight = entry.contentRect.height;
                const oldWidth = this.lastViewportSize.width;
                const oldHeight = this.lastViewportSize.height;
                
                // Check if viewport actually changed
                if (newWidth !== oldWidth || newHeight !== oldHeight) {
                    console.log(`Viewport resized: ${oldWidth}x${oldHeight} → ${newWidth}x${newHeight}`);
                    
                    this.lastViewportSize = { width: newWidth, height: newHeight };
                    
                    this.$nextTick(() => {
                        if (this.isInFitToWindowMode) {
                            // Only auto-fit if user was in fit-to-window mode
                            this.fitToWindow(true); // Pass true to indicate this is an auto-resize
                        } else {
                            // For manual zoom, maintain the same scale but adjust pan to keep content centered
                            this.adjustPanForViewportChange(oldWidth, oldHeight, newWidth, newHeight);
                        }
                    });
                }
            });
        },
        handleClickOutsideScaleMenu(event) {
            if (this.showScaleMenu) {
                const scaleButton = this.$el.querySelector('button > i.fa-search-plus')?.closest('button');
                const scaleMenu = this.$el.querySelector('div.absolute.left-0.mt-1.py-1.w-40.bg-gray-700');
                if (scaleButton && !scaleButton.contains(event.target) && scaleMenu && !scaleMenu.contains(event.target)) {
                    this.showScaleMenu = false;
                }
            }
            if (this.showKeyboardMenu) {
                const keyboardButton = this.$el.querySelector('button > i.fa-keyboard')?.closest('button');
                const keyboardMenu = this.$el.querySelector('div.absolute.left-0.mt-1.py-1.w-48.bg-gray-700');
                if (keyboardButton && !keyboardButton.contains(event.target) && keyboardMenu && !keyboardMenu.contains(event.target)) {
                    this.showKeyboardMenu = false;
                }
            }
            if (this.showMobileKeyboardMenu) {
                const mobileKeyboardButton = this.$el.querySelector('button[title="Keyboard Shortcuts"]');
                const mobileKeyboardMenu = this.$el.querySelector('div.absolute.bottom-full.left-0.mb-1.py-1.w-40.bg-gray-700');
                if (mobileKeyboardButton && !mobileKeyboardButton.contains(event.target) && mobileKeyboardMenu && !mobileKeyboardMenu.contains(event.target)) {
                    this.showMobileKeyboardMenu = false;
                }
            }
        },

        // --- Input Event Handlers (Container Level for Pan/Zoom, Canvas for VM) ---
        handleWheel(e) {
            if (!this.$refs.container) return; // Guard for container existence

            if (this.isDesktop) {
                // On desktop, forward scroll events to the VM instead of zooming
                if (this.connected) {
                    this.socket.emit('vm_input', {
                        type: 'scroll', // Standardized event type for scrolling
                        deltaX: e.deltaX,
                        deltaY: e.deltaY,
                        deltaZ: e.deltaZ, // deltaZ is available on WheelEvent
                        deltaMode: e.deltaMode // 0 for pixel, 1 for line, 2 for page
                    });
                }
                // e.preventDefault() is implicitly handled by @wheel.prevent in the template,
                // so the browser's default scroll action is prevented.
                return; // Explicitly return to avoid executing zoom logic below
            }

            // Original logic for non-desktop (e.g., mobile, or if wheel on mobile should zoom)
            // If mobile toolbar is open, do nothing (as per original logic)
            if (this.isMobile && this.mobileToolbarOpen) return;

            // Proceed with zooming for non-desktop cases
            const scaleAmount = 1.1;
            let newScale = this.scale * (e.deltaY < 0 ? scaleAmount : 1 / scaleAmount);
            this.setScale(newScale, e.clientX, e.clientY);
            // Note: setScale already disables fit-to-window mode
        },

        handleContainerMouseDown(e) {
            if (e.target === this.$refs.canvas) {
                this.handleCanvasMouseDown(e);
            } else if (e.button === 0 && this.isDesktop) { // Left click on container for panning (desktop only)
                const canvasScaledWidth = this.vmCanvasWidth * this.scale;
                const canvasScaledHeight = this.vmCanvasHeight * this.scale;
                const containerWidth = this.$refs.container.clientWidth;
                const containerHeight = this.$refs.container.clientHeight;

                if (canvasScaledWidth > containerWidth + 1 || canvasScaledHeight > containerHeight + 1) { // +1 for float issues
                    this.isPanningWithMouse = true;
                    this.lastMousePanPosition = { x: e.clientX, y: e.clientY };
                    this.$refs.container.style.cursor = 'grabbing';
                }
            }
        },
        handleContainerMouseMove(e) {
            if (this.isPanningWithMouse) {
                const dx = e.clientX - this.lastMousePanPosition.x;
                const dy = e.clientY - this.lastMousePanPosition.y;
                this.panX += dx;
                this.panY += dy;
                this.lastMousePanPosition = { x: e.clientX, y: e.clientY };
                this.checkBoundsAndAdjustPan(); // No snap during active pan, just bounds
                // Manual panning disables fit-to-window mode
                this.isInFitToWindowMode = false;
            }
            // Forward to canvas if target is canvas OR if a mouse button is held (drag off canvas)
            if (e.target === this.$refs.canvas || this.mouseButtons !== 0) {
                this.handleCanvasMouseMove(e);
            }
        },
        handleContainerMouseUp(e) {
            if (this.isPanningWithMouse) {
                this.isPanningWithMouse = false;
                this.$refs.container.style.cursor = 'grab';
                this.checkBoundsAndAdjustPan(); // Snap after pan ends
            }
             if (e.target === this.$refs.canvas || this.mouseButtons !== 0) {
                this.handleCanvasMouseUp(e);
            }
        },
        handleContextMenu(e) {
            // Forward right-click as a standard mouse down/up
            this.handleCanvasMouseDown(e); 
            // Some systems expect mouseup for context menu to appear.
            // To be safe, we can send it. If not needed, guest OS will ignore.
            this.$nextTick(() => this.handleCanvasMouseUp(e));
        },

        // --- VM Input Forwarding (Canvas specific) ---
        getCanvasRelativeCoords(clientX, clientY) {
            if (!this.$refs.canvas || !this.vmCanvasWidth || !this.vmCanvasHeight) return { x: 0, y: 0, valid: false };
            const rect = this.$refs.canvas.getBoundingClientRect(); 
            
            let x = (clientX - rect.left) / this.scale;
            let y = (clientY - rect.top) / this.scale;
            
            // Clamp to VM dimensions
            x = Math.max(0, Math.min(Math.floor(x), this.vmCanvasWidth -1));
            y = Math.max(0, Math.min(Math.floor(y), this.vmCanvasHeight-1));
            return { x, y, valid: true };
        },
        handleCanvasMouseMove(e) {
            if (!this.connected) return;
            const { x, y, valid } = this.getCanvasRelativeCoords(e.clientX, e.clientY);
            if (valid) this.socket.emit('vm_input', { type: 'mousemove', x, y, buttons: this.mouseButtons });
        },
        handleCanvasMouseDown(e) {
            if (!this.connected) return;
            this.$refs.canvas.focus();
            const { x, y, valid } = this.getCanvasRelativeCoords(e.clientX, e.clientY);
            if (valid) {
                this.mouseButtons |= (1 << e.button);
                this.socket.emit('vm_input', { type: 'mousedown', x, y, button: e.button });
            }
        },
        handleCanvasMouseUp(e) {
            if (!this.connected) return;
            const { x, y, valid } = this.getCanvasRelativeCoords(e.clientX, e.clientY);
            if (valid) {
                this.mouseButtons &= ~(1 << e.button);
                this.socket.emit('vm_input', { type: 'mouseup', x, y, button: e.button });
            }
             // If all buttons are up, ensure mouseButtons is 0
            if ((e.buttons || 0) === 0) { // e.buttons is a bitmask of currently pressed buttons
                this.mouseButtons = 0;
            }
        },
        handleGlobalKeyDown(e) {
            if (e.key === 'Escape') {
                if (this.showScaleMenu) this.showScaleMenu = false;
                if (this.showKeyboardMenu) this.showKeyboardMenu = false;
                if (this.showMobileKeyboardMenu) this.showMobileKeyboardMenu = false;
                if (this.isMobile && this.mobileToolbarOpen) this.closeMobileToolbar();
            }

            if (!this.connected || document.activeElement !== this.$refs.canvas) return;
            
            // Allow Ctrl/Cmd+C,V,X,A for copy/paste/select all if needed by host OS interaction
            // For now, we prevent default for most keys to send to VM.
            const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
            if (!e.metaKey && !e.ctrlKey && e.key !== 'F11' && e.key !== 'F12' && !isModifierOnly ) { // Allow F11 for fullscreen, F12 for dev tools
                 e.preventDefault();
            }
            this.socket.emit('vm_input', { type: 'keydown', key: e.key, code: e.code });
        },
        handleGlobalKeyUp(e) {
            if (!this.connected || document.activeElement !== this.$refs.canvas) return;
             const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
            if (!e.metaKey && !e.ctrlKey && e.key !== 'F11' && e.key !== 'F12' && !isModifierOnly ) {
                e.preventDefault();
            }
            this.socket.emit('vm_input', { type: 'keyup', key: e.key, code: e.code });
        },
        handleWindowBlur() {
            if (!this.connected) return;
            // Release all currently tracked pressed mouse buttons
            for (let i = 0; i < 3; i++) { // Check for left, middle, right
                if ((this.mouseButtons >> i) & 1) {
                    // We don't know the last coords, send 0,0 or don't send coords.
                    // Most VMs will release button regardless of coords on mouseup.
                    this.socket.emit('vm_input', { type: 'mouseup', x:0, y:0, button: i });
                }
            }
            this.mouseButtons = 0;
            // Releasing keys is harder as we don't track all pressed keys.
            // Guest OS should ideally handle this if it detects focus loss.
        },

        // --- Touch Event Handlers ---
        handleTouchStart(e) {
            if (!this.connected) return;
            this.touchState.activeTouches = e.touches.length;
            this.$refs.canvas.focus(); // Ensure canvas has focus for subsequent events or virtual keyboard

            if (e.touches.length === 1) {
                const touch = e.touches[0];
                this.touchState.lastSingleTouchPosition = { x: touch.clientX, y: touch.clientY };
                this.touchState.singleTouchStartPosition = { x: touch.clientX, y: touch.clientY };
                this.touchState.isDraggingMouse = false;
                this.touchState.tapStartInfo = { 
                    time: Date.now(), 
                    pos: { x: touch.clientX, y: touch.clientY },
                    count: 1
                };
            } else if (e.touches.length === 2) {
                // Two finger touch - stop any single finger activity and prepare for gestures
                this.touchState.isDraggingMouse = false;
                this.touchState.tapStartInfo = null;
                
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                this.touchState.lastPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                this.touchState.isPinching = true;

                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                this.touchState.lastTwoFingerPanPosition = { x: midX, y: midY };
                this.touchState.isTwoFingerPanning = true;
                
                // Track two-finger tap
                this.touchState.twoFingerTapStartInfo = {
                    time: Date.now(),
                    pos: { x: midX, y: midY }
                };
            }
        },
        handleTouchMove(e) {
            if (!this.connected) return;
            // e.preventDefault(); // Already done at container level

            if (e.touches.length === 1 && this.touchState.lastSingleTouchPosition) {
                const touch = e.touches[0];
                const currentPos = { x: touch.clientX, y: touch.clientY };
                
                // Calculate movement delta
                const dx = currentPos.x - this.touchState.lastSingleTouchPosition.x;
                const dy = currentPos.y - this.touchState.lastSingleTouchPosition.y;
                
                // Check if we should start dragging (movement threshold)
                if (!this.touchState.isDraggingMouse && this.touchState.singleTouchStartPosition) {
                    const totalDx = currentPos.x - this.touchState.singleTouchStartPosition.x;
                    const totalDy = currentPos.y - this.touchState.singleTouchStartPosition.y;
                    const totalDistance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
                    
                    if (totalDistance > this.touchState.gestureThreshold) { // Start dragging after threshold movement
                        this.touchState.isDraggingMouse = true;
                        this.touchState.hasPerformedGesture = true;
                    }
                }
                
                // If dragging, move the mouse cursor by the delta (trackpad-like)
                if (this.touchState.isDraggingMouse) {
                    // Scale the movement based on current zoom level for better control
                    const scaledDx = dx / this.scale;
                    const scaledDy = dy / this.scale;
                    
                    // Update current mouse position
                    this.touchState.currentMouseX += scaledDx;
                    this.touchState.currentMouseY += scaledDy;
                    
                    // Clamp to VM dimensions
                    this.touchState.currentMouseX = Math.max(0, Math.min(this.touchState.currentMouseX, this.vmCanvasWidth - 1));
                    this.touchState.currentMouseY = Math.max(0, Math.min(this.touchState.currentMouseY, this.vmCanvasHeight - 1));
                    
                    // Send the mouse movement
                    this.socket.emit('vm_input', { 
                        type: 'mousemove', 
                        x: Math.floor(this.touchState.currentMouseX), 
                        y: Math.floor(this.touchState.currentMouseY), 
                        buttons: this.mouseButtons 
                    });
                }
                
                this.touchState.lastSingleTouchPosition = currentPos;

            } else if (e.touches.length === 2 && (this.touchState.isPinching || this.touchState.isTwoFingerPanning)) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // Pinch to Zoom
                const currentPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                if (this.touchState.lastPinchDistance) {
                    const scaleFactor = currentPinchDistance / this.touchState.lastPinchDistance;
                    // Only zoom if there's a significant scale change
                    if (Math.abs(scaleFactor - 1.0) > 0.02) {
                        const newScale = this.scale * scaleFactor;
                        const midClientX = (touch1.clientX + touch2.clientX) / 2;
                        const midClientY = (touch1.clientY + touch2.clientY) / 2;
                        this.setScale(newScale, midClientX, midClientY);
                        
                        // Mark that a gesture occurred
                        this.touchState.hasPerformedGesture = true;
                        this.touchState.twoFingerTapStartInfo = null; // Clear tap since we're zooming
                    }
                }
                this.touchState.lastPinchDistance = currentPinchDistance;

                // Two-finger Pan
                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                const dx = midX - this.touchState.lastTwoFingerPanPosition.x;
                const dy = midY - this.touchState.lastTwoFingerPanPosition.y;
                
                // Only pan if there's significant movement (avoid accidental panning during taps)
                if (Math.abs(dx) > this.touchState.gestureThreshold || Math.abs(dy) > this.touchState.gestureThreshold) {
                    this.panX += dx;
                    this.panY += dy;
                    this.touchState.hasPerformedGesture = true; // Mark that a gesture occurred
                    this.touchState.twoFingerTapStartInfo = null; // Clear tap since we're panning
                    // Manual panning disables fit-to-window mode
                    this.isInFitToWindowMode = false;
                }
                
                this.touchState.lastTwoFingerPanPosition = { x: midX, y: midY };
            }
        },
        handleTouchEnd(e) {
            if (!this.connected) return;

            const TAP_DURATION_THRESHOLD = 250; // ms
            const TAP_MOVE_THRESHOLD_SQ = 15 * 15; // pixels squared for distance

            // Handle single touch end (potential left click)
            if (this.touchState.activeTouches === 1 && e.touches.length === 0) {
                if (this.touchState.tapStartInfo && !this.touchState.isDraggingMouse && !this.touchState.hasPerformedGesture) {
                    const duration = Date.now() - this.touchState.tapStartInfo.time;
                    const dx = this.touchState.lastSingleTouchPosition.x - this.touchState.tapStartInfo.pos.x;
                    const dy = this.touchState.lastSingleTouchPosition.y - this.touchState.tapStartInfo.pos.y;
                    const distSq = dx*dx + dy*dy;

                    if (duration < TAP_DURATION_THRESHOLD && distSq < TAP_MOVE_THRESHOLD_SQ) {
                        // Single finger tap = left click at current mouse position
                        this.socket.emit('vm_input', { 
                            type: 'mousedown', 
                            x: Math.floor(this.touchState.currentMouseX), 
                            y: Math.floor(this.touchState.currentMouseY), 
                            button: 0 
                        });
                        setTimeout(() => {
                            this.socket.emit('vm_input', { 
                                type: 'mouseup', 
                                x: Math.floor(this.touchState.currentMouseX), 
                                y: Math.floor(this.touchState.currentMouseY), 
                                button: 0 
                            });
                        }, 50);
                    }
                }
            }
            
            // Handle two finger tap end (potential right click)
            if (this.touchState.activeTouches === 2 && e.touches.length === 0) {
                if (this.touchState.twoFingerTapStartInfo && !this.touchState.hasPerformedGesture) {
                    const duration = Date.now() - this.touchState.twoFingerTapStartInfo.time;
                    
                    if (duration < TAP_DURATION_THRESHOLD) {
                        // Two finger tap = right click at current mouse position
                        this.socket.emit('vm_input', { 
                            type: 'mousedown', 
                            x: Math.floor(this.touchState.currentMouseX), 
                            y: Math.floor(this.touchState.currentMouseY), 
                            button: 2 
                        });
                        setTimeout(() => {
                            this.socket.emit('vm_input', { 
                                type: 'mouseup', 
                                x: Math.floor(this.touchState.currentMouseX), 
                                y: Math.floor(this.touchState.currentMouseY), 
                                button: 2 
                            });
                        }, 50);
                    }
                }
            }
            
            if (this.touchState.isPinching || this.touchState.isTwoFingerPanning) {
                this.checkBoundsAndAdjustPan(); // Snap after gesture ends
            }
            
            // Reset states based on remaining touches
            this.touchState.activeTouches = e.touches.length;
            if (e.touches.length === 0) {
                // All touches ended
                this.touchState.isDraggingMouse = false;
                this.touchState.isPinching = false;
                this.touchState.isTwoFingerPanning = false;
                this.touchState.hasPerformedGesture = false; // Reset gesture state
                this.touchState.lastPinchDistance = null;
                this.touchState.tapStartInfo = null;
                this.touchState.twoFingerTapStartInfo = null;
                this.touchState.lastSingleTouchPosition = null;
                this.touchState.singleTouchStartPosition = null;
            } else if (e.touches.length === 1) {
                // Transitioned from multi-touch to single touch
                this.touchState.isPinching = false;
                this.touchState.isTwoFingerPanning = false;
                this.touchState.twoFingerTapStartInfo = null;
                this.touchState.isDraggingMouse = false;
                
                const touch = e.touches[0];
                this.touchState.lastSingleTouchPosition = { x: touch.clientX, y: touch.clientY };
                this.touchState.singleTouchStartPosition = { x: touch.clientX, y: touch.clientY };
                this.touchState.tapStartInfo = { 
                    time: Date.now(), 
                    pos: { x: touch.clientX, y: touch.clientY },
                    count: 1
                };
            } else if (e.touches.length === 2) {
                // Still two touches, re-initialize references
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.touchState.lastPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                this.touchState.isPinching = true;
                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                this.touchState.lastTwoFingerPanPosition = { x: midX, y: midY };
                this.touchState.isTwoFingerPanning = true;
                this.touchState.twoFingerTapStartInfo = {
                    time: Date.now(),
                    pos: { x: midX, y: midY }
                };
            }
        },

        // --- Fullscreen Handling ---
        handleFullscreenChange() {
            this.isFullscreen = !!document.fullscreenElement;
            // Fullscreen change triggers a resize, so let the resize observer handle it
        },
        
        // --- Mobile Orientation & Resize Handling ---
        handleOrientationChange() {
            // Orientation change triggers resize, but we need to wait for the resize to complete
            setTimeout(() => {
                const rect = this.$refs.container.getBoundingClientRect();
                const newWidth = rect.width;
                const newHeight = rect.height;
                const oldWidth = this.lastViewportSize.width;
                const oldHeight = this.lastViewportSize.height;
                
                if (newWidth !== oldWidth || newHeight !== oldHeight) {
                    console.log(`Orientation changed: ${oldWidth}x${oldHeight} → ${newWidth}x${newHeight}`);
                    this.lastViewportSize = { width: newWidth, height: newHeight };
                    
                    this.$nextTick(() => {
                        if (this.isInFitToWindowMode) {
                            this.fitToWindow(true);
                        } else {
                            this.adjustPanForViewportChange(oldWidth, oldHeight, newWidth, newHeight);
                        }
                    });
                }
            }, 100); // Wait for orientation change to complete
        },
        
        handleWindowResize() {
            // Handle window resize events (separate from ResizeObserver for mobile)
            if (this.isMobile) {
                setTimeout(() => {
                    const rect = this.$refs.container.getBoundingClientRect();
                    const newWidth = rect.width;
                    const newHeight = rect.height;
                    const oldWidth = this.lastViewportSize.width;
                    const oldHeight = this.lastViewportSize.height;
                    
                    if (newWidth !== oldWidth || newHeight !== oldHeight) {
                        console.log(`Window resized: ${oldWidth}x${oldHeight} → ${newWidth}x${newHeight}`);
                        this.lastViewportSize = { width: newWidth, height: newHeight };
                        
                        this.$nextTick(() => {
                            if (this.isInFitToWindowMode) {
                                this.fitToWindow(true);
                            } else {
                                this.adjustPanForViewportChange(oldWidth, oldHeight, newWidth, newHeight);
                            }
                        });
                    }
                }, 50);
            }
        },

        // --- Virtual Keyboard Handling ---
        triggerVirtualKeyboard() {
            if (this.isMobile && this.$refs.virtualKeyboardInput) {
                // Store current viewport size before keyboard appears
                const rect = this.$refs.container.getBoundingClientRect();
                this.lastViewportSize = { width: rect.width, height: rect.height };
                
                // Focus the hidden input to trigger the virtual keyboard
                this.$refs.virtualKeyboardInput.focus();
                // Clear any previous text
                this.$refs.virtualKeyboardInput.value = '';
                
                // Set up a timer to detect when keyboard appears and adjust viewport
                setTimeout(() => {
                    this.adjustViewportForKeyboard();
                }, 300); // Give keyboard time to appear
            }
        },
        
        adjustViewportForKeyboard() {
            if (!this.isMobile || !this.$refs.container) return;
            
            const rect = this.$refs.container.getBoundingClientRect();
            const currentWidth = rect.width;
            const currentHeight = rect.height;
            const oldWidth = this.lastViewportSize.width;
            const oldHeight = this.lastViewportSize.height;
            
            // Check if viewport changed (keyboard appeared)
            if (currentHeight < oldHeight) {
                console.log(`Keyboard appeared, adjusting viewport: ${oldWidth}x${oldHeight} → ${currentWidth}x${currentHeight}`);
                
                if (this.isInFitToWindowMode) {
                    // Re-fit to the new smaller viewport
                    this.fitToWindow(true);
                } else {
                    // Adjust pan to keep content centered in the smaller viewport
                    this.adjustPanForViewportChange(oldWidth, oldHeight, currentWidth, currentHeight);
                }
                
                // Update the last viewport size to the new size
                this.lastViewportSize = { width: currentWidth, height: currentHeight };
            }
        },
        handleVirtualKeyboardInput(e) {
            if (!this.connected) return;
            const text = e.target.value;
            const prevLength = parseInt(e.target.dataset.prevLength || '0');
            
            if (text.length > prevLength) {
                // Text was added - send the new characters
                const newText = text.substring(prevLength);
                for (let char of newText) {
                    this.sendKeyboardChar(char);
                }
            }
            // Note: We don't handle deletions here anymore since backspace is handled in keydown
            
            e.target.dataset.prevLength = text.length.toString();
        },
        sendKeyboardChar(char) {
            if (!this.connected) return;
            
            // Handle special characters
            if (char === '\n') {
                this.socket.emit('vm_input', { type: 'keydown', key: 'Enter', code: 'Enter' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Enter', code: 'Enter' });
            } else if (char === '\t') {
                this.socket.emit('vm_input', { type: 'keydown', key: 'Tab', code: 'Tab' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Tab', code: 'Tab' });
            } else if (char === ' ') {
                this.socket.emit('vm_input', { type: 'keydown', key: ' ', code: 'Space' });
                this.socket.emit('vm_input', { type: 'keyup', key: ' ', code: 'Space' });
            } else {
                // Regular character
                const code = this.getKeyCodeForChar(char);
                this.socket.emit('vm_input', { type: 'keydown', key: char, code: code });
                this.socket.emit('vm_input', { type: 'keyup', key: char, code: code });
            }
        },
        getKeyCodeForChar(char) {
            const upperChar = char.toUpperCase();
            
            // Numbers
            if (char >= '0' && char <= '9') {
                return `Digit${char}`;
            }
            
            // Letters
            if (upperChar >= 'A' && upperChar <= 'Z') {
                return `Key${upperChar}`;
            }
            
            // Special characters mapping
            const specialKeys = {
                '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5',
                '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0',
                '-': 'Minus', '_': 'Minus', '=': 'Equal', '+': 'Equal',
                '[': 'BracketLeft', '{': 'BracketLeft', ']': 'BracketRight', '}': 'BracketRight',
                '\\': 'Backslash', '|': 'Backslash', ';': 'Semicolon', ':': 'Semicolon',
                "'": 'Quote', '"': 'Quote', ',': 'Comma', '<': 'Comma',
                '.': 'Period', '>': 'Period', '/': 'Slash', '?': 'Slash',
                '`': 'Backquote', '~': 'Backquote'
            };
            
            return specialKeys[char] || 'Unidentified';
        },
        handleVirtualKeyboardKeyDown(e) {
            if (!this.connected) return;
            
            // Handle special keys that might not trigger input events properly
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: 'Enter', code: 'Enter' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Enter', code: 'Enter' });
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: 'Tab', code: 'Tab' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Tab', code: 'Tab' });
            } else if (e.key === 'Backspace') {
                // Always send backspace to VM, regardless of textarea content
                this.socket.emit('vm_input', { type: 'keydown', key: 'Backspace', code: 'Backspace' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Backspace', code: 'Backspace' });
                // Don't prevent default - let textarea handle it for text tracking
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: 'Escape', code: 'Escape' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Escape', code: 'Escape' });
            } else if (e.key === 'Delete') {
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: 'Delete', code: 'Delete' });
                this.socket.emit('vm_input', { type: 'keyup', key: 'Delete', code: 'Delete' });
            } else if (e.key.startsWith('Arrow')) {
                // Handle arrow keys
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: e.key, code: e.code });
                this.socket.emit('vm_input', { type: 'keyup', key: e.key, code: e.code });
            } else if (e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
                // Handle navigation keys
                e.preventDefault();
                this.socket.emit('vm_input', { type: 'keydown', key: e.key, code: e.code });
                this.socket.emit('vm_input', { type: 'keyup', key: e.key, code: e.code });
            }
        },
        adjustPanForViewportChange(oldWidth, oldHeight, newWidth, newHeight) {
            if (!this.$refs.container || !this.vmCanvasWidth || !this.vmCanvasHeight) return;
            
            // Calculate the center point of the visible content in the old viewport
            const oldCenterX = oldWidth / 2;
            const oldCenterY = oldHeight / 2;
            
            // Calculate where that center point is in VM coordinates
            const vmCenterX = (oldCenterX - this.panX) / this.scale;
            const vmCenterY = (oldCenterY - this.panY) / this.scale;
            
            // Calculate new pan to keep the same VM point centered in the new viewport
            this.panX = (newWidth / 2) - (vmCenterX * this.scale);
            this.panY = (newHeight / 2) - (vmCenterY * this.scale);
            
            // Ensure the new pan is within bounds
            this.checkBoundsAndAdjustPan();
        },
        
        handleVirtualKeyboardBlur() {
            // Reset the previous length when keyboard is hidden
            if (this.$refs.virtualKeyboardInput) {
                this.$refs.virtualKeyboardInput.dataset.prevLength = 0;
            }
            
            // On mobile, when keyboard is hidden, adjust viewport back
            if (this.isMobile) {
                this.$nextTick(() => {
                    const rect = this.$refs.container.getBoundingClientRect();
                    const currentWidth = rect.width;
                    const currentHeight = rect.height;
                    
                    if (currentWidth !== this.lastViewportSize.width || currentHeight !== this.lastViewportSize.height) {
                        console.log(`Keyboard hidden, adjusting viewport back: ${currentWidth}x${currentHeight}`);
                        this.lastViewportSize = { width: currentWidth, height: currentHeight };
                        
                        if (this.isInFitToWindowMode) {
                            this.fitToWindow(true);
                        } else {
                            this.adjustPanForViewportChange(
                                this.lastViewportSize.width, 
                                this.lastViewportSize.height, 
                                currentWidth, 
                                currentHeight
                            );
                        }
                    }
                });
            }
        },

        // --- Keyboard Shortcut Handling ---
        sendCtrlAltDel() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'Alt', code: 'AltLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'Delete', code: 'Delete' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Delete', code: 'Delete' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Alt', code: 'AltLeft' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendPrintScreen() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'PrintScreen', code: 'PrintScreen' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'PrintScreen', code: 'PrintScreen' });
        },
        sendAltTab() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Alt', code: 'AltLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'Tab', code: 'Tab' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Tab', code: 'Tab' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Alt', code: 'AltLeft' });
        },
        sendCtrlC() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'c', code: 'KeyC' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'c', code: 'KeyC' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendCtrlV() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'v', code: 'KeyV' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'v', code: 'KeyV' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendCtrlX() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'x', code: 'KeyX' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'x', code: 'KeyX' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendCtrlZ() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'z', code: 'KeyZ' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'z', code: 'KeyZ' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendCtrlY() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Control', code: 'ControlLeft' });
            this.socket.emit('vm_input', { type: 'keydown', key: 'y', code: 'KeyY' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'y', code: 'KeyY' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Control', code: 'ControlLeft' });
        },
        sendWindowsKey() {
            if (!this.connected) return;
            this.socket.emit('vm_input', { type: 'keydown', key: 'Meta', code: 'MetaLeft' });
            this.socket.emit('vm_input', { type: 'keyup', key: 'Meta', code: 'MetaLeft' });
        },
    }
});