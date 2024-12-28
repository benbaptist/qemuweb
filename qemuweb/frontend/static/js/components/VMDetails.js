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
            displayActive: false,
            showMenu: false,
            showModal: false
        };
    },
    computed: {
        runtimeStats() {
            if (!this.vm) return null;
            return {
                cpuUsage: typeof this.vm.cpu_usage === 'number' ? this.vm.cpu_usage.toFixed(1) : '0.0',
                memoryMB: typeof this.vm.memory_mb === 'number' ? Math.round(this.vm.memory_mb) : 0,
                displayPort: this.vm.display?.port
            };
        }
    },
    methods: {
        openEditModal() {
            this.showModal = true;
        },
        handleCreateOrUpdate(vmData) {
            this.$emit('update', vmData);
            this.showModal = false;
        },
        startVM() {
            console.log('Start VM button clicked');
            this.$parent.startVM(this.vm.name);
        },
        stopVM() {
            console.log('Stop VM button clicked');
            this.$parent.stopVM(this.vm.name);
        }
    },
    template: `
        <div class="space-y-6">
            <!-- Header with dropdown menu -->
            <div class="px-6 py-5 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <h2 class="text-2xl font-bold text-gray-900">{{ vm.name }}</h2>
                        <span class="px-2 py-1 text-sm rounded-full"
                              :class="{
                                  'bg-green-100 text-green-800': vmState === 'running',
                                  'bg-gray-100 text-gray-800': vmState === 'stopped',
                                  'bg-yellow-100 text-yellow-800': vmState === 'paused',
                                  'bg-red-100 text-red-800': vmState === 'error'
                              }">
                            {{ vmState.charAt(0).toUpperCase() + vmState.slice(1) }}
                        </span>
                    </div>
                    <div class="relative">
                        <button @click="showMenu = !showMenu"
                                class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            Actions
                            <svg class="ml-2 -mr-0.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                        </button>
                        <div v-if="showMenu" 
                             class="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 divide-y divide-gray-100 focus:outline-none z-10">
                            <div class="py-1">
                                <button v-if="vmState !== 'running'"
                                        @click="startVM(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    Start VM
                                </button>
                                <button v-else
                                        @click="stopVM(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    Stop VM
                                </button>
                                <button @click="openEditModal(); showMenu = false" 
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    Edit Configuration
                                </button>
                                <button @click="$parent.deleteVM(vm.name); showMenu = false; $parent.selectedVM = null"
                                        class="group flex items-center px-4 py-2 text-sm text-red-700 hover:bg-red-100 hover:text-red-900 w-full text-left">
                                    Delete VM
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Create/Update VM Modal -->
            <create-vm-modal 
                v-if="showModal" 
                :show="showModal" 
                :qemuCapabilities="qemuCapabilities" 
                :vmData="vm" 
                @create="handleCreateOrUpdate" 
                @update="handleCreateOrUpdate" 
                @close="showModal = false">
            </create-vm-modal>

            <!-- VM Configuration Details -->
            <div class="px-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Configuration</h3>
                <dl class="space-y-6">
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Architecture</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vm.arch }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Machine Type</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vm.machine }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">CPU Model</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vm.cpu }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">CPU Configuration</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            {{ vm.cpu_cores }} cores, {{ vm.cpu_threads }} threads per core
                        </dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Memory</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vm.memory }} MB</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Network</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            {{ vm.network_type === 'user' ? 'User (NAT)' : 'Bridge' }}
                            <template v-if="vm.network_type === 'bridge'">
                                ({{ vm.network_bridge }})
                            </template>
                        </dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">RTC Base</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vm.rtc_base }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Features</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            <div class="space-y-1">
                                <div>KVM: {{ vm.enable_kvm ? 'Enabled' : 'Disabled' }}</div>
                                <div>Display: {{ vm.display?.type || 'None' }}</div>
                            </div>
                        </dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Storage Devices</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            <div v-if="vm.disks && vm.disks.length > 0" class="space-y-2">
                                <div v-for="(disk, index) in vm.disks" :key="index" class="flex items-start space-x-2">
                                    <div class="flex-grow">
                                        <div class="font-medium">{{ disk.type === 'cdrom' ? 'CD-ROM' : 'Disk' }}</div>
                                        <div class="text-gray-500">
                                            {{ disk.path }}
                                            <template v-if="disk.readonly">(Read Only)</template>
                                        </div>
                                        <div class="text-gray-500">
                                            Interface: {{ disk.interface }}, Format: {{ disk.format }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="text-gray-500">No storage devices attached</div>
                        </dd>
                    </div>
                </dl>
            </div>

            <!-- Runtime Stats -->
            <template v-if="vmState === 'running'">
                <div class="px-6 mt-8">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Runtime Statistics</h3>
                    <dl class="space-y-6">
                        <div class="grid grid-cols-3 gap-4">
                            <dt class="text-sm font-medium text-gray-500">CPU Usage</dt>
                            <dd class="text-sm text-gray-900 col-span-2">{{ runtimeStats.cpuUsage }}%</dd>
                        </div>
                        <div class="grid grid-cols-3 gap-4">
                            <dt class="text-sm font-medium text-gray-500">Memory Usage</dt>
                            <dd class="text-sm text-gray-900 col-span-2">{{ runtimeStats.memoryMB }} MB</dd>
                        </div>
                        <div v-if="runtimeStats.displayPort" class="grid grid-cols-3 gap-4">
                            <dt class="text-sm font-medium text-gray-500">Display Port</dt>
                            <dd class="text-sm text-gray-900 col-span-2">{{ runtimeStats.displayPort }}</dd>
                        </div>
                    </dl>
                </div>
            </template>

            <!-- VM Thumbnail -->
            <div v-if="!vm.headless" class="px-6 mt-6">
                <h3 class="text-lg font-medium text-gray-900">Display Preview</h3>
                <vm-thumbnail
                    :vm-id="vm.name"
                    :vm-state="vmState">
                </vm-thumbnail>
            </div>
        </div>
    `
}); 