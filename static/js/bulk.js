// Bulk Watermark Remover & Logo Editor Module with Live Progress, Video Preview & Interactive Video Canvas Delogo
class BulkEditor {
    constructor() {
        this.form = document.getElementById('bulk-form');
        this.inputEl = document.getElementById('bulk_input');
        this.outputEl = document.getElementById('bulk_output');
        this.logoInput = document.getElementById('bulk_logo_input');
        this.logoThumb = document.getElementById('logo-thumb');
        this.thumbContainer = document.getElementById('logo-thumb-container');
        this.logoBadge = document.getElementById('logo-preview-badge');
        this.submitBtn = document.getElementById('bulk-submit-btn');
        this.btnText = document.getElementById('bulk-btn-text');
        this.btnLoader = document.getElementById('bulk-btn-loader');

        // Progress Card Elements
        this.progressCard = document.getElementById('bulk-progress-card');
        this.progressTitle = document.getElementById('bulk-progress-title');
        this.progressDetail = document.getElementById('bulk-progress-detail');
        this.progressPercent = document.getElementById('bulk-progress-percent');
        this.progressBar = document.getElementById('bulk-progress-bar');
        this.progressStep = document.getElementById('bulk-progress-step');

        // Preview Section Elements
        this.previewSection = document.getElementById('bulk-preview-section');
        this.videosGrid = document.getElementById('bulk-videos-grid');
        this.videosBadge = document.getElementById('bulk-videos-count-badge');

        // Interactive Video Canvas Elements
        this.videoStudioPanel = document.getElementById('video-canvas-studio-panel');
        this.videoSelect = document.getElementById('video-canvas-select');
        this.videoScrubber = document.getElementById('video-timeline-scrubber');
        this.videoScrubberTime = document.getElementById('video-scrubber-time');
        this.videoBaseCanvas = document.getElementById('video-base-canvas');
        this.videoDrawCanvas = document.getElementById('video-draw-canvas');
        this.videoBaseCtx = this.videoBaseCanvas ? this.videoBaseCanvas.getContext('2d') : null;
        this.videoDrawCtx = this.videoDrawCanvas ? this.videoDrawCanvas.getContext('2d') : null;
        
        this.customDelogo = null; // { boxes: [{x, y, w, h}], time_start, time_end }
        this.currentVideoPath = null;
        this.currentVideoDuration = 0;
        this.videoIsDrawing = false;
        this.videoStartX = 0;
        this.videoStartY = 0;
        this.videoSelectedBox = null;

        this.pollTimer = null;

        this.init();
    }

    init() {
        if (!this.form) return;

        this.logoInput.addEventListener('change', (e) => this.handleLogoSelect(e));
        this.outputEl.addEventListener('change', () => this.loadVideosPreview());
        if (this.inputEl) {
            this.inputEl.addEventListener('change', () => this.populateVideoSelect());
        }

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.executeBulk();
        });

        this.setupVideoCanvasEvents();
        this.loadVideosPreview();
    }

    handleLogoSelect(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.logoThumb.src = event.target.result;
                this.thumbContainer.classList.remove('hidden');
                this.logoBadge.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    clearLogo() {
        this.logoInput.value = '';
        this.logoThumb.src = '';
        this.thumbContainer.classList.add('hidden');
        this.logoBadge.classList.add('hidden');
    }

    // --- Interactive Video Timeline & Canvas Studio Methods ---
    toggleVideoCanvasStudio() {
        if (!this.videoStudioPanel) return;
        const isHidden = this.videoStudioPanel.classList.contains('hidden');
        if (isHidden) {
            this.videoStudioPanel.classList.remove('hidden');
            this.populateVideoSelect();
        } else {
            this.videoStudioPanel.classList.add('hidden');
        }
    }

    async populateVideoSelect() {
        const inputFolder = this.inputEl.value.trim();
        if (!inputFolder || !this.videoSelect) return;

        try {
            const res = await fetch(`/api/fs/list?path=${encodeURIComponent(inputFolder)}`);
            const data = await res.json();
            if (data.success && data.items) {
                const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.webm'];
                const videos = data.items.filter(item => !item.is_dir && videoExts.some(ext => item.name.toLowerCase().endsWith(ext)));

                this.videoSelect.innerHTML = '<option value="">Select a video from input folder...</option>';
                videos.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.path;
                    opt.textContent = v.name;
                    this.videoSelect.appendChild(opt);
                });

                if (videos.length > 0 && !this.currentVideoPath) {
                    this.videoSelect.selectedIndex = 1;
                    this.loadVideoForCanvas(videos[0].path);
                }
            }
        } catch (e) {
            console.error('Failed to list videos for canvas:', e);
        }
    }

    async loadVideoForCanvas(videoPath) {
        if (!videoPath) return;
        this.currentVideoPath = videoPath;

        const empty = document.getElementById('video-canvas-empty');
        const wrapper = document.getElementById('video-canvas-wrapper');
        if (empty) empty.classList.add('hidden');
        if (wrapper) wrapper.classList.remove('hidden');

        // Fetch duration if possible
        try {
            const res = await fetch('/api/splitter/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: videoPath })
            });
            const info = await res.json();
            if (info.success && info.duration) {
                this.currentVideoDuration = parseFloat(info.duration);
                this.videoScrubber.max = this.currentVideoDuration;
            } else {
                this.videoScrubber.max = 60;
            }
        } catch (e) {
            this.videoScrubber.max = 60;
        }

        this.videoScrubber.value = 0;
        this.updateFrameAtTime(0);
    }

    formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    onScrubberChange(val) {
        const timeSec = parseFloat(val) || 0;
        if (this.videoScrubberTime) {
            this.videoScrubberTime.textContent = this.formatTime(timeSec);
        }
        this.updateFrameAtTime(timeSec);
    }

    stepVideoFrame(delta) {
        let cur = parseFloat(this.videoScrubber.value) || 0;
        cur = Math.max(0, Math.min(this.videoScrubber.max, cur + delta));
        this.videoScrubber.value = cur;
        this.onScrubberChange(cur);
    }

    updateFrameAtTime(timeSec) {
        if (!this.currentVideoPath) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.videoBaseCanvas.width = img.naturalWidth || img.width;
            this.videoBaseCanvas.height = img.naturalHeight || img.height;
            this.videoDrawCanvas.width = this.videoBaseCanvas.width;
            this.videoDrawCanvas.height = this.videoBaseCanvas.height;

            this.videoBaseCtx.clearRect(0, 0, this.videoBaseCanvas.width, this.videoBaseCanvas.height);
            this.videoBaseCtx.drawImage(img, 0, 0);

            this.redrawVideoBox();
        };
        img.src = `/api/preview/frame?path=${encodeURIComponent(this.currentVideoPath)}&t=${timeSec}&_r=${Date.now()}`;
    }

    setupVideoCanvasEvents() {
        if (!this.videoDrawCanvas) return;

        const getPos = (e) => {
            const rect = this.videoDrawCanvas.getBoundingClientRect();
            const scaleX = this.videoDrawCanvas.width / rect.width;
            const scaleY = this.videoDrawCanvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        this.videoDrawCanvas.addEventListener('mousedown', (e) => {
            if (!this.currentVideoPath) return;
            this.videoIsDrawing = true;
            const pos = getPos(e);
            this.videoStartX = pos.x;
            this.videoStartY = pos.y;
        });

        this.videoDrawCanvas.addEventListener('mousemove', (e) => {
            if (!this.videoIsDrawing) return;
            const pos = getPos(e);
            const w = pos.x - this.videoStartX;
            const h = pos.y - this.videoStartY;

            this.videoDrawCtx.clearRect(0, 0, this.videoDrawCanvas.width, this.videoDrawCanvas.height);
            this.videoDrawCtx.fillStyle = 'rgba(233, 87, 34, 0.4)';
            this.videoDrawCtx.strokeStyle = '#E95722';
            this.videoDrawCtx.lineWidth = 3;
            this.videoDrawCtx.fillRect(this.videoStartX, this.videoStartY, w, h);
            this.videoDrawCtx.strokeRect(this.videoStartX, this.videoStartY, w, h);
        });

        const stop = (e) => {
            if (!this.videoIsDrawing) return;
            this.videoIsDrawing = false;
            const pos = getPos(e);
            const x = Math.min(this.videoStartX, pos.x);
            const y = Math.min(this.videoStartY, pos.y);
            const w = Math.abs(pos.x - this.videoStartX);
            const h = Math.abs(pos.y - this.videoStartY);

            if (w > 6 && h > 6) {
                this.videoSelectedBox = {
                    x: (x / this.videoDrawCanvas.width) * 100,
                    y: (y / this.videoDrawCanvas.height) * 100,
                    w: (w / this.videoDrawCanvas.width) * 100,
                    h: (h / this.videoDrawCanvas.height) * 100
                };
                const statusEl = document.getElementById('video-canvas-coords-status');
                if (statusEl) {
                    statusEl.textContent = `Region Selected: X=${Math.round(this.videoSelectedBox.x)}%, Y=${Math.round(this.videoSelectedBox.y)}%, W=${Math.round(this.videoSelectedBox.w)}%, H=${Math.round(this.videoSelectedBox.h)}%`;
                }
            }
            this.redrawVideoBox();
        };

        this.videoDrawCanvas.addEventListener('mouseup', stop);
        this.videoDrawCanvas.addEventListener('mouseleave', stop);
    }

    redrawVideoBox() {
        if (!this.videoDrawCtx) return;
        this.videoDrawCtx.clearRect(0, 0, this.videoDrawCanvas.width, this.videoDrawCanvas.height);
        if (this.videoSelectedBox) {
            const x = (this.videoSelectedBox.x / 100) * this.videoDrawCanvas.width;
            const y = (this.videoSelectedBox.y / 100) * this.videoDrawCanvas.height;
            const w = (this.videoSelectedBox.w / 100) * this.videoDrawCanvas.width;
            const h = (this.videoSelectedBox.h / 100) * this.videoDrawCanvas.height;

            this.videoDrawCtx.fillStyle = 'rgba(233, 87, 34, 0.45)';
            this.videoDrawCtx.strokeStyle = '#E95722';
            this.videoDrawCtx.lineWidth = 3;
            this.videoDrawCtx.fillRect(x, y, w, h);
            this.videoDrawCtx.strokeRect(x, y, w, h);
        }
    }

    clearVideoCanvasBox() {
        this.videoSelectedBox = null;
        if (this.videoDrawCtx) {
            this.videoDrawCtx.clearRect(0, 0, this.videoDrawCanvas.width, this.videoDrawCanvas.height);
        }
        document.getElementById('video-canvas-coords-status').textContent = 'Click and drag a box directly on the frame to mark watermark';
    }

    applyVideoCanvasBox() {
        if (!this.videoSelectedBox) {
            window.showToast('Please drag a box over the watermark first', 'warning');
            return;
        }

        const tStart = document.getElementById('video-time-start').value.trim();
        const tEnd = document.getElementById('video-time-end').value.trim();

        this.customDelogo = {
            boxes: [this.videoSelectedBox],
            time_start: tStart !== '' ? parseFloat(tStart) : null,
            time_end: tEnd !== '' ? parseFloat(tEnd) : null
        };

        const badge = document.getElementById('video-custom-region-badge');
        const badgeText = document.getElementById('video-custom-region-text');
        badge.classList.remove('hidden');
        
        let timeDesc = 'Full Video';
        if (this.customDelogo.time_start !== null && this.customDelogo.time_end !== null) {
            timeDesc = `${this.customDelogo.time_start}s to ${this.customDelogo.time_end}s`;
        }
        badgeText.textContent = `Active Canvas Region: (${Math.round(this.videoSelectedBox.w)}%x${Math.round(this.videoSelectedBox.h)}%) • ${timeDesc}`;

        this.videoStudioPanel.classList.add('hidden');
        window.showToast('Custom video delogo region applied to bulk processing!', 'success');
    }

    clearVideoCustomRegion() {
        this.customDelogo = null;
        this.clearVideoCanvasBox();
        const badge = document.getElementById('video-custom-region-badge');
        if (badge) badge.classList.add('hidden');
        window.showToast('Custom video watermark region cleared', 'info');
    }

    // --- Bulk Processing Execution ---
    async loadVideosPreview() {
        const outputFolder = this.outputEl.value.trim();
        if (!outputFolder) return;

        try {
            const res = await fetch(`/api/bulk/videos?output_folder=${encodeURIComponent(outputFolder)}`);
            const data = await res.json();
            if (data.success && data.videos && data.videos.length > 0) {
                this.renderVideosGrid(data.videos);
            }
        } catch (e) {}
    }

    renderVideosGrid(videos) {
        if (!this.previewSection || !this.videosGrid) return;

        if (!videos || videos.length === 0) {
            this.previewSection.classList.add('hidden');
            return;
        }

        this.previewSection.classList.remove('hidden');
        if (this.videosBadge) this.videosBadge.textContent = `${videos.length} Videos`;

        this.videosGrid.innerHTML = videos.map(v => `
            <div class="group bg-[#FAF4ED] hover:bg-white rounded-2xl p-3 border border-[#E5DCD0] hover:border-[#E95722] shadow-sm transition-all duration-200 flex flex-col justify-between">
                <div class="flex items-start gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-[#E95722]/10 group-hover:bg-[#E95722] text-[#E95722] group-hover:text-white flex items-center justify-center flex-shrink-0 transition">
                        <i data-lucide="video" class="w-4 h-4"></i>
                    </div>
                    <div class="overflow-hidden flex-1">
                        <p class="text-xs font-bold text-[#111111] truncate" title="${v.name}">${v.name}</p>
                        <span class="text-[10px] text-[#777777] font-semibold">${v.size}</span>
                    </div>
                </div>
                <div class="mt-3 flex items-center gap-1.5 pt-2 border-t border-[#E5DCD0]/60">
                    <button type="button" onclick="window.openVideoModal('${v.stream_url}', '${v.name}', '${v.size}', '${v.download_url}')" class="flex-1 btn-solo-secondary py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1">
                        <i data-lucide="play" class="w-3 h-3 text-[#E95722]"></i>
                        <span>Preview</span>
                    </button>
                    <a href="${v.download_url}" download="${v.name}" class="p-1.5 rounded-xl border border-[#E5DCD0] hover:bg-white text-[#111111] transition" title="Download">
                        <i data-lucide="download" class="w-3.5 h-3.5 text-[#777777]"></i>
                    </a>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    async executeBulk() {
        const inputFolder = this.inputEl.value.trim();
        const outputFolder = this.outputEl.value.trim();

        if (!inputFolder) {
            window.showToast("Please provide an input folder", "warning");
            return;
        }

        const formData = new FormData(this.form);
        if (this.customDelogo) {
            formData.append('custom_delogo', JSON.stringify(this.customDelogo));
        }

        this.setLoading(true);
        this.showProgress(true, 0, "Starting batch process...");

        try {
            const res = await fetch('/api/bulk/start', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success && data.job_id) {
                this.pollJobProgress(data.job_id);
            } else {
                this.setLoading(false);
                this.showProgress(false);
                window.showOutputCard('Batch Submission Error', data.message || 'Failed to start batch processing', 'error');
                window.showToast(data.message || 'Failed to start job', 'error');
            }
        } catch (e) {
            this.setLoading(false);
            this.showProgress(false);
            window.showOutputCard('Connection Error', e.toString(), 'error');
            window.showToast("Could not communicate with the server", "error");
        }
    }

    pollJobProgress(jobId) {
        if (this.pollTimer) clearInterval(this.pollTimer);

        this.pollTimer = setInterval(async () => {
            try {
                const res = await fetch(`/api/bulk/status/${jobId}`);
                const data = await res.json();

                if (!data.success) {
                    clearInterval(this.pollTimer);
                    this.setLoading(false);
                    return;
                }

                // Update Progress UI
                const percent = Math.min(100, Math.max(0, data.percent || 0));
                this.progressBar.style.width = `${percent}%`;
                this.progressPercent.textContent = `${percent}%`;

                if (data.current_file) {
                    this.progressDetail.textContent = `Processing: ${data.current_file}`;
                }
                this.progressStep.textContent = `Video ${data.current_index || 0} of ${data.total || 0}`;

                if (data.completed_files && data.completed_files.length > 0) {
                    this.renderVideosGrid(data.completed_files);
                }

                if (data.status === 'completed') {
                    clearInterval(this.pollTimer);
                    this.setLoading(false);
                    this.progressBar.style.width = `100%`;
                    this.progressPercent.textContent = `100%`;
                    this.progressDetail.textContent = data.message || "All videos processed successfully!";
                    window.showToast(data.message || "Bulk processing completed!", "success");
                    window.showOutputCard('Bulk Processing Finished', data.message, 'success', [
                        { label: 'Browse Output Folder', action: () => window.fsExplorer.open(null, 'folder', 'Output Folder') }
                    ]);
                    this.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else if (data.status === 'failed') {
                    clearInterval(this.pollTimer);
                    this.setLoading(false);
                    const errorText = (data.errors && data.errors.length) ? data.errors.map(e => e.error).join("\n") : "Processing failed";
                    window.showOutputCard('Bulk Processing Failed', "Errors occurred while processing videos", 'error', null, errorText);
                    window.showToast("Processing encountered errors", "error");
                }
            } catch (err) {}
        }, 800);
    }

    showProgress(visible, initialPercent = 0, initialText = '') {
        if (!this.progressCard) return;
        if (visible) {
            this.progressCard.classList.remove('hidden');
            this.progressBar.style.width = `${initialPercent}%`;
            this.progressPercent.textContent = `${initialPercent}%`;
            if (initialText) this.progressDetail.textContent = initialText;
        } else {
            this.progressCard.classList.add('hidden');
        }
    }

    setLoading(loading) {
        if (loading) {
            this.submitBtn.disabled = true;
            this.submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Processing batch videos...";
            this.btnLoader.classList.remove('hidden');
        } else {
            this.submitBtn.disabled = false;
            this.submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Process Bulk Videos";
            this.btnLoader.classList.add('hidden');
        }
    }
}
