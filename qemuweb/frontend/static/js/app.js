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
        logRefreshInterval: null,
        currentView: 'vms',
        systemInfo: null
    },
    computed: {
        selectedVMState() {
            return this.selectedVM ? this.vmStates[this.selectedVM.name] : null;
        },
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
                this.vms = data;
                
                // Load initial state for each VM
                for (const vm of this.vms) {
                    try {
                        const stateResponse = await fetch(`/api/vms/${vm.name}/status`);
                        if (stateResponse.ok) {
                            const stateData = await stateResponse.json();
                            this.$set(this.vmStates, vm.name, stateData.running ? 'running' : 'stopped');
                        }
                    } catch (error) {
                        console.error(`Failed to load state for VM ${vm.name}:`, error);
                        this.$set(this.vmStates, vm.name, 'unknown');
                    }
                }
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

        async loadSystemInfo() {
            try {
                const response = await fetch('/api/system/info');
                if (!response.ok) {
                    throw new Error(`Failed to load system info: ${response.statusText}`);
                }
                this.systemInfo = await response.json();
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        getSelectedVMConfig() {
            return this.vms.find(vm => vm.name === this.selectedVM);
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
                if (this.logRefreshInterval) {
                    clearInterval(this.logRefreshInterval);
                }
                
                await this.fetchVMLogs(vmName);
                
                if (this.vmStates[vmName] === 'running') {
                    this.logRefreshInterval = setInterval(() => {
                        this.fetchVMLogs(vmName);
                    }, 5000);
                }
            }
        },

        handleDisplayError(error) {
            this.showError(error.message);
            this.showingDisplay = false;
        },

        showError(message) {
            this.errorMessage = message;
            setTimeout(() => {
                this.errorMessage = null;
            }, 5000);
        },

        showSuccess(message) {
            this.successMessage = message;
            setTimeout(() => {
                this.successMessage = null;
            }, 3000);
        }
    },
    created() {
        this.loadVMs();
        this.loadQEMUCapabilities();
        this.loadSystemInfo();

        // WebSocket event listeners
        socket.on('vm_state_change', (data) => {
            this.$set(this.vmStates, data.name, data.running ? 'running' : 'stopped');
        });

        socket.on('vm_error', (data) => {
            this.errorMessage = `Error with VM ${data.name}: ${data.error}`;
        });
    },
    beforeDestroy() {
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
        }
    }
}); 