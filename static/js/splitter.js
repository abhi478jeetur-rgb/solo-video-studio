// Video Splitter Module with Instant Preview Gallery
class VideoSplitter {
    constructor() {
        this.form = document.getElementById('splitter-form');
        this.inputEl = document.getElementById('split_input');
        this.outputEl = document.getElementById('split_output');
        this.rangeEl = document.getElementById('split_duration_range');
        this.valEl = document.getElementById('split_duration_val');
        this.prefixEl = document.getElementById('split_prefix');
        this.qualityEl = document.getElementById('split_quality');
        this.submitBtn = document.getElementById('splitter-submit-btn');
        this.btnText = document.getElementById('splitter-btn-text');
        this.btnLoader = document.getElementById('splitter-btn-loader');

        this.previewSection = document.getElementById('splitter-preview-section');
        this.clipsGrid = document.getElementById('splitter-clips-grid');
        this.clipsBadge = document.getElementById('splitter-clips-count-badge');

        this.init();
    }

    init() {
        if (!this.form) return;

        // Sync duration slider
        this.rangeEl.addEventListener('input', (e) => {
            this.valEl.textContent = `${e.target.value}s`;
            this.refreshInfo();
        });

        this.inputEl.addEventListener('change', () => this.refreshInfo());
        this.outputEl.addEventListener('change', () => this.loadClipsPreview());

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.executeSplit();
        });

        // Initial queries
        this.refreshInfo();
        this.loadClipsPreview();
    }

    async refreshInfo() {
        const inputFolder = this.inputEl.value.trim();
        const duration = parseFloat(this.rangeEl.value) || 10;

        const infoText = document.getElementById('splitter-info-text');
        const infoCount = document.getElementById('splitter-info-count');
        const infoSize = document.getElementById('splitter-info-size');
        const infoParts = document.getElementById('splitter-info-parts');

        if (!inputFolder) {
            if (infoText) infoText.textContent = "Specify input folder to preview clips";
            return;
        }

        try {
            const res = await fetch('/api/splitter/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input_folder: inputFolder, duration: duration })
            });
            const data = await res.json();

            if (data.success) {
                if (infoCount) infoCount.textContent = data.count;
                if (infoSize) infoSize.textContent = data.total_size;
                if (infoParts) infoParts.textContent = `~${data.parts}`;
                if (infoText) infoText.textContent = data.count > 0 ? `Ready to split ${data.count} file(s)` : "No video files in this folder";
            } else {
                if (infoText) infoText.textContent = data.message || "Could not read folder";
            }
        } catch (e) {
            if (infoText) infoText.textContent = "Server connection error";
        }
    }

    async loadClipsPreview() {
        const outputFolder = this.outputEl.value.trim();
        if (!outputFolder) return;

        try {
            const res = await fetch(`/api/splitter/clips?output_folder=${encodeURIComponent(outputFolder)}`);
            const data = await res.json();
            if (data.success && data.clips && data.clips.length > 0) {
                this.renderClipsGrid(data.clips);
            }
        } catch (e) {
            // Silently ignore
        }
    }

    renderClipsGrid(clips) {
        if (!this.previewSection || !this.clipsGrid) return;

        if (!clips || clips.length === 0) {
            this.previewSection.classList.add('hidden');
            return;
        }

        this.previewSection.classList.remove('hidden');
        if (this.clipsBadge) this.clipsBadge.textContent = `${clips.length} Clips`;

        this.clipsGrid.innerHTML = clips.map((clip, idx) => `
            <div class="group bg-[#FAF4ED] hover:bg-white rounded-2xl p-3 border border-[#E5DCD0] hover:border-[#E95722] shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div class="flex items-start gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-[#E95722]/10 group-hover:bg-[#E95722] text-[#E95722] group-hover:text-white flex items-center justify-center flex-shrink-0 transition">
                        <i data-lucide="play" class="w-4 h-4 ml-0.5"></i>
                    </div>
                    <div class="overflow-hidden flex-1">
                        <div class="text-xs font-bold text-[#111111] truncate group-hover:text-[#E95722] transition" title="${clip.name}">${clip.name}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] font-mono font-semibold text-[#E95722] bg-white group-hover:bg-[#FAF4ED] px-1.5 py-0.5 rounded border border-[#E5DCD0]">${clip.duration || '10s'}</span>
                            <span class="text-[10px] font-mono text-[#777777]">${clip.size}</span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-[#E5DCD0]/60">
                    <button type="button" onclick="window.openVideoModal('${clip.stream_url}', '${clip.name}', '${clip.size}', '${clip.download_url}')" class="btn-solo-primary flex-1 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1">
                        <i data-lucide="play" class="w-3 h-3"></i>
                        <span>Preview</span>
                    </button>
                    <a href="${clip.download_url}" download class="p-1.5 rounded-xl border border-[#E5DCD0] text-[#777777] hover:text-[#E95722] hover:bg-white transition" title="Download Clip">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    </a>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    async executeSplit() {
        const duration = parseFloat(this.rangeEl.value);
        const prefix = this.prefixEl.value.trim() || 'Clip';
        const inputFolder = this.inputEl.value.trim();
        const outputFolder = this.outputEl.value.trim();
        const compression = this.qualityEl.value;

        if (!inputFolder) {
            window.showToast("Please specify an input folder.", "warning");
            return;
        }

        this.setLoading(true);

        try {
            const res = await fetch('/api/splitter/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration,
                    prefix,
                    input_folder: inputFolder,
                    output_folder: outputFolder,
                    compression
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                window.showOutputCard('Split Completed Successfully', data.message, 'success', [
                    { label: 'Browse Output Folder', action: () => window.fsExplorer.open(null, 'folder', 'Output Folder') }
                ]);
                window.showToast("All video clips split successfully!", "success");

                if (data.clips && data.clips.length > 0) {
                    this.renderClipsGrid(data.clips);
                    this.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                window.showOutputCard('Splitting Failed', data.message || 'An error occurred during video splitting', 'error', null, data.details);
                window.showToast(data.message || "Failed to split videos", "error");
            }
        } catch (e) {
            window.showOutputCard('Network Error', e.toString(), 'error');
            window.showToast("Could not communicate with the server", "error");
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        if (loading) {
            this.submitBtn.disabled = true;
            this.submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Splitting videos into clips, please wait...";
            this.btnLoader.classList.remove('hidden');
        } else {
            this.submitBtn.disabled = false;
            this.submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Split All Videos";
            this.btnLoader.classList.add('hidden');
        }
    }
}
