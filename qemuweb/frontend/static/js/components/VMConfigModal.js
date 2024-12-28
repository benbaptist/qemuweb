Vue.component('vm-config-modal', {
    props: {
        show: {
            type: Boolean,
            required: true
        },
        qemuCapabilities: {
            type: Object,
            default: null
        },
        existingVM: {
            type: Object,
            default: null
        },
        mode: {
            type: String,
            default: 'create',
            validator: value => ['create', 'edit'].includes(value)
        }
    },
    data() {
        return {
            vmConfig: {
                name: '',
                arch: '',
                cpu: '',
                cpu_cores: 1,
                cpu_threads: 1,
                memory: 1024,
                network_type: 'user',
                network_bridge: '',
                rtc_base: 'utc',
                enable_kvm: false,
                headless: false,
                display: {
                    type: 'spice'
                },
                machine: '',
                disks: []
            }
        }
    },
    computed: {
        modalTitle() {
            return this.mode === 'create' ? 'Create New VM' : 'Edit VM';
        }
    },
    watch: {
        existingVM: {
            immediate: true,
            handler(vm) {
                if (vm && this.mode === 'edit') {
                    this.vmConfig = {
                        name: vm.name,
                        arch: vm.arch,
                        machine: vm.machine,
                        cpu: vm.cpu,
                        cpu_cores: parseInt(vm.cpu_cores) || 1,
                        cpu_threads: parseInt(vm.cpu_threads) || 1,
                        memory: parseInt(vm.memory) || 1024,
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
                    };
                }
            }
        },
        qemuCapabilities: {
            immediate: true,
            handler(newCaps) {
                if (newCaps) {
                    if (newCaps.has_kvm && this.mode === 'create') {
                        this.vmConfig.enable_kvm = true;
                    }
                    if (!newCaps.has_kvm) {
                        this.vmConfig.enable_kvm = false;
                    }
                }
            }
        },
        'vmConfig.arch'(newArch) {
            // Reset dependent fields when architecture changes
            this.vmConfig.machine = '';
            this.vmConfig.cpu = '';
            
            // Wait for available options to update
            this.$nextTick(() => {
                const machines = this.getMachineTypes(newArch);
                const cpus = this.getCPUModels(newArch);
                if (machines.length > 0) {
                    this.vmConfig.machine = machines[0];
                }
                if (cpus.length > 0) {
                    this.vmConfig.cpu = cpus[0];
                }
            });
        },
        'vmConfig.headless'(newValue) {
            if (!newValue && (!this.vmConfig.display || !this.vmConfig.display.type)) {
                this.vmConfig.display = this.vmConfig.display || {};
                this.vmConfig.display.type = this.qemuCapabilities?.has_spice ? 'spice' : 'vnc';
            }
        }
    },
    methods: {
        updateArchitectureOptions() {
            return this.qemuCapabilities?.architectures || [];
        },
        getCPUModels(arch) {
            if (!this.qemuCapabilities || !arch) return [];
            
            const archModels = this.qemuCapabilities.cpu_models?.[arch] || [];
            const models = new Set(archModels);
            
            if (this.qemuCapabilities.has_kvm) {
                models.add('host');
            }
            
            // If editing and current CPU isn't in list, add it
            if (this.existingVM?.cpu && !models.has(this.existingVM.cpu)) {
                models.add(this.existingVM.cpu);
            }
            
            return Array.from(models).sort();
        },
        getMachineTypes(arch) {
            if (!this.qemuCapabilities || !arch) return [];
            const types = this.qemuCapabilities.machine_types?.[arch] || [];
            
            // If editing and current machine type isn't in list, add it
            if (this.existingVM?.machine && !types.includes(this.existingVM.machine)) {
                types.push(this.existingVM.machine);
            }
            
            return types;
        },
        shouldShowCustomCPUInput(cpu, arch) {
            return cpu === '';
        },
        addDisk() {
            this.vmConfig.disks.push({
                type: 'hdd',
                interface: 'virtio',
                path: '',
                format: 'qcow2',
                readonly: false
            });
        },
        removeDisk(index) {
            this.vmConfig.disks.splice(index, 1);
        },
        browseDisk(index) {
            this.$emit('browse-disk', index);
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
        },
        submit() {
            const eventName = this.mode === 'create' ? 'create' : 'update';
            this.$emit(eventName, this.vmConfig);
        }
    },
    template: `
        <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
            <div class="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold">{{ modalTitle }}</h2>
                    <button @click="$emit('close')" class="text-gray-600 hover:text-gray-800">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- QEMU Status Indicators -->
                <div v-if="qemuCapabilities" class="mb-6">
                    <div class="flex flex-wrap gap-2">
                        <div class="text-sm px-3 py-1 rounded-full"
                             :class="qemuCapabilities.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                            QEMU {{ qemuCapabilities.version?.replace('QEMU ', '') || 'Not Available' }}
                        </div>
                        <div v-for="feature in ['kvm', 'spice']" :key="feature"
                             class="text-sm px-3 py-1 rounded-full"
                             :class="getFeatureStatus(feature).available ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
                             :title="getFeatureStatus(feature).description">
                            {{ getFeatureStatus(feature).label }}
                        </div>
                    </div>
                </div>
                
                <form @submit.prevent="submit" class="space-y-4">
                    <!-- Basic VM Configuration -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Name</label>
                        <input v-model="vmConfig.name" type="text" required
                               :disabled="mode === 'edit'"
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                               :class="{'bg-gray-100': mode === 'edit'}">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Architecture</label>
                        <select v-model="vmConfig.arch" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="arch in updateArchitectureOptions()" 
                                    :key="arch" 
                                    :value="arch">{{ arch }}</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Machine Type</label>
                        <select v-model="vmConfig.machine" required
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option v-for="machine in getMachineTypes(vmConfig.arch)" 
                                    :key="machine" 
                                    :value="machine">{{ machine }}</option>
                        </select>
                    </div>

                    <!-- CPU Configuration -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700">CPU Model</label>
                        <div class="mt-1 flex space-x-2">
                            <select v-model="vmConfig.cpu" 
                                    class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="">Custom...</option>
                                <option v-for="model in getCPUModels(vmConfig.arch)" 
                                        :key="model" 
                                        :value="model">{{ model }}</option>
                            </select>
                            <input v-if="shouldShowCustomCPUInput(vmConfig.cpu, vmConfig.arch)"
                                   v-model="vmConfig.cpu" 
                                   type="text"
                                   placeholder="Custom CPU model"
                                   class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Cores</label>
                            <input v-model.number="vmConfig.cpu_cores" type="number" min="1"
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Threads per Core</label>
                            <input v-model.number="vmConfig.cpu_threads" type="number" min="1"
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>

                    <!-- Memory Configuration -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Memory (MB)</label>
                        <input v-model.number="vmConfig.memory" type="number" required
                               class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                    </div>

                    <!-- Network Configuration -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Network</label>
                        <div class="mt-1 space-y-2">
                            <select v-model="vmConfig.network_type"
                                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="user">User (NAT)</option>
                                <option value="bridge">Bridge</option>
                                <option value="none">None</option>
                            </select>
                            
                            <input v-if="vmConfig.network_type === 'bridge'"
                                   v-model="vmConfig.network_bridge"
                                   placeholder="Bridge device (e.g., virbr0)"
                                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>
                    </div>

                    <!-- RTC Configuration -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700">RTC Base</label>
                        <select v-model="vmConfig.rtc_base"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            <option value="utc">UTC</option>
                            <option value="localtime">Local Time</option>
                        </select>
                    </div>

                    <!-- Feature Toggles -->
                    <div class="flex items-center space-x-4">
                        <div class="flex items-center" :class="{'opacity-50': !qemuCapabilities?.has_kvm}">
                            <input v-model="vmConfig.enable_kvm" type="checkbox" 
                                   :disabled="!qemuCapabilities?.has_kvm"
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">
                                Enable KVM
                                <span v-if="!qemuCapabilities?.has_kvm" class="text-yellow-600">(not available)</span>
                            </label>
                        </div>
                        <div class="flex items-center">
                            <input v-model="vmConfig.headless" type="checkbox" 
                                   class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            <label class="ml-2 block text-sm text-gray-700">Headless Mode</label>
                        </div>
                    </div>

                    <!-- Display Configuration -->
                    <div v-if="!vmConfig.headless">
                        <label class="block text-sm font-medium text-gray-700">Display Type</label>
                        <div class="mt-1 space-x-4">
                            <label class="inline-flex items-center">
                                <input type="radio" v-model="vmConfig.display.type" value="vnc"
                                       class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                <span class="ml-2">VNC</span>
                            </label>
                            <label class="inline-flex items-center" :class="{'opacity-50': !qemuCapabilities?.has_spice}">
                                <input type="radio" v-model="vmConfig.display.type" value="spice"
                                       :disabled="!qemuCapabilities?.has_spice"
                                       class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                <span class="ml-2">SPICE</span>
                            </label>
                        </div>
                    </div>

                    <!-- Disk Configuration -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="block text-sm font-medium text-gray-700">Disks</label>
                            <button type="button" @click="addDisk"
                                    class="px-2 py-1 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-700">
                                Add Disk
                            </button>
                        </div>
                        <div v-for="(disk, index) in vmConfig.disks" :key="index" class="mb-4 p-4 border rounded-lg">
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Type</label>
                                    <select v-model="disk.type"
                                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="hdd">Hard Disk</option>
                                        <option value="cdrom">CD-ROM</option>
                                    </select>
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
                            </div>
                            <div class="mt-2">
                                <label class="block text-sm font-medium text-gray-700">Path</label>
                                <div class="mt-1 flex space-x-2">
                                    <input v-model="disk.path" type="text"
                                           class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                    <button type="button" @click="browseDisk(index)"
                                            class="px-3 py-2 text-sm text-white bg-gray-600 rounded hover:bg-gray-700">
                                        Browse
                                    </button>
                                </div>
                            </div>
                            <div class="mt-2 grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Format</label>
                                    <select v-model="disk.format"
                                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="qcow2">QCOW2</option>
                                        <option value="raw">Raw</option>
                                        <option value="iso">ISO</option>
                                    </select>
                                </div>
                                <div class="flex items-center mt-6">
                                    <input type="checkbox" v-model="disk.readonly"
                                           class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                    <label class="ml-2 block text-sm text-gray-700">Read Only</label>
                                </div>
                            </div>
                            <button type="button" @click="removeDisk(index)"
                                    class="mt-2 px-2 py-1 text-sm text-red-600 hover:text-red-800">
                                Remove Disk
                            </button>
                        </div>
                    </div>

                    <div class="flex justify-end space-x-3 mt-6">
                        <button type="button" @click="$emit('close')"
                                class="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                            Cancel
                        </button>
                        <button type="submit"
                                class="px-4 py-2 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                            {{ mode === 'create' ? 'Create VM' : 'Save Changes' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `
}); 