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
        }
    },
    data() {
        return {
            isEditing: false,
            editedConfig: null
        };
    },
    methods: {
        startEditing() {
            // Deep copy the VM config
            this.editedConfig = JSON.parse(JSON.stringify(this.vmConfig));
            this.isEditing = true;
        },
        cancelEditing() {
            this.editedConfig = JSON.parse(JSON.stringify(this.vmConfig));
            this.isEditing = false;
        },
        async saveChanges() {
            try {
                await this.$emit('update', { name: this.vm.name, ...this.editedConfig });
                this.isEditing = false;
            } catch (error) {
                this.$emit('error', error.message);
            }
        },
        openDisplay() {
            if (!this.vmConfig.display) {
                this.$emit('error', 'No display configuration available');
                return;
            }
            this.$emit('open-display');
        },
        addDisk() {
            if (!this.editedConfig.disks) {
                this.editedConfig.disks = [];
            }
            this.editedConfig.disks.push({
                type: 'hdd',
                interface: 'virtio',
                path: '',
                format: 'qcow2',
                readonly: false
            });
        },
        removeDisk(index) {
            this.editedConfig.disks.splice(index, 1);
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
        shouldShowCustomCPUInput(cpu, arch) {
            return cpu === '';
        },
        getFeatureStatus(feature) {
            const statuses = {
                kvm: {
                    available: this.qemuCapabilities?.has_kvm,
                    label: 'KVM',
                    description: 'Hardware virtualization'
                },
                spice: {
                    available: this.qemuCapabilities?.has_spice,
                    label: 'SPICE',
                    description: 'Remote display protocol'
                }
            };
            return statuses[feature] || { available: false, label: feature, description: '' };
        }
    },
    template: `
        <div class="space-y-6">
            <!-- Header -->
            <div class="flex justify-between items-center">
                <h2 class="text-2xl font-bold text-gray-900">{{ vm.name }}</h2>
                <div class="flex space-x-2">
                    <button v-if="vmState === 'running' && !vmConfig.headless && vmConfig.display"
                            @click="openDisplay"
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
                        Open Display
                    </button>
                    <button v-if="!isEditing"
                            @click="startEditing"
                            class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                        Edit Configuration
                    </button>
                </div>
            </div>

            <!-- View Mode -->
            <div v-if="!isEditing" class="bg-white shadow overflow-hidden sm:rounded-lg">
                <div class="px-4 py-5 sm:px-6">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">VM Configuration</h3>
                </div>
                <div class="border-t border-gray-200">
                    <dl>
                        <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">Architecture</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{{ vmConfig.arch || 'Not specified' }}</dd>
                        </div>
                        <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">CPU</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                {{ vmConfig.cpu }} ({{ vmConfig.cpu_cores }} cores, {{ vmConfig.cpu_threads }} threads per core)
                            </dd>
                        </div>
                        <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">Memory</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{{ vmConfig.memory || 0 }} MB</dd>
                        </div>
                        <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">Network</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                {{ vmConfig.network_type || 'None' }}
                                <span v-if="vmConfig.network_type === 'bridge'">({{ vmConfig.network_bridge }})</span>
                            </dd>
                        </div>
                        <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">Display</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                {{ displayType }}
                            </dd>
                        </div>
                        <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt class="text-sm font-medium text-gray-500">Storage Devices</dt>
                            <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                <ul v-if="vmConfig.disks && vmConfig.disks.length" class="border border-gray-200 rounded-md divide-y divide-gray-200">
                                    <li v-for="(disk, index) in vmConfig.disks" :key="index"
                                        class="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                                        <div class="w-0 flex-1 flex items-center">
                                            <span class="ml-2 flex-1 w-0 truncate">
                                                {{ disk.type === 'cdrom' ? '📀' : '💾' }}
                                                {{ disk.path }}
                                                ({{ disk.interface }}, {{ disk.format || 'raw' }})
                                                {{ disk.readonly ? '(read-only)' : '' }}
                                            </span>
                                        </div>
                                    </li>
                                </ul>
                                <div v-else class="text-sm text-gray-500">No storage devices configured</div>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <!-- Edit Mode -->
            <div v-else class="space-y-4">
                <form @submit.prevent="saveChanges" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Architecture</label>
                        <select v-model="editedConfig.arch" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="arch in updateArchitectureOptions()" 
                                    :key="arch" 
                                    :value="arch">{{ arch }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">CPU Model</label>
                        <div class="mt-1 flex space-x-2">
                            <select v-model="editedConfig.cpu" 
                                    class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="">Custom...</option>
                                <option v-for="model in getCPUModels(editedConfig.arch)" 
                                        :key="model" 
                                        :value="model">{{ model }}</option>
                            </select>
                            <input v-if="shouldShowCustomCPUInput(editedConfig.cpu, editedConfig.arch)"
                                   v-model="editedConfig.cpu" 
                                   type="text"
                                   placeholder="Custom CPU model"
                                   class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Cores</label>
                            <input v-model.number="editedConfig.cpu_cores" type="number" min="1"
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Threads per Core</label>
                            <input v-model.number="editedConfig.cpu_threads" type="number" min="1"
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Memory (MB)</label>
                        <input v-model.number="editedConfig.memory" type="number" required
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Network</label>
                        <div class="mt-1 space-y-2">
                            <select v-model="editedConfig.network_type"
                                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="user">User (NAT)</option>
                                <option value="bridge">Bridge</option>
                                <option value="none">None</option>
                            </select>
                            
                            <input v-if="editedConfig.network_type === 'bridge'"
                                   v-model="editedConfig.network_bridge"
                                   placeholder="Bridge device (e.g., virbr0)"
                                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">RTC Base</label>
                        <select v-model="editedConfig.rtc_base"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="utc">UTC</option>
                            <option value="localtime">Local Time</option>
                        </select>
                    </div>
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center" :class="{'opacity-50': !qemuCapabilities?.has_kvm}">
                            <input v-model="editedConfig.enable_kvm" type="checkbox" 
                                   :disabled="!qemuCapabilities?.has_kvm"
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">
                                Enable KVM
                                <span v-if="!qemuCapabilities?.has_kvm" class="text-yellow-600">(not available)</span>
                            </label>
                        </div>
                        <div class="flex items-center">
                            <input v-model="editedConfig.headless" type="checkbox" 
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">Headless Mode</label>
                        </div>
                    </div>
                    <div v-if="!editedConfig.headless" class="flex items-center space-x-4">
                        <div class="flex items-center">
                            <input v-model="editedConfig.display.type" type="radio" value="spice"
                                   :disabled="!qemuCapabilities?.has_spice"
                                   class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">
                                SPICE
                                <span v-if="!qemuCapabilities?.has_spice" class="text-yellow-600">(not available)</span>
                            </label>
                        </div>
                        <div class="flex items-center">
                            <input v-model="editedConfig.display.type" type="radio" value="vnc"
                                   class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">VNC</label>
                        </div>
                    </div>

                    <!-- Storage Devices -->
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-medium">Storage Devices</h3>
                            <button type="button" @click="addDisk" 
                                    class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                                Add Device
                            </button>
                        </div>
                        
                        <div v-for="(disk, index) in editedConfig.disks" :key="index" class="border rounded-lg p-4">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Device Type</label>
                                    <select v-model="disk.type" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="hdd">Hard Disk</option>
                                        <option value="cdrom">CD-ROM</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Interface</label>
                                    <select v-model="disk.interface" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="virtio">VirtIO</option>
                                        <option value="ide">IDE</option>
                                        <option value="scsi">SCSI</option>
                                    </select>
                                </div>
                                <div class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700">Path</label>
                                    <div class="mt-1 flex rounded-md shadow-sm">
                                        <input v-model="disk.path" type="text" 
                                               class="flex-1 rounded-l-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500">
                                        <button type="button" @click="$emit('browse-disk', index)"
                                                class="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100">
                                            Browse
                                        </button>
                                    </div>
                                </div>
                                <div v-if="disk.type === 'hdd'" class="col-span-2">
                                    <label class="block text-sm font-medium text-gray-700">Format</label>
                                    <select v-model="disk.format" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="qcow2">QCOW2</option>
                                        <option value="raw">Raw</option>
                                    </select>
                                </div>
                                <div class="col-span-2 flex items-center justify-between">
                                    <div class="flex items-center">
                                        <input v-model="disk.readonly" type="checkbox" 
                                               class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                        <label class="ml-2 block text-sm text-gray-700">Read-only</label>
                                    </div>
                                    <button type="button" @click="removeDisk(index)"
                                            class="text-red-600 hover:text-red-700">
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
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
        </div>
    `
}); 