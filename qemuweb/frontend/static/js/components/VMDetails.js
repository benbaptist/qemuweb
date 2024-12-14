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
            return this.vm || {};
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
            displayActive: false
        };
    },
    methods: {
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
                    <div class="flex space-x-2">
                        <button v-if="showDisplay"
                                @click="toggleDisplay"
                                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
                            Show Display
                        </button>
                        <button v-if="!isEditing"
                                @click="startEditing"
                                class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                            Edit Configuration
                        </button>
                    </div>
                </div>
            </div>

            <!-- View Mode -->
            <div v-if="!isEditing" class="px-6">
                <dl class="space-y-6">
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Memory</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.memory || 0 }} MB</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">CPUs</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ vmConfig.cpus }}</dd>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Display</dt>
                        <dd class="text-sm text-gray-900 col-span-2">{{ displayType }}</dd>
                    </div>
                </dl>
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