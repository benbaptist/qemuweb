Vue.component('vm-display', {
    props: {
        vmName: {
            type: String,
            required: true
        },
        displayInfo: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            displayElement: null,
            isFullscreen: false
        };
    },
    methods: {
        initDisplay() {
            if (this.displayInfo.type === 'spice') {
                this.initSpiceDisplay();
            } else if (this.displayInfo.type === 'vnc') {
                this.initVNCDisplay();
            }
        },
        initSpiceDisplay() {
            // Implementation depends on SPICE client library
            // This is a placeholder for the actual implementation
            console.log('SPICE display initialization for', this.vmName);
        },
        initVNCDisplay() {
            // Implementation depends on noVNC library
            // This is a placeholder for the actual implementation
            console.log('VNC display initialization for', this.vmName);
        },
        toggleFullscreen() {
            if (!this.isFullscreen) {
                if (this.$el.requestFullscreen) {
                    this.$el.requestFullscreen();
                } else if (this.$el.webkitRequestFullscreen) {
                    this.$el.webkitRequestFullscreen();
                } else if (this.$el.msRequestFullscreen) {
                    this.$el.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        },
        handleFullscreenChange() {
            this.isFullscreen = document.fullscreenElement === this.$el;
        }
    },
    mounted() {
        this.initDisplay();
        document.addEventListener('fullscreenchange', this.handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);
        document.addEventListener('msfullscreenchange', this.handleFullscreenChange);
    },
    beforeDestroy() {
        document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
        document.removeEventListener('msfullscreenchange', this.handleFullscreenChange);
    },
    template: `
        <div class="relative h-full bg-black">
            <div class="absolute top-0 right-0 p-2 z-10">
                <button @click="toggleFullscreen"
                        class="bg-gray-800 bg-opacity-50 text-white p-2 rounded hover:bg-opacity-75 focus:outline-none">
                    <svg v-if="!isFullscreen" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                    </svg>
                    <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M4 4h4m-4 0v4m16-4h-4m4 0v4M4 20h4m-4 0v-4m16 4h-4m4 0v-4" />
                    </svg>
                </button>
            </div>
            <div ref="display" class="vm-display"></div>
        </div>
    `
}); 