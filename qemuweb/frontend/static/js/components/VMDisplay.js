Vue.component('vm-display', {
    template: `
        <div class="fixed inset-0 bg-black flex flex-col select-none" 
             @mouseenter="isDesktop && (desktopToolbarHover = true)" 
             @mouseleave="isDesktop && (desktopToolbarHover = false)">

            <!-- Desktop Toolbar -->
            <div v-if="isDesktop" 
                 class="absolute top-0 left-0 right-0 p-2 bg-gray-800 bg-opacity-75 z-50 flex justify-between items-center transition-opacity duration-300 text-white"
                 :class="{ 'opacity-100': desktopToolbarHover || desktopToolbarPinned, 'opacity-25': !desktopToolbarHover && !desktopToolbarPinned }">
                <!-- Left Aligned Controls -->
                <div class="flex items-center gap-2">
                    <button @click="togglePinDesktopToolbar" class="p-2 rounded hover:bg-gray-700" :title="desktopToolbarPinned ? 'Unpin Toolbar' : 'Pin Toolbar'">
                        <i class="fas" :class="desktopToolbarPinned ? 'fa-thumbtack transform rotate-45' : 'fa-thumbtack'"></i>
                    </button>
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
                     <button @click="sendCtrlAltDel" class="p-2 rounded hover:bg-gray-700" title="Send Ctrl+Alt+Del">
                        <i class="fas fa-keyboard mr-1"></i> CAD
                    </button>
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
                    <button @click="setScale(1.0)" class="p-2 text-sm rounded hover:bg-gray-700">100%</button>
                    <button @click="setScale(1.5)" class="p-2 text-sm rounded hover:bg-gray-700">150%</button>
                    <button @click="fitToWindow()" class="p-2 text-sm rounded hover:bg-gray-700">Fit</button>
                     <button @click="zoomToActual()" class="p-2 text-sm rounded hover:bg-gray-700">Actual</button>
                 </div>
                 <div class="flex justify-around w-full">
                    <button @click="sendCtrlAltDel" class="p-2 rounded hover:bg-gray-700" title="Send Ctrl+Alt+Del"><i class="fas fa-keyboard text-lg"></i></button>
                    <button @click="toggleFullscreen" class="p-2 rounded hover:bg-gray-700" title="Toggle Fullscreen"><i class="fas" :class="isFullscreen ? 'fa-compress' : 'fa-expand'"></i></button>
                    <button @click="closeMobileToolbar" class="p-2 rounded hover:bg-gray-700"><i class="fas fa-chevron-down text-lg"></i></button>
                    <button @click="closeDisplay" class="p-2 rounded bg-red-600 hover:bg-red-500" title="Close VM Display"><i class="fas fa-times text-lg"></i></button>
                 </div>
            </div>
            
            <!-- Display Area -->
            <div class="flex-1 overflow-hidden touch-none" ref="container" 
                @wheel.prevent="handleWheel"
                @mousedown.prevent="handleContainerMouseDown"
                @mousemove.prevent="handleContainerMouseMove"
                @mouseup.prevent="handleContainerMouseUp"
                @touchstart.prevent="handleTouchStart"
                @touchmove.prevent="handleTouchMove"
                @touchend.prevent="handleTouchEnd">
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

            // Display & Interaction State
            scale: 1.0,
            minScale: 0.1, // True minimum zoom level (e.g., 10%)
            maxScale: 5.0,
            panX: 0,
            panY: 0,
            isPanningWithMouse: false, // Specifically for mouse dragging
            lastMousePanPosition: { x: 0, y: 0 },

            // Toolbar State
            isDesktop: !(/Mobi|Android/i.test(navigator.userAgent)),
            desktopToolbarHover: false,
            desktopToolbarPinned: false,
            showScaleMenu: false,
            isMobile: /Mobi|Android/i.test(navigator.userAgent),
            mobileToolbarOpen: false,
            
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
                // For single touch as mouse
                lastSingleTouchPosition: null, 
                isSingleTouchMovingMouse: false,
                tapStartInfo: null, // { time: Date.now(), pos: {x,y}, clientPos: {x,y} }
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
        }
    },

    mounted() {
        this.setupSocket();
        this.setupGlobalEventListeners();
        this.setupResizeObserver();
        
        this.$nextTick(() => {
            if (this.containerObserverTarget) {
                this.resizeObserver.observe(this.containerObserverTarget);
            }
            // Initial fit will happen on first frame or if vmCanvas dimensions already known
            if(this.vmCanvasWidth > 0 && this.vmCanvasHeight > 0){
                this.fitToWindow();
            }
            if (this.$refs.canvas) {
                 this.$refs.canvas.focus();
            }
        });
    },

    beforeDestroy() {
        this.cleanup();
    },

    methods: {
        // --- Toolbar Actions ---
        togglePinDesktopToolbar() {
            this.desktopToolbarPinned = !this.desktopToolbarPinned;
        },
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
            this.socket.on('error', (error) => console.error('Socket error:', error));
            this.socket.on('vm_frame', this.handleFrame);
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
                    this.vmCanvasWidth = data.width;
                    this.vmCanvasHeight = data.height;
                    canvas.width = data.width; // Set canvas actual drawing surface size
                    canvas.height = data.height;
                    dimensionsChanged = true;
                }
                
                ctx.drawImage(img, 0, 0);

                if (dimensionsChanged || this.framesReceived === 1) {
                    this.$nextTick(this.fitToWindow);
                }
            } catch (error) {
                console.error('Error loading frame:', error);
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
        },
        fitToWindow() {
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
        },
        zoomToActual() {
            if (!this.$refs.container) return;
            const containerRect = this.$refs.container.getBoundingClientRect();
            // Pivot around center of container for zoomToActual
            this.setScale(1.0, containerRect.left + containerRect.width / 2, containerRect.top + containerRect.height / 2);
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
        },
        setupResizeObserver() {
            this.resizeObserver = new ResizeObserver(() => {
                 this.$nextTick(this.fitToWindow);
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
                this.touchState.isSingleTouchMovingMouse = true;
                this.touchState.lastSingleTouchPosition = { x: touch.clientX, y: touch.clientY };
                this.touchState.tapStartInfo = { 
                    time: Date.now(), 
                    pos: { x: touch.clientX, y: touch.clientY },
                };
            } else if (e.touches.length >= 2) {
                this.touchState.isSingleTouchMovingMouse = false; // Stop single touch if two fingers are down
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
            }
        },
        handleTouchMove(e) {
            if (!this.connected) return;
            // e.preventDefault(); // Already done at container level

            if (e.touches.length === 1 && this.touchState.isSingleTouchMovingMouse) {
                const touch = e.touches[0];
                // For mouse movement, we send absolute scaled coords to VM
                const { x, y, valid } = this.getCanvasRelativeCoords(touch.clientX, touch.clientY);
                if (valid) {
                    this.socket.emit('vm_input', { type: 'mousemove', x, y, buttons: this.mouseButtons });
                }
                // Update last position for tap-move threshold check
                this.touchState.lastSingleTouchPosition = { x: touch.clientX, y: touch.clientY };

            } else if (e.touches.length >= 2 && (this.touchState.isPinching || this.touchState.isTwoFingerPanning)) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // Pinch to Zoom
                const currentPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                if (this.touchState.lastPinchDistance) {
                    const scaleFactor = currentPinchDistance / this.touchState.lastPinchDistance;
                    const newScale = this.scale * scaleFactor;
                    const midClientX = (touch1.clientX + touch2.clientX) / 2;
                    const midClientY = (touch1.clientY + touch2.clientY) / 2;
                    this.setScale(newScale, midClientX, midClientY);
                }
                this.touchState.lastPinchDistance = currentPinchDistance;

                // Two-finger Pan
                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                const dx = midX - this.touchState.lastTwoFingerPanPosition.x;
                const dy = midY - this.touchState.lastTwoFingerPanPosition.y;
                this.panX += dx;
                this.panY += dy;
                this.touchState.lastTwoFingerPanPosition = { x: midX, y: midY };
            }
        },
        handleTouchEnd(e) {
            if (!this.connected) return;

            const TAP_DURATION_THRESHOLD = 250; // ms
            const TAP_MOVE_THRESHOLD_SQ = 15 * 15; // pixels squared for distance

            if (this.touchState.activeTouches === 1 && e.touches.length === 0) {
                // Single touch ended
                if (this.touchState.tapStartInfo && this.touchState.lastSingleTouchPosition) {
                    const duration = Date.now() - this.touchState.tapStartInfo.time;
                    const dx = this.touchState.lastSingleTouchPosition.x - this.touchState.tapStartInfo.pos.x;
                    const dy = this.touchState.lastSingleTouchPosition.y - this.touchState.tapStartInfo.pos.y;
                    const distSq = dx*dx + dy*dy;

                    if (duration < TAP_DURATION_THRESHOLD && distSq < TAP_MOVE_THRESHOLD_SQ) {
                        const { x, y, valid } = this.getCanvasRelativeCoords(this.touchState.tapStartInfo.pos.x, this.touchState.tapStartInfo.pos.y);
                        if (valid) {
                            this.socket.emit('vm_input', { type: 'mousedown', x, y, button: 0 });
                            // Delay mouseup slightly to ensure it's registered as a click
                            setTimeout(() => {
                                this.socket.emit('vm_input', { type: 'mouseup', x, y, button: 0 });
                            }, 50);
                        }
                    }
                }
            }
            
            if (this.touchState.isPinching || this.touchState.isTwoFingerPanning) {
                this.checkBoundsAndAdjustPan(); // Snap after gesture ends
            }
            
            // Reset states based on remaining touches
            this.touchState.activeTouches = e.touches.length;
            if (e.touches.length === 0) {
                this.touchState.isSingleTouchMovingMouse = false;
                this.touchState.isPinching = false;
                this.touchState.isTwoFingerPanning = false;
                this.touchState.lastPinchDistance = null;
                this.touchState.tapStartInfo = null;
                this.touchState.lastSingleTouchPosition = null;
            } else if (e.touches.length === 1) {
                // Transitioned from multi-touch to single touch
                this.touchState.isPinching = false;
                this.touchState.isTwoFingerPanning = false;
                this.touchState.isSingleTouchMovingMouse = true;
                this.touchState.lastSingleTouchPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.touchState.tapStartInfo = { time: Date.now(), pos: {x: e.touches[0].clientX, y: e.touches[0].clientY }}; // New tap potential
            } else if (e.touches.length >= 2) {
                // Still multi-touch, re-initialize pinch/pan references
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.touchState.lastPinchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                this.touchState.isPinching = true; // Assume still pinching
                const midX = (touch1.clientX + touch2.clientX) / 2;
                const midY = (touch1.clientY + touch2.clientY) / 2;
                this.touchState.lastTwoFingerPanPosition = { x: midX, y: midY };
                this.touchState.isTwoFingerPanning = true; // Assume still panning
            }
        },

        // --- Fullscreen Handling ---
        handleFullscreenChange() {
            this.isFullscreen = !!document.fullscreenElement;
            this.$nextTick(this.fitToWindow);
        },
    }
});