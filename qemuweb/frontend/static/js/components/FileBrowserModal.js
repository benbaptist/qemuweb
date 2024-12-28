Vue.component('file-browser-modal', {
    props: {
        show: {
            type: Boolean,
            required: true
        },
        currentPath: {
            type: String,
            default: '/'
        }
    },
    data() {
        return {
            loading: false,
            error: null,
            entries: [],
            path: '/',
            parentPath: null
        };
    },
    watch: {
        show(newVal) {
            if (newVal) {
                this.loadDirectory(this.currentPath);
            }
        }
    },
    methods: {
        async loadDirectory(path) {
            this.loading = true;
            this.error = null;
            try {
                const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
                if (!response.ok) {
                    throw new Error(`Failed to load directory: ${response.statusText}`);
                }
                const data = await response.json();
                this.entries = data.entries;
                this.path = data.current_path;
                this.parentPath = data.parent_path;
            } catch (error) {
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },
        selectEntry(entry) {
            if (entry.type === 'directory') {
                this.loadDirectory(entry.path);
            } else {
                this.$emit('select', entry.path);
                this.$emit('close');
            }
        },
        navigateUp() {
            if (this.parentPath) {
                this.loadDirectory(this.parentPath);
            }
        },
        openDirectory(directory) {
            this.currentPath = directory;
            this.loadDirectory(directory);
        }
    },
    template: `
        <div v-if="show" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <!-- Background overlay -->
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>

                <!-- Modal panel -->
                <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mt-3 text-center sm:mt-0 sm:text-left w-full">
                                <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                    File Browser
                                </h3>
                                
                                <!-- Current Path -->
                                <div class="mt-2 flex items-center space-x-2">
                                    <button v-if="parentPath" @click="navigateUp"
                                            class="inline-flex items-center px-2 py-1 border border-transparent text-sm font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
                                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                                        </svg>
                                        Up
                                    </button>
                                    <div class="text-sm text-gray-500 truncate flex-1">
                                        {{ path }}
                                    </div>
                                </div>

                                <!-- Error Message -->
                                <div v-if="error" class="mt-2 text-sm text-red-600">
                                    {{ error }}
                                </div>

                                <!-- Loading State -->
                                <div v-if="loading" class="mt-4 flex justify-center">
                                    <svg class="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>

                                <!-- Directory Contents -->
                                <div v-else class="mt-4 border border-gray-200 rounded-md overflow-hidden">
                                    <div class="divide-y divide-gray-200">
                                        <div v-for="entry in entries" :key="entry.path"
                                             @click="selectEntry(entry)"
                                             class="px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 cursor-pointer">
                                            <!-- Icon -->
                                            <div class="flex-shrink-0">
                                                <svg v-if="entry.type === 'directory'" class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                </svg>
                                                <svg v-else class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            
                                            <!-- Name and Size -->
                                            <div class="flex-1 min-w-0">
                                                <p class="text-sm font-medium text-gray-900 truncate">
                                                    {{ entry.name }}
                                                </p>
                                                <p v-if="entry.type === 'file'" class="text-sm text-gray-500">
                                                    {{ (entry.size / 1024 / 1024).toFixed(2) }} MB
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Modal Footer -->
                    <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button @click="$emit('close')" type="button"
                                class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    mounted() {
        console.log('FileBrowserModal mounted and ready to listen for events');
        this.$on('browse-disk', (index, parentDir) => {
            console.log(`Browse disk event received for index ${index}, parentDir: ${parentDir}`);
            this.openDirectory(parentDir);
        });
    }
}); 