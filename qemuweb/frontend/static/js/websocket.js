class WebSocketClient {
    constructor() {
        this.socket = io();
        this.vmManager = null;
        this.vncDisplay = null;
        this.setupEventListeners();
    }

    setVMManager(manager) {
        this.vmManager = manager;
    }

    setVNCDisplay(display) {
        this.vncDisplay = display;
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            if (this.vmManager) {
                this.vmManager.loadVMs();
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            if (this.vncDisplay) {
                this.vncDisplay.disconnect();
            }
        });

        this.socket.on('vm_status', (status) => {
            if (this.vmManager) {
                this.vmManager.updateVMStatus(status);
            }
        });

        this.socket.on('vm_stopped', (data) => {
            if (this.vmManager) {
                this.vmManager.handleVMStopped(data.name);
            }
            if (this.vncDisplay && this.vncDisplay.currentVM === data.name) {
                this.vncDisplay.disconnect();
            }
        });

        // Error handling
        this.socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });
    }

    emit(event, data) {
        this.socket.emit(event, data);
    }

    on(event, callback) {
        this.socket.on(event, callback);
    }

    off(event, callback) {
        this.socket.off(event, callback);
    }
} 