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
        systemInfo: null,
        windowWidth: window.innerWidth
    },
    computed: {
        selectedVMState() {
            return this.selectedVM ? this.vmStates[this.selectedVM.name] : null;
        },
        sortedVMs() {
            return [...this.vms].sort((a, b) => a.name.localeCompare(b.name));
        },
        isMobileView() {
            return this.windowWidth < 640; // matches sm breakpoint
        }
    },
    methods: {
        handleResize() {
            this.windowWidth = window.innerWidth;
        },
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
            console.log(`Starting VM: ${vmName}`);
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
            console.log(`Stopping VM: ${vmName}`);
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
                
                // Normalize VM data structure
                this.vms = data.map(vm => ({
                    name: vm.name,
                    arch: vm.arch || '',
                    machine: vm.machine || '',
                    cpu: vm.cpu || '',
                    cpu_cores: vm.cpu_cores || 1,
                    cpu_threads: vm.cpu_threads || 1,
                    memory: vm.memory || 1024,
                    network_type: vm.network_type || 'user',
                    network_bridge: vm.network_bridge || '',
                    rtc_base: vm.rtc_base || 'utc',
                    enable_kvm: vm.enable_kvm ?? false,
                    headless: vm.headless ?? false,
                    display: {
                        type: (vm.display && vm.display.type) || 'vnc'
                    },
                    disks: Array.isArray(vm.disks) ? vm.disks.map(disk => ({
                        type: disk.type || 'disk',
                        path: disk.path || '',
                        interface: disk.interface || 'virtio',
                        format: disk.format || 'qcow2',
                        readonly: disk.readonly ?? false
                    })) : []
                }));
                
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

        handleBrowseDisk(index) {
            // Create a hidden file input element
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.qcow2,.img,.iso,.raw';
            
            // Handle file selection
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    // Update the disk path in the VM config
                    if (this.showCreateModal) {
                        this.$refs.createModal.newVM.disks[index].path = file.path;
                    } else if (this.selectedVM) {
                        const config = this.getSelectedVMConfig();
                        config.disks[index].path = file.path;
                        this.updateVM(config);
                    }
                }
            };
            
            // Trigger file dialog
            input.click();
        },

        getSelectedVMConfig() {
            return this.vms.find(vm => vm.name === this.selectedVM) || null;
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
        window.addEventListener('resize', this.handleResize);

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
        window.removeEventListener('resize', this.handleResize);
    }
}); 