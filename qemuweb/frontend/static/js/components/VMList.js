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
                <h3 class="text-lg leading-6 font-medium text-gray-900">
                    Virtual Machines
                </h3>
            </div>
            <ul class="divide-y divide-gray-200">
                <li v-for="vm in vms" :key="vm.name" 
                    class="px-4 py-4 hover:bg-gray-50 cursor-pointer"
                    :class="{'bg-indigo-50': selectedVM === vm.name}"
                    @click="selectVM(vm.name)">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <div class="h-3 w-3 rounded-full"
                                     :class="{
                                         'bg-green-400': getVMState(vm.name) === 'running',
                                         'bg-red-400': getVMState(vm.name) === 'stopped',
                                         'bg-yellow-400': getVMState(vm.name) === 'paused',
                                         'bg-gray-400': getVMState(vm.name) === 'unknown'
                                     }">
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900">
                                    {{ vm.name }}
                                </div>
                                <div class="text-sm text-gray-500">
                                    {{ vm.arch }} | {{ vm.cpu_cores }} cores | {{ vm.memory }}MB
                                </div>
                            </div>
                        </div>
                        <div class="flex space-x-2">
                            <button v-if="getVMState(vm.name) !== 'running'"
                                    @click.stop="startVM(vm.name)"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Start
                            </button>
                            <button v-else
                                    @click.stop="stopVM(vm.name)"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                                Stop
                            </button>
                            <button @click.stop="deleteVM(vm.name)"
                                    class="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                Delete
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