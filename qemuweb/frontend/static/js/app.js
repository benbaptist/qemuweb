// WebSocket connection
const socket = io();

// Main Vue application
const app = new Vue({
    el: '#app',
    data() {
        return {
            vms: [],
            selectedVM: null,
            showCreateModal: false,
            qemuCapabilities: null,
            error: null,
            vmStates: {},
            displayConnections: {},
            showingDisplay: false,
            vmLogs: [],
            logRefreshInterval: null,
            currentView: 'vms',
            systemInfo: null,
            windowWidth: window.innerWidth,
            showFileBrowser: false,
            fileBrowserPath: '/',
            fileBrowserCallback: null,
            loading: false
        };
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
                        port: vm.config.display?.port || null
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
    },
    template: `
        <div class="h-screen flex overflow-hidden bg-gray-100">
            <!-- Sidebar -->
            <div class="hidden md:flex md:flex-shrink-0">
                <div class="flex flex-col w-64">
                    <div class="flex flex-col h-0 flex-1">
                        <div class="flex-1 flex flex-col overflow-y-auto">
                            <nav class="flex-1 px-2 py-4 bg-white space-y-1">
                                <a href="#" @click.prevent="currentView = 'vms'"
                                   :class="['group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                                           currentView === 'vms' 
                                           ? 'bg-gray-100 text-gray-900' 
                                           : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900']">
                                    <svg class="mr-3 flex-shrink-0 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Virtual Machines
                                </a>
                                <a href="#" @click.prevent="currentView = 'status'"
                                   :class="['group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                                           currentView === 'status' 
                                           ? 'bg-gray-100 text-gray-900' 
                                           : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900']">
                                    <svg class="mr-3 flex-shrink-0 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    System Status
                                </a>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main content -->
            <div class="flex flex-col w-0 flex-1 overflow-hidden">
                <main class="flex-1 relative overflow-y-auto focus:outline-none">
                    <div class="py-6">
                        <!-- VM Config Modal -->
                        <vm-config-modal
                            v-if="showCreateModal"
                            :show="showCreateModal"
                            :qemu-capabilities="qemuCapabilities"
                            mode="create"
                            @close="showCreateModal = false"
                            @create="createVM"
                            @browse-disk="handleBrowseDisk"
                        />

                        <!-- Error Alert -->
                        <div v-if="error" class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mb-4">
                            <div class="bg-red-50 border-l-4 border-red-400 p-4">
                                <div class="flex">
                                    <div class="flex-shrink-0">
                                        <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                                        </svg>
                                    </div>
                                    <div class="ml-3">
                                        <p class="text-sm text-red-700">{{ error }}</p>
                                    </div>
                                    <div class="ml-auto pl-3">
                                        <button @click="error = null" class="inline-flex text-red-400 hover:text-red-500">
                                            <span class="sr-only">Dismiss</span>
                                            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
                            <div v-if="currentView === 'vms'" class="flex justify-between items-center">
                                <h1 class="text-2xl font-semibold text-gray-900">Virtual Machines</h1>
                                <button @click="showCreateModal = true"
                                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                                    Create VM
                                </button>
                            </div>
                            <div v-else-if="currentView === 'status'" class="flex justify-between items-center">
                                <h1 class="text-2xl font-semibold text-gray-900">System Status</h1>
                            </div>
                        </div>

                        <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
                            <div class="py-4">
                                <div v-if="currentView === 'vms'" class="flex">
                                    <!-- VM List -->
                                    <div class="w-1/3 pr-4 border-r">
                                        <div v-if="vms.length === 0" class="text-center py-4">
                                            <p class="text-gray-500">No virtual machines found</p>
                                        </div>
                                        <div v-else class="space-y-2">
                                            <div v-for="vm in sortedVMs" :key="vm.name"
                                                 @click="selectedVM = vm"
                                                 class="p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                                                 :class="{'bg-gray-50': selectedVM && selectedVM.name === vm.name}">
                                                <div class="flex justify-between items-center">
                                                    <h3 class="text-lg font-medium text-gray-900">{{ vm.name }}</h3>
                                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                                          :class="{
                                                              'bg-green-100 text-green-800': vmStates[vm.name] === 'running',
                                                              'bg-red-100 text-red-800': vmStates[vm.name] === 'stopped',
                                                              'bg-yellow-100 text-yellow-800': vmStates[vm.name] === 'error'
                                                          }">
                                                        {{ vmStates[vm.name] }}
                                                    </span>
                                                </div>
                                                <div class="mt-1 text-sm text-gray-500">
                                                    {{ vm.arch }} / {{ vm.machine }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- VM Details -->
                                    <div v-if="selectedVM" class="w-2/3 pl-4">
                                        <vm-details
                                            :vm="selectedVM"
                                            :vm-state="vmStates[selectedVM.name]"
                                            :qemu-capabilities="qemuCapabilities"
                                            @update="updateVM"
                                            @error="handleError"
                                            @browse-disk="handleBrowseDisk"
                                            @open-display="openDisplay">
                                        </vm-details>
                                    </div>
                                    <div v-else class="w-2/3 pl-4 flex items-center justify-center">
                                        <p class="text-gray-500">Select a VM to view details</p>
                                    </div>
                                </div>
                                <div v-else-if="currentView === 'status'">
                                    <status-page :system-info="systemInfo"></status-page>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    `
}); 