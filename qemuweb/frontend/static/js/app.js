// WebSocket connection
const socket = io();

// Main Vue application
const app = new Vue({
    el: '#app',
    data: {
        errorMessage: null,
        successMessage: null,
        showCreateModal: false,
        qemuCapabilities: null,
        vms: [],
        selectedVM: null,
        vmStates: {},
        displayConnections: {},
        showingDisplay: false,
        vmLogs: [],
        logRefreshInterval: null
    },
    computed: {
        sortedVMs() {
            return [...this.vms].sort((a, b) => a.name.localeCompare(b.name));
        }
    },
    methods: {
        // VM Management
        async createVM(vmConfig) {
            try {
                const response = await fetch('/api/vms', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(vmConfig)
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to create VM: ${response.statusText}`);
                }

                this.showCreateModal = false;
                this.successMessage = 'VM created successfully';
                await this.loadVMs();
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        async deleteVM(vmName) {
            if (!confirm(`Are you sure you want to delete VM "${vmName}"?`)) {
                return;
            }

            try {
                const response = await fetch(`/api/vms/${vmName}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error(`Failed to delete VM: ${response.statusText}`);
                }

                this.successMessage = 'VM deleted successfully';
                await this.loadVMs();
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        async startVM(vmName) {
            try {
                const response = await fetch(`/api/vms/${vmName}/start`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    throw new Error(`Failed to start VM: ${response.statusText}`);
                }

                this.successMessage = 'VM started successfully';
                this.$set(this.vmStates, vmName, 'running');
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        async stopVM(vmName) {
            try {
                const response = await fetch(`/api/vms/${vmName}/stop`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    throw new Error(`Failed to stop VM: ${response.statusText}`);
                }

                this.successMessage = 'VM stopped successfully';
                this.$set(this.vmStates, vmName, 'stopped');
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        // Data Loading
        async loadVMs() {
            try {
                const response = await fetch('/api/vms');
                if (!response.ok) {
                    throw new Error(`Failed to load VMs: ${response.statusText}`);
                }
                const data = await response.json();
                console.log('Raw VM data:', data);
                this.vms = data;
                console.log('Loaded VMs:', this.vms);
                
                // Load initial state for each VM
                for (const vm of this.vms) {
                    try {
                        const stateResponse = await fetch(`/api/vms/${vm.name}/status`);
                        if (stateResponse.ok) {
                            const stateData = await stateResponse.json();
                            console.log(`State for ${vm.name}:`, stateData);
                            this.$set(this.vmStates, vm.name, stateData.running ? 'running' : 'stopped');
                        }
                    } catch (error) {
                        console.error(`Failed to load state for VM ${vm.name}:`, error);
                        this.$set(this.vmStates, vm.name, 'unknown');
                    }
                }
                console.log('Final VM states:', this.vmStates);
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        async loadQEMUCapabilities() {
            try {
                const response = await fetch('/api/qemu/capabilities');
                if (!response.ok) {
                    throw new Error(`Failed to load QEMU capabilities: ${response.statusText}`);
                }
                this.qemuCapabilities = await response.json();
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        // Display Handling
        async connectDisplay(vmName) {
            console.log('Attempting to connect display for:', vmName);
            if (this.displayConnections[vmName]) {
                console.log('Display connection already exists');
                return;
            }

            try {
                const response = await fetch(`/api/vms/${vmName}/display`);
                if (!response.ok) {
                    throw new Error(`Failed to get display info: ${response.statusText}`);
                }

                const displayInfo = await response.json();
                console.log('Got display info:', displayInfo);
                this.displayConnections[vmName] = displayInfo;

                // Emit socket event to connect to display
                socket.emit('connect_display', { vm_name: vmName });

                // Initialize display based on type (SPICE or VNC)
                if (displayInfo.type === 'spice') {
                    this.initSpiceDisplay(vmName, displayInfo);
                } else if (displayInfo.type === 'vnc') {
                    this.initVNCDisplay(vmName, displayInfo);
                }
            } catch (error) {
                console.error('Display connection error:', error);
                this.errorMessage = error.message;
            }
        },

        disconnectDisplay(vmName) {
            console.log('Disconnecting display for:', vmName);
            const connection = this.displayConnections[vmName];
            if (connection) {
                socket.emit('disconnect_display', { vm_name: vmName });
                if (connection.client) {
                    connection.client.disconnect();
                }
                this.$delete(this.displayConnections, vmName);
            }
        },

        initSpiceDisplay(vmName, displayInfo) {
            console.log('Initializing SPICE display for:', vmName, displayInfo);
            // Implementation depends on SPICE client library
        },

        initVNCDisplay(vmName, displayInfo) {
            console.log('Initializing VNC display for:', vmName, displayInfo);
            // Implementation depends on noVNC library
        },

        // WebSocket Event Handlers
        handleVMStateChange(data) {
            console.log('VM state change received:', data);
            this.$set(this.vmStates, data.name, data.running ? 'running' : 'stopped');
            console.log('Updated VM states:', this.vmStates);
        },

        handleVMError(data) {
            this.errorMessage = `Error with VM ${data.name}: ${data.error}`;
        },

        handleDisplayConnected(data) {
            console.log('Display connected:', data);
            if (data.status === 'success') {
                this.successMessage = 'Connected to VM display';
            } else {
                this.errorMessage = data.message || 'Failed to connect to display';
            }
        },

        handleDisplayError(data) {
            console.error('Display error:', data);
            this.errorMessage = data.message || 'Display error occurred';
        },

        getSelectedVMConfig() {
            const vm = this.vms.find(vm => vm.name === this.selectedVM);
            console.log('Selected VM config:', vm);
            return vm;
        },

        async updateVM(config) {
            try {
                const response = await fetch(`/api/vms/${config.name}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                if (!response.ok) {
                    throw new Error(`Failed to update VM: ${response.statusText}`);
                }

                this.successMessage = 'VM updated successfully';
                await this.loadVMs();
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        async fetchVMLogs(vmName) {
            try {
                const response = await fetch(`/api/vms/${vmName}/logs`);
                const data = await response.json();
                if (data.success) {
                    this.vmLogs = data.logs;
                } else {
                    console.error('Failed to fetch logs:', data.error);
                }
            } catch (error) {
                console.error('Error fetching VM logs:', error);
            }
        },

        refreshLogs() {
            if (this.selectedVM) {
                this.fetchVMLogs(this.selectedVM);
            }
        },

        async selectVM(vmName) {
            this.selectedVM = vmName;
            if (vmName) {
                // Clear existing refresh interval
                if (this.logRefreshInterval) {
                    clearInterval(this.logRefreshInterval);
                }
                
                // Fetch logs immediately
                await this.fetchVMLogs(vmName);
                
                // Set up automatic refresh if VM is running
                if (this.vmStates[vmName] === 'running') {
                    this.logRefreshInterval = setInterval(() => {
                        this.fetchVMLogs(vmName);
                    }, 5000); // Refresh every 5 seconds
                }
            }
        }
    },
    created() {
        this.loadVMs();
        this.loadQEMUCapabilities();

        // WebSocket event listeners
        socket.on('vm_state_change', this.handleVMStateChange);
        socket.on('vm_error', this.handleVMError);
        socket.on('display_connected', this.handleDisplayConnected);
        socket.on('display_error', this.handleDisplayError);
    },
    beforeDestroy() {
        // Clean up WebSocket listeners
        socket.off('vm_state_change', this.handleVMStateChange);
        socket.off('vm_error', this.handleVMError);
        socket.off('display_connected', this.handleDisplayConnected);
        socket.off('display_error', this.handleDisplayError);

        // Disconnect all displays
        Object.keys(this.displayConnections).forEach(this.disconnectDisplay);

        // Clear log refresh interval
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
        }
    },
    watch: {
        selectedVM: {
            async handler(newVM, oldVM) {
                console.log('Selected VM changed:', { newVM, oldVM });
                // Disconnect from old VM display if it exists
                if (oldVM) {
                    console.log('Disconnecting from old VM:', oldVM);
                    this.disconnectDisplay(oldVM);
                }
                
                // Connect to new VM display if it's running
                if (newVM && this.vmStates[newVM] === 'running') {
                    console.log('Connecting to new VM:', newVM, 'State:', this.vmStates[newVM]);
                    await this.connectDisplay(newVM);
                }
            }
        },
        'vmStates': {
            deep: true,
            async handler(newStates, oldStates) {
                // If the selected VM changes state to running, connect to its display
                if (this.selectedVM) {
                    const wasRunning = oldStates[this.selectedVM] === 'running';
                    const isRunning = newStates[this.selectedVM] === 'running';
                    
                    if (!wasRunning && isRunning) {
                        await this.connectDisplay(this.selectedVM);
                        // Start log refresh interval
                        this.logRefreshInterval = setInterval(() => {
                            this.fetchVMLogs(this.selectedVM);
                        }, 5000);
                    } else if (wasRunning && !isRunning) {
                        // Clear log refresh interval when VM stops
                        if (this.logRefreshInterval) {
                            clearInterval(this.logRefreshInterval);
                            this.logRefreshInterval = null;
                        }
                    }
                }
            }
        }
    }
}); 