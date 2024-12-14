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
    computed: {
        vmConfig() {
            return this.vm.config || {};
        },
        displayType() {
            if (this.vmConfig.headless) return 'Headless';
            if (!this.vmConfig.display) return 'None';
            return this.vmConfig.display.type || 'None';
        },
        showDisplay() {
            return this.vmState === 'running' && !this.vmConfig.headless && this.vmConfig.display;
        }
    },
    data() {
        return {
            isEditing: false,
            editedConfig: null,
            displayActive: false,
            showMenu: false
        };
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
        updateArchitectureOptions() {
            return this.qemuCapabilities?.architectures || [];
        },
        getCPUModels(arch) {
            if (!this.qemuCapabilities || !arch) return [];
            
            // Get CPU models for the selected architecture
            const archModels = this.qemuCapabilities.cpu_models?.[arch] || [];
            
            // Always include 'host' if KVM is available
            const models = new Set(archModels);
            if (this.qemuCapabilities.has_kvm) {
                models.add('host');
            }
            
            return Array.from(models).sort();
        },
        startEditing() {
            // Create a deep copy of the VM config with all required fields
            this.editedConfig = {
                name: this.vmConfig.name,
                arch: this.vmConfig.arch || '',
                cpu: this.vmConfig.cpu || '',
                cpu_cores: this.vmConfig.cpu_cores || 1,
                cpu_threads: this.vmConfig.cpu_threads || 1,
                memory: this.vmConfig.memory || 1024,
                network_type: this.vmConfig.network_type || 'user',
                network_bridge: this.vmConfig.network_bridge || '',
                rtc_base: this.vmConfig.rtc_base || 'utc',
                enable_kvm: this.vmConfig.enable_kvm || false,
                headless: this.vmConfig.headless || false,
                display: {
                    type: this.vmConfig.display?.type || 'spice'
                },
                disks: this.vmConfig.disks || []
            };
            this.isEditing = true;
        },
        cancelEditing() {
            this.editedConfig = null;
            this.isEditing = false;
        },
        async saveChanges() {
            try {
                await this.$emit('update', this.editedConfig);
                this.isEditing = false;
            } catch (error) {
                this.$emit('error', error.message);
            }
        },
        toggleDisplay() {
            this.displayActive = !this.displayActive;
            this.$emit('open-display');
        }
    },
    template: `
        <div class="space-y-6">
            <!-- Header -->
            <div class="px-6 py-5 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-3">
                        <h2 class="text-2xl font-bold text-gray-900">{{ vmConfig.name }}</h2>
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
                                        @click="$emit('start'); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                                    </svg>
                                    Start VM
                                </button>
                                <button v-else
                                        @click="$emit('stop'); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
                                    </svg>
                                    Stop VM
                                </button>
                                <button v-if="showDisplay"
                                        @click="toggleDisplay(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
                                    </svg>
                                    Show Display
                                </button>
                            </div>
                            <div class="py-1">
                                <button @click="startEditing(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                    </svg>
                                    Edit Configuration
                                </button>
                                <button @click="$emit('delete'); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-red-700 hover:bg-red-100 hover:text-red-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-red-400 group-hover:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                                    </svg>
                                    Delete VM
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- View Mode -->
            <div v-if="!isEditing" class="px-6">
                <!-- Configuration -->
                <h3 class="text-lg font-medium text-gray-900 mb-4">Configuration</h3>
                <dl class="space-y-6">
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Architecture</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.arch }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">CPU Model</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.cpu }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">CPU Configuration</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            {{ vmConfig.cpu_cores }} cores, {{ vmConfig.cpu_threads }} threads per core
                        </dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Memory</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.memory }} MB</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Network</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            {{ vmConfig.network_type === 'user' ? 'User (NAT)' : 'Bridge' }}
                            <template v-if="vmConfig.network_type === 'bridge'">
                                ({{ vmConfig.network_bridge }})
                            </template>
                        </dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">RTC Base</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.rtc_base }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Features</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            <div class="space-y-1">
                                <div>KVM: {{ vmConfig.enable_kvm ? 'Enabled' : 'Disabled' }}</div>
                                <div>Display: {{ displayType }}</div>
                            </div>
                        </dd>
                    </div>
                </dl>

                <!-- Runtime Stats -->
                <template v-if="vmState === 'running'">
                    <h3 class="text-lg font-medium text-gray-900 mt-8 mb-4">Runtime Statistics</h3>
                    <dl class="space-y-6">
                        <div class="grid grid-cols-3 gap-4">
                            <dt class="text-sm font-medium text-gray-500">CPU Usage</dt>
                            <dd class="text-sm text-gray-900 col-span-2">{{ vm.cpu_usage.toFixed(1) }}%</dd>
                        </div>
                        <div class="grid grid-cols-3 gap-4">
                            <dt class="text-sm font-medium text-gray-500">Memory Usage</dt>
                            <dd class="text-sm text-gray-900 col-span-2">{{ Math.round(vm.memory_mb) }} MB</dd>
                        </div>
                    </dl>
                </template>
            </div>

            <!-- Edit Mode -->
            <div v-else class="px-6 pb-6">
                <form @submit.prevent="saveChanges" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Architecture</label>
                        <select v-model="editedConfig.arch" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="arch in updateArchitectureOptions()" :key="arch" :value="arch">{{ arch }}</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">CPU Model</label>
                        <select v-model="editedConfig.cpu" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="model in getCPUModels(editedConfig.arch)" :key="model" :value="model">{{ model }}</option>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Cores</label>
                            <input v-model.number="editedConfig.cpu_cores" type="number" min="1" required
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Threads</label>
                            <input v-model.number="editedConfig.cpu_threads" type="number" min="1" required
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Memory (MB)</label>
                        <input v-model.number="editedConfig.memory" type="number" min="128" required
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Network Type</label>
                        <select v-model="editedConfig.network_type"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="user">User (NAT)</option>
                            <option value="bridge">Bridge</option>
                        </select>
                    </div>

                    <div v-if="editedConfig.network_type === 'bridge'">
                        <label class="block text-sm font-medium text-gray-700">Network Bridge</label>
                        <input v-model="editedConfig.network_bridge" type="text"
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">RTC Base</label>
                        <select v-model="editedConfig.rtc_base"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="utc">UTC</option>
                            <option value="localtime">Local Time</option>
                        </select>
                    </div>

                    <div class="space-y-4">
                        <div class="flex items-center">
                            <input v-model="editedConfig.enable_kvm" type="checkbox" 
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">Enable KVM</label>
                        </div>

                        <div class="flex items-center">
                            <input v-model="editedConfig.headless" type="checkbox" 
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">Headless Mode</label>
                        </div>
                    </div>

                    <div v-if="!editedConfig.headless">
                        <label class="block text-sm font-medium text-gray-700">Display Type</label>
                        <select v-model="editedConfig.display.type"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="spice">SPICE</option>
                            <option value="vnc">VNC</option>
                        </select>
                    </div>

                    <div class="flex justify-end space-x-2">
                        <button type="button"
                                @click="cancelEditing"
                                class="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>

            <!-- VM Display -->
            <div v-if="displayActive" class="px-6">
                <vm-display 
                    :vm-id="vm.name"
                    @error="$emit('error', $event)">
                </vm-display>
            </div>
        </div>
    `
}); 