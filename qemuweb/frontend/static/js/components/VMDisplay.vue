<template>
  <div class="vm-display">
    <div class="toolbar">
      <button @click="toggleFullscreen" class="btn">
        <i class="fas fa-expand"></i>
      </button>
      <div :class="['status', connected ? 'connected' : 'disconnected']">
        {{ connected ? 'Connected' : 'Disconnected' }}
      </div>
    </div>

    <div class="display-container" ref="container">
      <canvas ref="canvas" tabindex="1" @contextmenu.prevent></canvas>
      <div class="scale-controls">
        <button @click="setScale(1.0)" class="btn">100%</button>
        <button @click="setScale(1.5)" class="btn">150%</button>
        <button @click="setScale(2.0)" class="btn">200%</button>
        <button @click="fitToWindow" class="btn">Fit</button>
      </div>
    </div>
  </div>
</template>

<script>
import { io } from 'socket.io-client';

export default {
  name: 'VMDisplay',
  
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
      resizeObserver: null
    };
  },
  
  mounted() {
    this.canvas = this.$refs.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.setupSocket();
    this.setupEventListeners();
    
    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => {
      if (this.canvas.style.transform.includes('scale')) {
        this.fitToWindow();
      }
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
      this.socket.emit('vm_input', { type: 'mousemove', x, y });
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
    
    setScale(scale) {
      this.scale = scale;
      this.canvas.style.transform = `scale(${scale})`;
      this.canvas.style.transformOrigin = 'top left';
      console.log(`Display scale set to ${scale}`);
    },
    
    fitToWindow() {
      const container = this.$refs.container;
      const scaleX = container.clientWidth / this.canvas.width;
      const scaleY = container.clientHeight / this.canvas.height;
      const scale = Math.min(scaleX, scaleY, 2.0); // Cap at 200%
      this.setScale(scale);
    },
    
    async toggleFullscreen() {
      if (!document.fullscreenElement) {
        await this.$el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    },
    
    cleanup() {
      // Remove event listeners
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('keyup', this.handleKeyUp);
      
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect();
      }
      
      // Cleanup resize observer
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
    }
  }
};
</script>

<style scoped>
.vm-display {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
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
}

canvas {
  background: black;
  box-shadow: 0 0 20px rgba(0,0,0,0.3);
}

canvas:focus {
  outline: 2px solid var(--primary-color);
}

.scale-controls {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  background: var(--surface-overlay);
  padding: 0.5rem;
  border-radius: var(--border-radius);
  display: flex;
  gap: 0.5rem;
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
</style> 