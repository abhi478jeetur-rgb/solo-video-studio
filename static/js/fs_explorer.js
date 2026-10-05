// File System Explorer & Path Selection Module
class FileSystemExplorer {
    constructor() {
        this.targetInputId = null;
        this.selectionMode = 'folder'; // 'folder' or 'file'
        this.currentPath = '';
        this.parentPath = null;
        this.selectedItemPath = null;
        
        this.modal = document.getElementById('fs-modal');
        this.titleEl = document.getElementById('fs-modal-title');
        this.subtitleEl = document.getElementById('fs-modal-subtitle');
        this.itemsContainer = document.getElementById('fs-items-container');
        this.breadcrumbsEl = document.getElementById('fs-breadcrumbs');
        this.upBtn = document.getElementById('fs-up-btn');
        this.quickLocEl = document.getElementById('fs-quick-locations');
        this.drivesEl = document.getElementById('fs-drives');
        this.confirmBtnText = document.getElementById('fs-confirm-btn-text');
        
        this.init();
    }

    async init() {
        await this.loadQuickLocations();
        this.bindPathInputs();
    }

    async loadQuickLocations() {
        try {
            const res = await fetch('/api/fs/quick-locations');
            const data = await res.json();
            if (data.success) {
                // Populate Quick Locations
                this.quickLocEl.innerHTML = data.quick.map(loc => `
                    <button type="button" onclick="window.fsExplorer.navigate('${loc.path.replace(/\\/g, '\\\\')}')" class="px-2.5 py-1 rounded-lg bg-white border border-[#E5DCD0] hover:border-[#E95722] hover:text-[#E95722] transition text-[#111111] flex items-center gap-1">
                        <span>${loc.name}</span>
                    </button>
                `).join('');

                // Populate Drives
                this.drivesEl.innerHTML = data.drives.map(drive => `
                    <button type="button" onclick="window.fsExplorer.navigate('${drive.path.replace(/\\/g, '\\\\')}')" class="px-2 py-1 rounded-lg bg-white border border-[#E5DCD0] font-mono hover:border-[#E95722] hover:text-[#E95722] transition font-bold text-[#111111]">
                        ${drive.name.split('(')[1].replace(')', '')}
                    </button>
                `).join('');
            }
        } catch (e) {
            console.error('Failed to load quick locations', e);
        }
    }

    open(targetInputId, mode = 'folder', title = 'Select Location') {
        this.targetInputId = targetInputId;
        this.selectionMode = mode;
        this.selectedItemPath = null;

        this.titleEl.textContent = title;
        this.subtitleEl.textContent = mode === 'file' ? 'Choose a video file (*.mp4, *.mkv, *.mov)' : 'Choose a folder containing your videos';
        this.confirmBtnText.textContent = mode === 'file' ? 'Select This File' : 'Select This Folder';

        let startingPath = '';
        if (targetInputId) {
            const input = document.getElementById(targetInputId);
            if (input && input.value.trim()) {
                startingPath = input.value.trim();
            }
        }

        this.modal.classList.remove('hidden');
        this.navigate(startingPath);
    }

    close() {
        this.modal.classList.add('hidden');
    }

    async navigate(path) {
        this.itemsContainer.innerHTML = `
            <div class="flex items-center justify-center h-48 text-[#777777] text-xs gap-2">
                <i data-lucide="loader-2" class="w-5 h-5 animate-spin text-[#E95722]"></i>
                <span>Loading directory...</span>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        try {
            const url = `/api/fs/list?path=${encodeURIComponent(path || '')}&include_files=${this.selectionMode === 'file' ? 'true' : 'false'}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success) {
                this.itemsContainer.innerHTML = `
                    <div class="p-6 text-center text-xs text-rose-600 bg-rose-50 rounded-2xl border border-rose-200">
                        <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-1 text-rose-500"></i>
                        <p class="font-bold">Error Accessing Folder</p>
                        <p>${data.message}</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            this.currentPath = data.current_path;
            this.parentPath = data.parent_path;
            this.selectedItemPath = this.selectionMode === 'folder' ? this.currentPath : null;

            this.renderBreadcrumbs(this.currentPath);
            this.renderItems(data.directories, data.video_files);
        } catch (err) {
            this.itemsContainer.innerHTML = `<div class="p-4 text-center text-xs text-rose-600">Failed to connect to server.</div>`;
        }
    }

    renderBreadcrumbs(fullPath) {
        this.upBtn.disabled = !this.parentPath;
        const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
        let accumulated = '';

        let html = '';
        parts.forEach((p, idx) => {
            if (idx === 0 && p.includes(':')) {
                accumulated = p + '/';
            } else {
                accumulated += (accumulated.endsWith('/') ? '' : '/') + p;
            }
            const currentAcc = accumulated.replace(/\//g, '\\');
            const isLast = idx === parts.length - 1;

            html += `
                <button type="button" onclick="window.fsExplorer.navigate('${currentAcc.replace(/\\/g, '\\\\')}')" class="hover:text-[#E95722] hover:underline ${isLast ? 'font-bold text-[#E95722]' : 'text-[#777777]'}">
                    ${p}
                </button>
            `;
            if (!isLast) {
                html += `<span class="text-[#E5DCD0]">/</span>`;
            }
        });
        this.breadcrumbsEl.innerHTML = html;
    }

    renderItems(directories, videoFiles) {
        if (directories.length === 0 && (!videoFiles || videoFiles.length === 0)) {
            this.itemsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-48 text-[#777777] text-xs gap-1">
                    <i data-lucide="folder" class="w-8 h-8 text-[#E5DCD0]"></i>
                    <span>This folder is empty</span>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';

        // Folders
        directories.forEach(dir => {
            html += `
                <div onclick="window.fsExplorer.navigate('${dir.path.replace(/\\/g, '\\\\')}')" class="group flex items-center justify-between p-2.5 rounded-xl hover:bg-[#FAF4ED] cursor-pointer transition border border-transparent hover:border-[#E5DCD0]">
                    <div class="flex items-center gap-2.5">
                        <i data-lucide="folder" class="w-4 h-4 text-[#F28A5B] group-hover:text-[#E95722] transition"></i>
                        <span class="text-xs font-semibold text-[#111111] group-hover:text-[#E95722]">${dir.name}</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-[#777777] group-hover:translate-x-0.5 transition"></i>
                </div>
            `;
        });

        // Files (if in file selection mode)
        if (videoFiles && videoFiles.length > 0) {
            videoFiles.forEach(file => {
                const isSelected = this.selectedItemPath === file.path;
                const iconName = file.type === 'audio' ? 'mic' : (file.type === 'image' ? 'image' : 'video');
                html += `
                    <div onclick="window.fsExplorer.selectFile('${file.path.replace(/\\/g, '\\\\')}', this)" class="file-item flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition border ${isSelected ? 'bg-[#E95722]/10 border-[#E95722]' : 'hover:bg-[#FAF4ED] border-transparent hover:border-[#E5DCD0]'}">
                        <div class="flex items-center gap-2.5">
                            <i data-lucide="${iconName}" class="w-4 h-4 text-[#E95722]"></i>
                            <span class="text-xs font-semibold text-[#111111]">${file.name}</span>
                        </div>
                        <span class="text-[11px] font-mono text-[#777777] bg-white px-2 py-0.5 rounded-md border border-[#E5DCD0]">${file.size}</span>
                    </div>
                `;
            });
        }

        this.itemsContainer.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }

    selectFile(filePath, element) {
        this.selectedItemPath = filePath;
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('bg-[#E95722]/10', 'border-[#E95722]'));
        if (element) {
            element.classList.add('bg-[#E95722]/10', 'border-[#E95722]');
        }
    }

    goUp() {
        if (this.parentPath) {
            this.navigate(this.parentPath);
        }
    }

    refresh() {
        this.navigate(this.currentPath);
    }

    confirmSelection() {
        const pathToApply = this.selectionMode === 'file' ? this.selectedItemPath : this.currentPath;
        if (!pathToApply) {
            window.showToast('Please select a file first.', 'warning');
            return;
        }

        if (this.targetInputId) {
            this.setPathDirectly(this.targetInputId, pathToApply);
        }
        this.close();
    }

    async openNativeDialog() {
        const spinner = document.getElementById('fs-native-spinner');
        const btn = document.getElementById('fs-native-dialog-btn');
        spinner.classList.remove('hidden');
        btn.classList.add('opacity-50', 'pointer-events-none');

        try {
            const res = await fetch('/api/fs/native-browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: this.selectionMode,
                    initial_dir: this.currentPath
                })
            });
            const data = await res.json();
            if (data.success && data.path) {
                if (this.targetInputId) {
                    this.setPathDirectly(this.targetInputId, data.path);
                }
                this.close();
                window.showToast('Selected via Windows Explorer Dialog', 'success');
            } else if (data.message) {
                window.showToast(data.message, 'info');
            }
        } catch (e) {
            window.showToast('Native dialog request failed: ' + e.toString(), 'error');
        } finally {
            spinner.classList.add('hidden');
            btn.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    setPathDirectly(inputId, path) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = path;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            this.validatePath(input);
        }
    }

    bindPathInputs() {
        const inputs = [
            { id: 'split_input', type: 'folder' },
            { id: 'split_output', type: 'folder' },
            { id: 'bulk_input', type: 'folder' },
            { id: 'bulk_output', type: 'folder' },
            { id: 'story_video_file', type: 'file' },
            { id: 'story_output', type: 'folder' }
        ];

        inputs.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.addEventListener('blur', () => this.validatePath(el, item.type));
                el.addEventListener('change', () => this.validatePath(el, item.type));
                // Initial validation check
                if (el.value) {
                    this.validatePath(el, item.type);
                }
            }
        });
    }

    async validatePath(inputEl, type = 'folder') {
        const val = inputEl.value.trim();
        const statusEl = document.getElementById(`${inputEl.id}_status`);
        const feedbackEl = document.getElementById(`${inputEl.id}_feedback`);

        if (!val) {
            if (statusEl) statusEl.innerHTML = '';
            if (feedbackEl) feedbackEl.innerHTML = '';
            return;
        }

        try {
            const res = await fetch('/api/fs/check-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: val, type: type })
            });
            const data = await res.json();

            if (data.valid) {
                if (statusEl) {
                    statusEl.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500"></i>`;
                }
                if (feedbackEl) {
                    feedbackEl.className = 'text-xs text-emerald-600 font-medium flex items-center gap-1 mt-1';
                    feedbackEl.innerHTML = `<span>✓ ${data.message}</span>`;
                }
                // Trigger splitter info refresh if split_input changed
                if (inputEl.id === 'split_input' && window.splitter) {
                    window.splitter.refreshInfo();
                }
                // Trigger video preview if story_video_file changed
                if (inputEl.id === 'story_video_file' && window.storyboard) {
                    window.storyboard.loadVideo(val);
                }
            } else {
                if (statusEl) {
                    statusEl.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4 text-rose-500"></i>`;
                }
                if (feedbackEl) {
                    feedbackEl.className = 'text-xs text-rose-500 font-medium flex items-center gap-1 mt-1';
                    feedbackEl.innerHTML = `<span>⚠ ${data.message}</span>`;
                }
            }
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            // Silently ignore if offline
        }
    }
}
