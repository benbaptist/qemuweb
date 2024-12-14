Vue.component('vm-logs', {
    props: {
        vmName: {
            type: String,
            required: true
        },
        vmState: {
            type: String,
            required: true
        },
        logs: {
            type: Array,
            default: () => []
        }
    },
    methods: {
        refresh() {
            this.$emit('refresh');
        }
    },
    template: `
        <div class="bg-white p-6 rounded-lg shadow-md">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium">VM Logs</h3>
                <button v-if="vmState === 'running'" 
                        @click="refresh"
                        class="text-indigo-600 hover:text-indigo-700">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>
            
            <div v-if="logs && logs.length > 0" 
                 class="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-auto max-h-96">
                <div v-for="(line, index) in logs" 
                     :key="index" 
                     class="whitespace-pre-wrap">{{ line }}</div>
            </div>
            <div v-else class="text-gray-500 text-center py-4">
                No logs available{{ vmState === 'running' ? ' yet' : '' }}
            </div>
        </div>
    `
}); 