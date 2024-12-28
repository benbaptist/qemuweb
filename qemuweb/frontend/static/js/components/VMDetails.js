Vue.component('vm-details', {
    props: {
        vm: {
            type: Object,
            required: true
        },
        vmState: {
            type: String,
            required: true
        },
        qemuCapabilities: {
            type: Object,
            default: null
        }
    },
    data() {
        return {
            showEditModal: false,
            displayActive: false,
            showMenu: false
        };
    },
    computed: {
        displayType() {
            if (!this.vm) return 'None';
            if (this.vm.headless) return 'Headless';
            if (!this.vm.display) return 'None';
            return this.vm.display.type || 'None';
        },
        showDisplay() {
            return this.vmState === 'running' && !this.vm.headless && this.vm.display;
        },
        runtimeStats() {
            if (!this.vm) return null;
            return {
                cpuUsage: typeof this.vm.cpu_usage === 'number' ? this.vm.cpu_usage.toFixed(1) : '0.0',
                memoryMB: typeof this.vm.memory_mb === 'number' ? Math.round(this.vm.memory_mb) : 0,
                displayPort: this.vm.display?.port
            };
        }
    },
    mounted() {
        document.addEventListener('click', this.handleClickOutside);
    },
    beforeDestroy() {
        document.removeEventListener('click', this.handleClickOutside);
    },
    methods: {
        handleClickOutside(event) {
            const dropdown = this.$el.querySelector('.relative');
            if (dropdown && !dropdown.contains(event.target)) {
                this.showMenu = false;
            }
        },
        startEditing() {
            this.showEditModal = true;
        },
        handleUpdate(updatedConfig) {
            this.$emit('update', updatedConfig);
            this.showEditModal = false;
        },
        toggleDisplay() {
            this.displayActive = !this.displayActive;
            this.$emit('open-display');
        },
        startVM() {
            console.log('Start VM button clicked');
            this.$parent.startVM(this.vm.name);
        },
        stopVM() {
            console.log('Stop VM button clicked');
            this.$parent.stopVM(this.vm.name);
        },
        browseDisk(index) {
            this.$emit('browse-disk', index);
        }
    },
    template: `
        <div class="bg-white shadow rounded-lg p-6">
            <!-- VM Config Modal -->
            <vm-config-modal
                v-if="showEditModal"
                :show="showEditModal"
                :qemu-capabilities="qemuCapabilities"
                :existing-vm="vm"
                mode="edit"
                @close="showEditModal = false"
                @update="handleUpdate"
                @browse-disk="browseDisk"
            />

            <!-- VM Details Header -->
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-900">{{ vm.name }}</h2>
                    <p class="text-sm text-gray-500">{{ vm.arch }} / {{ vm.machine }}</p>
                </div>
                <div class="relative">
                    <button @click="showMenu = !showMenu" 
                            class="p-2 hover:bg-gray-100 rounded-full">
                        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    </button>
                    <div v-if="showMenu" 
                         class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10">
                        <div class="py-1">
                            <button @click="startEditing(); showMenu = false"
                                    class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                Edit Configuration
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Status and Controls -->
            <div class="mb-6">
                <div class="flex items-center space-x-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                          :class="{
                              'bg-green-100 text-green-800': vmState === 'running',
                              'bg-red-100 text-red-800': vmState === 'stopped',
                              'bg-yellow-100 text-yellow-800': vmState === 'error'
                          }">
                        {{ vmState }}
                    </span>
                    <button v-if="vmState === 'stopped'"
                            @click="startVM"
                            class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
                        Start
                    </button>
                    <button v-if="vmState === 'running'"
                            @click="stopVM"
                            class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                        Stop
                    </button>
                </div>
            </div>

            <!-- Runtime Stats -->
            <div v-if="vmState === 'running' && runtimeStats" class="mb-6">
                <h3 class="text-lg font-medium text-gray-900 mb-3">Runtime Statistics</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <div class="text-sm font-medium text-gray-500">CPU Usage</div>
                        <div class="mt-1 text-lg font-semibold">{{ runtimeStats.cpuUsage }}%</div>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <div class="text-sm font-medium text-gray-500">Memory</div>
                        <div class="mt-1 text-lg font-semibold">{{ runtimeStats.memoryMB }} MB</div>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <div class="text-sm font-medium text-gray-500">Display Port</div>
                        <div class="mt-1 text-lg font-semibold">{{ runtimeStats.displayPort || 'N/A' }}</div>
                    </div>
                </div>
            </div>

            <!-- Display Section -->
            <div v-if="showDisplay" class="mb-6">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-medium text-gray-900">Display</h3>
                    <button @click="toggleDisplay"
                            class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
                        {{ displayActive ? 'Hide Display' : 'Show Display' }}
                    </button>
                </div>
                <div class="text-sm text-gray-500">
                    Type: {{ displayType }}
                    <span v-if="runtimeStats?.displayPort"> (Port: {{ runtimeStats.displayPort }})</span>
                </div>
            </div>

            <!-- Configuration Details -->
            <div class="space-y-6">
                <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-3">System Configuration</h3>
                    <dl class="grid grid-cols-2 gap-4">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Architecture</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.arch }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Machine Type</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.machine }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">CPU Model</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.cpu }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Memory</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.memory }} MB</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">CPU Cores</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.cpu_cores }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Threads per Core</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.cpu_threads }}</dd>
                        </div>
                    </dl>
                </div>

                <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-3">Network Configuration</h3>
                    <dl class="grid grid-cols-2 gap-4">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Network Type</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.network_type }}</dd>
                        </div>
                        <div v-if="vm.network_type === 'bridge'">
                            <dt class="text-sm font-medium text-gray-500">Bridge Device</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.network_bridge }}</dd>
                        </div>
                    </dl>
                </div>

                <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-3">Features</h3>
                    <dl class="grid grid-cols-2 gap-4">
                        <div>
                            <dt class="text-sm font-medium text-gray-500">KVM</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.enable_kvm ? 'Enabled' : 'Disabled' }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">Display Mode</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.headless ? 'Headless' : displayType }}</dd>
                        </div>
                        <div>
                            <dt class="text-sm font-medium text-gray-500">RTC Base</dt>
                            <dd class="mt-1 text-sm text-gray-900">{{ vm.rtc_base }}</dd>
                        </div>
                    </dl>
                </div>

                <div v-if="vm.disks && vm.disks.length > 0">
                    <h3 class="text-lg font-medium text-gray-900 mb-3">Disks</h3>
                    <div class="space-y-4">
                        <div v-for="(disk, index) in vm.disks" :key="index"
                             class="bg-gray-50 p-4 rounded-lg">
                            <dl class="grid grid-cols-2 gap-4">
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">Type</dt>
                                    <dd class="mt-1 text-sm text-gray-900">{{ disk.type }}</dd>
                                </div>
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">Interface</dt>
                                    <dd class="mt-1 text-sm text-gray-900">{{ disk.interface }}</dd>
                                </div>
                                <div class="col-span-2">
                                    <dt class="text-sm font-medium text-gray-500">Path</dt>
                                    <dd class="mt-1 text-sm text-gray-900">{{ disk.path }}</dd>
                                </div>
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">Format</dt>
                                    <dd class="mt-1 text-sm text-gray-900">{{ disk.format }}</dd>
                                </div>
                                <div>
                                    <dt class="text-sm font-medium text-gray-500">Read Only</dt>
                                    <dd class="mt-1 text-sm text-gray-900">{{ disk.readonly ? 'Yes' : 'No' }}</dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
}); 