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
        vmLogs: [],
        logRefreshInterval: null,
        currentView: 'vms',
        systemInfo: null,
        windowWidth: window.innerWidth,
        showFileBrowser: false,
        fileBrowserPath: '/',
        fileBrowserCallback: null
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
    watch: {
        // showingDisplay(newValue, oldValue) {
        //     console.log(`[App.js] showingDisplay changed from ${oldValue} to ${newValue}`);
        //     if (newValue === true) {
        //         console.log('[App.js] current selectedVM:', this.selectedVM);
        //         console.log('[App.js] current vmStates[this.selectedVM]:', this.vmStates[this.selectedVM]);
        //     }
        // }
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
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to create VM: ${response.statusText}`);
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
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to delete VM: ${response.statusText}`);
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
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to start VM: ${response.statusText}`);
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
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Failed to stop VM: ${response.statusText}`);
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
                    arch: vm.config.arch || '',
                    machine: vm.config.machine || '',
                    cpu: vm.config.cpu || '',
                    cpu_cores: vm.config.cpu_cores || 1,
                    cpu_threads: vm.config.cpu_threads || 1,
                    memory: vm.config.memory || 1024,
                    network_type: vm.config.network_type || 'user',
                    network_bridge: vm.config.network_bridge || '',
                    rtc_base: vm.config.rtc_base || 'utc',
                    enable_kvm: vm.config.enable_kvm ?? false,
                    headless: vm.config.headless ?? false,
                    display: {
                        type: (vm.config.display && vm.config.display.type) || 'vnc',
                        port: vm.config.display?.port || null,
                        relative_mouse: vm.config.display?.relative_mouse ?? true
                    },
                    disks: Array.isArray(vm.config.disks) ? vm.config.disks.map(disk => ({
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

        async handleBrowseDisk(index) {
            try {
                // Get the current path from the disk if it exists
                let currentPath = '';
                const selectedVM = this.getSelectedVMConfig();
                
                if (this.showCreateModal) {
                    const createModal = this.$root.$children.find(child => child.$options._componentTag === 'create-vm-modal');
                    if (createModal && createModal.newVM.disks[index]) {
                        currentPath = createModal.newVM.disks[index].path;
                    }
                } else if (selectedVM && selectedVM.disks[index]) {
                    currentPath = selectedVM.disks[index].path;
                }

                // Show file browser modal
                this.fileBrowserPath = currentPath;
                this.fileBrowserCallback = (selectedPath) => {
                    if (this.showCreateModal) {
                        const createModal = this.$root.$children.find(child => child.$options._componentTag === 'create-vm-modal');
                        if (createModal) {
                            createModal.newVM.disks[index].path = selectedPath;
                        }
                    } else if (selectedVM) {
                        const config = this.getSelectedVMConfig();
                        config.disks[index].path = selectedPath;
                        this.updateVM(config);
                    }
                };
                this.showFileBrowser = true;
            } catch (error) {
                this.errorMessage = error.message;
            }
        },

        handleFileSelected(path) {
            if (this.fileBrowserCallback) {
                this.fileBrowserCallback(path);
                this.fileBrowserCallback = null;
            }
            this.showFileBrowser = false;
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
        socket.on('vm_status', (data) => {
            this.$set(this.vmStates, data.name, data.running ? 'running' : 'stopped');
        });

        socket.on('vm_stopped', (data) => {
            this.$set(this.vmStates, data.name, 'stopped');
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