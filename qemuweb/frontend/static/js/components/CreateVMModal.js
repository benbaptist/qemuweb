Vue.component('create-vm-modal', {
    props: ['show', 'qemuCapabilities', 'vmData'],
    data() {
        return {
            saneDefaults: {
                'aarch64': { machine: 'virt', cpu: 'max', fallback_cpu: 'cortex-a72' },
                'arm': { machine: 'virt', cpu: 'cortex-a15' },
                'i386': { machine: 'q35', cpu: 'qemu32' },
                'x86_64': { machine: 'q35', cpu: 'host', fallback_cpu: 'max' },
                'riscv64': { machine: 'virt', cpu: 'sifive-u54' },
                'ppc64': { machine: 'pseries', cpu: 'POWER9' },
            },
            newVM: {
                name: this.vmData?.name || '',
                arch: this.vmData?.arch || '',
                cpu: this.vmData?.cpu || '',
                cpu_cores: this.vmData?.cpu_cores || 1,
                cpu_threads: this.vmData?.cpu_threads || 1,
                memory: this.vmData?.memory || 1024,
                network_type: this.vmData?.network_type || 'user',
                network_bridge: this.vmData?.network_bridge || '',
                rtc_base: this.vmData?.rtc_base || 'utc',
                enable_kvm: this.vmData?.enable_kvm || false,
                headless: this.vmData?.headless || false,
                display: {
                    type: this.vmData?.display?.type || 
                          (this.qemuCapabilities?.has_spice ? 'spice' : 'vnc'),
                    relative_mouse: this.vmData?.display?.relative_mouse || true
                },
                machine: this.vmData?.machine || '',
                disks: this.vmData?.disks || []
            }
        }
    },
    mounted() {
        if (this.qemuCapabilities?.has_kvm) {
            this.newVM.enable_kvm = true;
        }
    },
    watch: {
        'newVM.arch': function(newArch, oldArch) {
            if (newArch === oldArch || !this.qemuCapabilities) return;

            const defaults = this.saneDefaults[newArch];
            if (defaults) {
                const machineTypes = this.getMachineTypes(newArch);
                if (machineTypes.includes(defaults.machine)) {
                    this.newVM.machine = defaults.machine;
                } else if (machineTypes.length > 0) {
                    this.newVM.machine = machineTypes[0];
                }

                const cpuModels = this.getCPUModels(newArch);
                if (defaults.cpu === 'host' && cpuModels.includes('host')) {
                    this.newVM.cpu = 'host';
                } else if (defaults.cpu === 'host' && defaults.fallback_cpu && cpuModels.includes(defaults.fallback_cpu)) {
                    this.newVM.cpu = defaults.fallback_cpu;
                } else if (cpuModels.includes(defaults.cpu)) {
                    this.newVM.cpu = defaults.cpu;
                } else if (cpuModels.length > 0) {
                    this.newVM.cpu = cpuModels[0];
                }
            } else {
                const machineTypes = this.getMachineTypes(newArch);
                if (machineTypes.length > 0) {
                    this.newVM.machine = machineTypes[0];
                }
                const cpuModels = this.getCPUModels(newArch);
                if (cpuModels.length > 0) {
                    this.newVM.cpu = cpuModels[0];
                }
            }
        },
        qemuCapabilities: {
            immediate: true,
            handler(newCaps) {
                if (newCaps) {
                    if (!newCaps.has_kvm) {
                        this.newVM.enable_kvm = false;
                    }
                    if (!newCaps.has_spice && this.newVM.display.type === 'spice') {
                        this.newVM.display.type = 'vnc';
                    }
                }
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
            
            return Array.from(models).sort();
        },
        getMachineTypes(arch) {
            if (!this.qemuCapabilities || !arch) return [];
            return this.qemuCapabilities.machine_types?.[arch] || [];
        },
        shouldShowCustomCPUInput(cpu, arch) {
            return cpu === '';
        },
        addDisk() {
            this.newVM.disks.push({
                type: 'hdd',
                interface: 'virtio',
                path: '',
                format: 'qcow2',
                readonly: false
            });
        },
        removeDisk(index) {
            this.newVM.disks.splice(index, 1);
        },
        browseDisk(index) {
            const diskPath = this.newVM.disks[index].path;
            console.log(`Browsing disk at index ${index}, path: ${diskPath}`);
            const parentDir = diskPath ? diskPath.substring(0, diskPath.lastIndexOf('/')) : '';
            this.$emit('browse-disk', index, parentDir);
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
        createVM() {
            this.$emit('create', this.newVM);
        },
        updateVM() {
            this.$emit('update', this.newVM);
        }
    },
    template: `
        <teleport to="body">
            <div v-if="show" class="fixed inset-0 bg-gray-600 bg-opacity-50 w-full flex items-center justify-center">
                <div class="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl" style="max-height: 80vh; overflow-y: auto;">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold">{{ vmData ? 'Edit VM' : 'Create New VM' }}</h2>
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
                    
                    <form @submit.prevent="vmData ? updateVM() : createVM()" class="space-y-4">
                        <!-- Basic VM Configuration -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Name</label>
                            <input v-model="newVM.name" type="text" required
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">Architecture</label>
                            <select v-model="newVM.arch" required
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option v-for="arch in updateArchitectureOptions()" 
                                        :key="arch" 
                                        :value="arch">{{ arch }}</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">Machine Type</label>
                            <select v-model="newVM.machine" required
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option v-for="machine in getMachineTypes(newVM.arch)" 
                                        :key="machine" 
                                        :value="machine">{{ machine }}</option>
                            </select>
                        </div>

                        <!-- CPU Configuration -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPU Model</label>
                            <div class="mt-1 flex space-x-2">
                                <select v-model="newVM.cpu" 
                                        class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                    <option value="">Custom...</option>
                                    <option v-for="model in getCPUModels(newVM.arch)" 
                                            :key="model" 
                                            :value="model">{{ model }}</option>
                                </select>
                                <input v-if="shouldShowCustomCPUInput(newVM.cpu, newVM.arch)"
                                       v-model="newVM.cpu" 
                                       type="text"
                                       placeholder="Custom CPU model"
                                       class="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">CPU Cores</label>
                                <input v-model.number="newVM.cpu_cores" type="number" min="1"
                                       class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">CPU Threads per Core</label>
                                <input v-model.number="newVM.cpu_threads" type="number" min="1"
                                       class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            </div>
                        </div>

                        <!-- Memory Configuration -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Memory (MB)</label>
                            <input v-model.number="newVM.memory" type="number" required
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        </div>

                        <!-- Network Configuration -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Network</label>
                            <div class="mt-1 space-y-2">
                                <select v-model="newVM.network_type"
                                        class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                    <option value="user">User (NAT)</option>
                                    <option value="bridge">Bridge</option>
                                    <option value="none">None</option>
                                </select>
                                
                                <input v-if="newVM.network_type === 'bridge'"
                                       v-model="newVM.network_bridge"
                                       placeholder="Bridge device (e.g., virbr0)"
                                       class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                            </div>
                        </div>

                        <!-- RTC Configuration -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700">RTC Base</label>
                            <select v-model="newVM.rtc_base"
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                <option value="utc">UTC</option>
                                <option value="localtime">Local Time</option>
                            </select>
                        </div>

                        <!-- Feature Toggles -->
                        <div class="flex items-center space-x-4">
                            <div class="flex items-center" :class="{'opacity-50': !qemuCapabilities?.has_kvm}">
                                <input v-model="newVM.enable_kvm" type="checkbox" 
                                       :disabled="!qemuCapabilities?.has_kvm"
                                       class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                <label class="ml-2 block text-sm text-gray-700">
                                    Enable KVM
                                    <span v-if="!qemuCapabilities?.has_kvm" class="text-yellow-600">(not available)</span>
                                </label>
                            </div>
                            <div class="flex items-center">
                                <input v-model="newVM.headless" type="checkbox" 
                                       class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                <label class="ml-2 block text-sm text-gray-700">Headless Mode</label>
                            </div>
                        </div>

                        <!-- Display Configuration -->
                        <div class="border rounded-lg p-4">
                            <h3 class="text-lg font-medium">Display Configuration</h3>
                            <div class="flex items-center space-x-4">
                                <div class="flex items-center">
                                    <input v-model="newVM.display.type" type="radio" value="spice"
                                           :disabled="!qemuCapabilities?.has_spice"
                                           class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                    <label class="ml-2 block text-sm text-gray-700">
                                        SPICE
                                        <span v-if="!qemuCapabilities?.has_spice" class="text-yellow-600">(not available)</span>
                                    </label>
                                </div>
                                <div class="flex items-center">
                                    <input v-model="newVM.display.type" type="radio" value="vnc"
                                           class="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                    <label class="ml-2 block text-sm text-gray-700">VNC</label>
                                </div>
                            </div>
                            <div class="flex items-center mt-4">
                                <input v-model="newVM.display.relative_mouse" type="checkbox" 
                                       class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                <label class="ml-2 block text-sm text-gray-700">Use Relative Mouse</label>
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
                            
                            <div v-for="(disk, index) in newVM.disks" :key="index" class="border rounded-lg p-4">
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
                                            <button type="button" @click="browseDisk(index)"
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

                        <!-- Submit Button -->
                        <div class="flex justify-end">
                            <button type="submit" 
                                    class="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700">
                                {{ vmData ? 'Save Changes' : 'Create VM' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>
    `
}); 