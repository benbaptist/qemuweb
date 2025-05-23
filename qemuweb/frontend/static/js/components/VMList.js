Vue.component('vm-list', {
    props: {
        vms: {
            type: Array,
            required: true
        },
        vmStates: {
            type: Object,
            required: true
        },
        selectedVM: {
            type: String,
            default: null
        }
    },
    methods: {
        getVMState(vmName) {
            return this.vmStates[vmName] || 'unknown';
        },
        selectVM(vmName) {
            this.$emit('select', vmName);
        },
        startVM(vmName) {
            this.$emit('start', vmName);
        },
        stopVM(vmName) {
            this.$emit('stop', vmName);
        },
        deleteVM(vmName) {
            this.$emit('delete', vmName);
        }
    },
    template: `
        <div class="bg-white shadow rounded-lg">
            <div class="px-4 py-5 border-b border-gray-200 sm:px-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">
                        Virtual Machines
                    </h3>
                    <button @click="$emit('create')"
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        Create VM
                    </button>
                </div>
            </div>
            <ul class="divide-y divide-gray-200">
                <li v-for="vm in vms" :key="vm.name" 
                    class="px-4 py-4 hover:bg-gray-50 cursor-pointer"
                    :class="{'bg-indigo-50': selectedVM === vm.name}"
                    @click="selectVM(vm.name)">
                    <div class="flex items-center justify-between space-x-2 min-w-0">
                        <div class="flex items-center min-w-0">
                            <div class="flex-shrink-0">
                                <div class="h-3 w-3 rounded-full"
                                     :class="{
                                         'bg-green-400': getVMState(vm.name) === 'running',
                                         'bg-gray-400': getVMState(vm.name) === 'stopped',
                                         'bg-yellow-400': getVMState(vm.name) === 'paused',
                                         'bg-red-400': getVMState(vm.name) === 'error',
                                         'bg-gray-300': getVMState(vm.name) === 'unknown'
                                     }">
                                </div>
                            </div>
                            <div class="ml-4 min-w-0">
                                <div class="text-sm font-medium text-gray-900 truncate">
                                    {{ vm.name }}
                                </div>
                                <div class="text-sm text-gray-500 truncate">
                                    <template v-if="getVMState(vm.name) === 'running'">
                                        <template v-if="vm.cpu_usage">
                                            {{ vm.cpu_usage.toFixed(1) }}% CPU Usage
                                        </template>
                                        <template v-if="vm.memory_usage">
                                            • {{ vm.memory_usage }} MB Memory Usage
                                        </template>
                                    </template>
                                </div>
                            </div>
                        </div>
                        <div class="flex-shrink-0 flex space-x-2 overflow-hidden">
                            <button v-if="getVMState(vm.name) !== 'running'"
                                    @click.stop="startVM(vm.name)"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Start
                            </button>
                            <button v-else
                                    @click.stop="stopVM(vm.name)"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                                Stop
                            </button>
                        </div>
                    </div>
                </li>
                <li v-if="vms.length === 0" class="px-4 py-4 text-center text-gray-500">
                    No virtual machines found
                </li>
            </ul>
        </div>
    `
}); 