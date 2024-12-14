class VMManager {
    constructor() {
        this.vms = new Map();
        this.selectedVM = null;
        this.capabilities = null;
        this.fetchCapabilities();
    }

    async fetchCapabilities() {
        try {
            const response = await fetch('/api/qemu/capabilities');
            this.capabilities = await response.json();
            this.updateArchitectureSelect();
        } catch (error) {
            console.error('Failed to fetch QEMU capabilities:', error);
        }
    }

    async loadVMs() {
        try {
            const response = await fetch('/api/vms');
            const vms = await response.json();
            this.vms.clear();
            vms.forEach(vm => this.vms.set(vm.name, vm));
            this.updateVMList();
        } catch (error) {
            console.error('Failed to load VMs:', error);
        }
    }

    async createVM(config) {
        try {
            const response = await fetch('/api/vms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (response.ok) {
                await this.loadVMs();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to create VM:', error);
            return false;
        }
    }

    async deleteVM(name) {
        try {
            const response = await fetch(`/api/vms/${name}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                this.vms.delete(name);
                this.updateVMList();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to delete VM:', error);
            return false;
        }
    }

    async startVM(name) {
        try {
            const response = await fetch(`/api/vms/${name}/start`, {
                method: 'POST'
            });
            return response.ok;
        } catch (error) {
            console.error('Failed to start VM:', error);
            return false;
        }
    }

    async stopVM(name) {
        try {
            const response = await fetch(`/api/vms/${name}/stop`, {
                method: 'POST'
            });
            return response.ok;
        } catch (error) {
            console.error('Failed to stop VM:', error);
            return false;
        }
    }

    async updateVM(name, config) {
        try {
            const response = await fetch(`/api/vms/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (response.ok) {
                await this.loadVMs();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update VM:', error);
            return false;
        }
    }

    updateVMList() {
        const vmList = document.getElementById('vm-list');
        vmList.innerHTML = '';
        
        this.vms.forEach((vm, name) => {
            const li = document.createElement('li');
            li.textContent = name;
            li.onclick = () => this.selectVM(name);
            if (this.selectedVM === name) {
                li.classList.add('selected');
            }
            vmList.appendChild(li);
        });
    }

    selectVM(name) {
        this.selectedVM = name;
        this.updateVMList();
        const vm = this.vms.get(name);
        if (vm) {
            this.updateVMDetails(vm);
        }
    }

    updateVMDetails(vm) {
        document.getElementById('vm-name').value = vm.name;
        document.getElementById('vm-memory').value = vm.memory;
        document.getElementById('vm-cpu-cores').value = vm.cpu_cores;
        document.getElementById('vm-arch').value = vm.arch;
        // Update other VM details...
    }

    updateArchitectureSelect() {
        if (!this.capabilities) return;
        
        const archSelect = document.getElementById('vm-arch');
        archSelect.innerHTML = '';
        
        this.capabilities.architectures.forEach(arch => {
            const option = document.createElement('option');
            option.value = arch;
            option.textContent = arch;
            archSelect.appendChild(option);
        });
    }
} 