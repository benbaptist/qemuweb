Vue.component('status-page', {
    props: {
        qemuCapabilities: {
            type: Object,
            required: true
        },
        systemInfo: {
            type: Object,
            required: true
        }
    },
    template: `
        <div class="space-y-6">
            <div class="bg-white shadow rounded-lg">
                <div class="px-6 py-5 border-b border-gray-200">
                    <h2 class="text-lg font-medium text-gray-900">QEMU Information</h2>
                </div>
                <div class="px-6 py-5">
                    <dl class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">QEMU Version</dt>
                            <dd class="mt-1 text-3xl font-semibold text-gray-900">{{ qemuCapabilities.version }}</dd>
                        </div>

                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">KVM Support</dt>
                            <dd class="mt-1">
                                <span :class="qemuCapabilities.has_kvm ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
                                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium">
                                    {{ qemuCapabilities.has_kvm ? 'Available' : 'Not Available' }}
                                </span>
                            </dd>
                        </div>

                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">SPICE Support</dt>
                            <dd class="mt-1">
                                <span :class="qemuCapabilities.has_spice ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
                                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium">
                                    {{ qemuCapabilities.has_spice ? 'Available' : 'Not Available' }}
                                </span>
                            </dd>
                        </div>
                    </dl>
                </div>

                <div class="px-6 py-5 border-t border-gray-200">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Supported Architectures</h3>
                    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        <div v-for="arch in qemuCapabilities.architectures" :key="arch"
                             class="bg-gray-50 px-4 py-2 rounded-lg text-sm">
                            {{ arch }}
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white shadow rounded-lg">
                <div class="px-6 py-5 border-b border-gray-200">
                    <h2 class="text-lg font-medium text-gray-900">System Information</h2>
                </div>
                <div class="px-6 py-5">
                    <dl class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">Operating System</dt>
                            <dd class="mt-1 text-lg font-semibold text-gray-900">{{ systemInfo.os_name }} {{ systemInfo.os_version }}</dd>
                        </div>

                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">CPU</dt>
                            <dd class="mt-1 text-lg font-semibold text-gray-900">
                                {{ systemInfo.cpu_count }} Core<template v-if="systemInfo.cpu_count !== 1">s</template>
                            </dd>
                        </div>

                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">Memory</dt>
                            <dd class="mt-1 text-lg font-semibold text-gray-900">{{ (systemInfo.memory_total / 1024).toFixed(1) }} GB</dd>
                        </div>

                        <div class="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
                            <dt class="text-sm font-medium text-gray-500 truncate">Python Version</dt>
                            <dd class="mt-1 text-lg font-semibold text-gray-900">{{ systemInfo.python_version }}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    `
}); 