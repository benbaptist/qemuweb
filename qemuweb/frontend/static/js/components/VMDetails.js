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
            if (!this.vm) return {};
            return this.isEditing ? this.editedConfig : this.vm.config || {};
        },
        displayType() {
            if (this.vmConfig.headless) return 'Headless';
            if (!this.vmConfig.display) return 'None';
            return this.vmConfig.display.type || 'None';
        },
        showDisplay() {
            return this.vmState === 'running' && !this.vmConfig.headless && this.vmConfig.display;
        },
        availableDisplayTypes() {
            const types = ['vnc']; // VNC is always available
            if (this.qemuCapabilities?.has_spice) types.push('spice');
            return types;
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
    watch: {
        'editedConfig.headless'(newValue) {
            if (!newValue && (!this.editedConfig.display || !this.editedConfig.display.type)) {
                // When switching from headless to display mode, ensure display settings are initialized
                this.editedConfig.display = this.editedConfig.display || {};
                this.editedConfig.display.type = this.qemuCapabilities?.has_spice ? 'spice' : 'vnc';
            }
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
        getMachineTypes(arch) {
            if (!this.qemuCapabilities || !arch) return [];
            return this.qemuCapabilities.machine_types?.[arch] || [];
        },
        startEditing() {
            // Start with a deep copy of the VM's config
            this.editedConfig = JSON.parse(JSON.stringify(this.vm.config || {}));
            
            // Ensure all required properties exist with defaults
            this.editedConfig = {
                name: this.vm.name,
                arch: this.editedConfig.arch || '',
                cpu: this.editedConfig.cpu || '',
                cpu_cores: this.editedConfig.cpu_cores || 1,
                cpu_threads: this.editedConfig.cpu_threads || 1,
                memory: this.editedConfig.memory || 1024,
                network_type: this.editedConfig.network_type || 'user',
                network_bridge: this.editedConfig.network_bridge || '',
                rtc_base: this.editedConfig.rtc_base || 'utc',
                enable_kvm: this.editedConfig.enable_kvm !== undefined ? this.editedConfig.enable_kvm : true,
                headless: this.editedConfig.headless || false,
                machine: this.editedConfig.machine || '',
                disks: Array.isArray(this.editedConfig.disks) ? this.editedConfig.disks : [],
                display: {
                    type: (this.editedConfig.display && this.editedConfig.display.type) || (this.qemuCapabilities?.has_spice ? 'spice' : 'vnc')
                }
            };
            
            // Ensure VNC is selected if SPICE is not available and was previously selected
            if (this.editedConfig.display.type === 'spice' && !this.qemuCapabilities?.has_spice) {
                this.editedConfig.display.type = 'vnc';
            }
            
            this.isEditing = true;
        },
        cancelEditing() {
            this.isEditing = false;
            this.editedConfig = null;
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
        },
        startVM() {
            console.log('Start VM button clicked');
            this.$parent.startVM(this.vm.name);
        },
        stopVM() {
            console.log('Stop VM button clicked');
            this.$parent.stopVM(this.vm.name);
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
            <!-- Header with dropdown menu -->
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
                                        @click="startVM(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Start VM
                                </button>
                                <button v-else
                                        @click="stopVM(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                    </svg>
                                    Stop VM
                                </button>
                                <button @click="startEditing(); showMenu = false"
                                        class="group flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit Configuration
                                </button>
                                <button @click="$parent.deleteVM(vm.name); showMenu = false; $parent.selectedVM = null"
                                        class="group flex items-center px-4 py-2 text-sm text-red-700 hover:bg-red-100 hover:text-red-900 w-full text-left">
                                    <svg class="mr-3 h-5 w-5 text-red-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete VM
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Edit Mode -->
            <div v-if="isEditing" class="px-6 pb-6">
                <form @submit.prevent="saveChanges" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Name</label>
                        <input v-model="editedConfig.name" type="text" required
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    </div>

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
                        <label class="block text-sm font-medium text-gray-700">Machine Type</label>
                        <select v-model="editedConfig.machine" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="machine in getMachineTypes(editedConfig.arch)" 
                                    :key="machine" 
                                    :value="machine">{{ machine }}</option>
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

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Display Settings</label>
                        <div class="mt-2 space-y-4">
                            <div class="flex items-center">
                                <input type="checkbox" 
                                       v-model="editedConfig.headless"
                                       class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                                <label class="ml-2 block text-sm text-gray-900">Headless Mode</label>
                            </div>
                            
                            <template v-if="!editedConfig.headless">
                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Display Type</label>
                                    <div class="space-y-2">
                                        <div v-for="type in availableDisplayTypes" :key="type" class="flex items-center">
                                            <input type="radio" 
                                                   :id="'display-' + type"
                                                   :value="type"
                                                   v-model="editedConfig.display.type"
                                                   :disabled="type === 'spice' && !qemuCapabilities?.has_spice"
                                                   class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                                            <label :for="'display-' + type" class="ml-2 block text-sm text-gray-900">
                                                {{ type.toUpperCase() }}
                                                <span v-if="type === 'spice' && !qemuCapabilities?.has_spice" class="text-gray-500">(Not Available)</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center justify-between">
                            <label class="block text-sm font-medium text-gray-700">Storage Devices</label>
                            <button type="button" 
                                    @click="editedConfig.disks.push({
                                        type: 'disk',
                                        path: '',
                                        interface: 'virtio',
                                        format: 'qcow2',
                                        readonly: false
                                    })"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Add Device
                            </button>
                        </div>
                        <div class="mt-2 space-y-4">
                            <div v-for="(disk, index) in editedConfig.disks" :key="index" class="border border-gray-200 rounded-md p-4">
                                <div class="flex justify-between items-start">
                                    <div class="flex-grow space-y-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Type</label>
                                            <select v-model="disk.type"
                                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                                <option value="disk">Disk</option>
                                                <option value="cdrom">CD-ROM</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Path</label>
                                            <input v-model="disk.path" type="text" required
                                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Interface</label>
                                            <select v-model="disk.interface"
                                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                                <option value="virtio">VirtIO</option>
                                                <option value="ide">IDE</option>
                                                <option value="scsi">SCSI</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Format</label>
                                            <select v-model="disk.format"
                                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                                <option value="qcow2">QCOW2</option>
                                                <option value="raw">Raw</option>
                                            </select>
                                        </div>
                                        <div class="flex items-center">
                                            <input type="checkbox" 
                                                   v-model="disk.readonly"
                                                   class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                                            <label class="ml-2 block text-sm text-gray-900">Read Only</label>
                                        </div>
                                    </div>
                                    <button type="button" 
                                            @click="editedConfig.disks.splice(index, 1)"
                                            class="ml-4 text-red-600 hover:text-red-700">
                                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">KVM</label>
                        <div class="mt-2">
                            <div class="flex items-center">
                                <input type="checkbox" 
                                       v-model="editedConfig.enable_kvm"
                                       :disabled="!qemuCapabilities?.has_kvm"
                                       class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                                <label class="ml-2 block text-sm text-gray-900">
                                    Enable KVM
                                    <span v-if="!qemuCapabilities?.has_kvm" class="text-gray-500">(Not Available)</span>
                                </label>
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

            <!-- View Mode -->
            <div v-else class="px-6">
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
                    <div class="grid grid-cols-3 gap-4">
                        <dt class="text-sm font-medium text-gray-500">Storage Devices</dt>
                        <dd class="text-sm text-gray-900 col-span-2">
                            <div v-if="vmConfig.disks && vmConfig.disks.length > 0" class="space-y-2">
                                <div v-for="(disk, index) in vmConfig.disks" :key="index" class="flex items-start space-x-2">
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

                <!-- VM Thumbnail -->
                <div v-if="!vmConfig.headless" class="mt-6">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Display Preview</h3>
                    <vm-thumbnail
                        :vm-id="vm.name"
                        :vm-state="vmState"
                        @click="toggleDisplay">
                    </vm-thumbnail>
                </div>

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