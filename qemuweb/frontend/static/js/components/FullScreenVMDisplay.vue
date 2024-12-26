<template>
  <div class="fullscreen-vm-display">
    <div class="vm-controls">
      <!-- Group controls on the right -->
      <div class="control-group">
        <!-- Scale dropdown -->
        <div class="dropdown">
          <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
            Scale
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#" @click="setScale(1)">100%</a></li>
            <li><a class="dropdown-item" href="#" @click="setScale('fit')">Fit</a></li>
            <li><a class="dropdown-item" href="#" @click="setScale('stretch')">Stretch</a></li>
          </ul>
        </div>
        
        <button class="btn btn-secondary" @click="toggleFullscreen">
          <i class="fas" :class="isFullscreen ? 'fa-compress' : 'fa-expand'"></i>
        </button>
        
        <button class="btn btn-secondary close-btn" @click="$emit('close')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    
    <VMDisplay 
      :vm="vm"
      :scale="scale"
      class="centered-display"
    />
  </div>
</template>

<script>
import { io } from 'socket.io-client';
import SimpleKeyboard from 'simple-keyboard';
import 'simple-keyboard/build/css/index.css';

export default {
  name: 'FullScreenVMDisplay',
  
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
      framesReceived: 0,
      connected: false,
      resizeObserver: null,
      keyboardVisible: false,
      keyboard: null,
      touchState: {
        lastTap: 0,
        touchCount: 0,
        dragStart: null,
        isDragging: false,
        lastDistance: null
      }
    };
  },
  
  computed: {
    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
  },
  
  mounted() {
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.setupSocket();
    this.setupEventListeners();
    
    if (this.isTouchDevice) {
      this.setupVirtualKeyboard();
    }
    
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
          this.fitToWindow();
        }
        
        // Clear and draw new frame
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
      } catch (error) {
        console.error('Error loading frame:', error);
      }
    },
    
    setupEventListeners() {
      // Keyboard events (for non-touch devices)
      if (!this.isTouchDevice) {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
      }
    },
    
    setupVirtualKeyboard() {
      this.keyboard = new SimpleKeyboard({
        onChange: input => this.onChange(input),
        onKeyPress: button => this.onKeyPress(button)
      });
    },
    
    handleTouchStart(e) {
      const touches = e.touches;
      const now = Date.now();
      
      this.touchState.touchCount = touches.length;
      
      if (touches.length === 1) {
        // Single touch - could be start of tap or drag
        if (now - this.touchState.lastTap < 300) {
          // Double tap detected
          this.touchState.isDragging = true;
          this.touchState.dragStart = {
            x: touches[0].clientX,
            y: touches[0].clientY
          };
          this.handleMouseDown(touches[0], 0); // Left click
        }
        this.touchState.lastTap = now;
      } else if (touches.length === 2) {
        // Two finger touch - for scrolling or right click
        this.touchState.lastDistance = Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY
        );
      }
      
      e.preventDefault();
    },
    
    handleTouchMove(e) {
      const touches = e.touches;
      
      if (this.touchState.isDragging && touches.length === 1) {
        // Handle drag
        const touch = touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((touch.clientX - rect.left) / this.scale);
        const y = Math.floor((touch.clientY - rect.top) / this.scale);
        this.socket.emit('vm_input', { type: 'mousemove', x, y });
      } else if (touches.length === 2) {
        // Two finger scroll
        const currentDistance = Math.hypot(
          touches[0].clientX - touches[1].clientX,
          touches[0].clientY - touches[1].clientY
        );
        
        if (this.touchState.lastDistance) {
          const deltaY = currentDistance - this.touchState.lastDistance;
          // Emit scroll events based on the delta
          if (Math.abs(deltaY) > 10) {
            this.socket.emit('vm_input', {
              type: 'scroll',
              deltaY: deltaY > 0 ? 120 : -120
            });
          }
        }
        
        this.touchState.lastDistance = currentDistance;
      }
      
      e.preventDefault();
    },
    
    handleTouchEnd(e) {
      if (this.touchState.isDragging) {
        this.handleMouseUp(e.changedTouches[0], 0); // Left click release
        this.touchState.isDragging = false;
      } else if (this.touchState.touchCount === 2 && e.touches.length === 0) {
        // Two finger tap ended - emit right click
        const touch = e.changedTouches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((touch.clientX - rect.left) / this.scale);
        const y = Math.floor((touch.clientY - rect.top) / this.scale);
        this.socket.emit('vm_input', { type: 'mousedown', x, y, button: 2 });
        this.socket.emit('vm_input', { type: 'mouseup', x, y, button: 2 });
      }
      
      this.touchState.touchCount = e.touches.length;
      e.preventDefault();
    },
    
    handleMouseDown(e, button) {
      if (!this.connected) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / this.scale);
      const y = Math.floor((e.clientY - rect.top) / this.scale);
      this.socket.emit('vm_input', { type: 'mousedown', x, y, button });
    },
    
    handleMouseUp(e, button) {
      if (!this.connected) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / this.scale);
      const y = Math.floor((e.clientY - rect.top) / this.scale);
      this.socket.emit('vm_input', { type: 'mouseup', x, y, button });
    },
    
    handleKeyDown(e) {
      if (!this.connected) return;
      e.preventDefault();
      this.socket.emit('vm_input', { type: 'keydown', key: e.key });
    },
    
    handleKeyUp(e) {
      if (!this.connected) return;
      e.preventDefault();
      this.socket.emit('vm_input', { type: 'keyup', key: e.key });
    },
    
    toggleKeyboard() {
      this.keyboardVisible = !this.keyboardVisible;
    },
    
    onChange(input) {
      // Handle virtual keyboard input
      if (this.connected) {
        this.socket.emit('vm_input', { type: 'keydown', key: input });
        this.socket.emit('vm_input', { type: 'keyup', key: input });
      }
    },
    
    onKeyPress(button) {
      // Handle special keys from virtual keyboard
      if (this.connected) {
        this.socket.emit('vm_input', { type: 'keydown', key: button });
        this.socket.emit('vm_input', { type: 'keyup', key: button });
      }
    },
    
    fitToWindow() {
      const container = this.$refs.container;
      const scaleX = container.clientWidth / this.canvas.width;
      const scaleY = container.clientHeight / this.canvas.height;
      const scale = Math.min(scaleX, scaleY, 2.0); // Cap at 200%
      this.setScale(scale);
    },
    
    setScale(scale) {
      this.scale = scale;
      this.canvas.style.transform = `scale(${scale})`;
      this.canvas.style.transformOrigin = 'top left';
    },
    
    cleanup() {
      // Remove event listeners
      if (!this.isTouchDevice) {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
      }
      
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect();
      }
      
      // Cleanup resize observer
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      
      // Cleanup virtual keyboard
      if (this.keyboard) {
        this.keyboard.destroy();
      }
    }
  }
};
</script>

<style scoped>
.fullscreen-vm-display {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface-ground);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.toolbar {
  padding: 0.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
}

.display-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
  touch-action: none;
}

.keyboard-visible .display-container {
  height: 60vh;
}

canvas {
  background: black;
  box-shadow: 0 0 20px rgba(0,0,0,0.3);
}

canvas:focus {
  outline: 2px solid var(--primary-color);
}

.status {
  font-size: 0.875rem;
}

.status.connected {
  color: var(--green-500);
}

.status.disconnected {
  color: var(--red-500);
}

.virtual-keyboard {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--surface-overlay);
  padding: 0.5rem;
  border-top: 1px solid var(--surface-border);
  max-height: 40vh;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .toolbar {
    padding: 0.25rem;
  }
  
  .btn {
    padding: 0.5rem;
  }
}
</style> 