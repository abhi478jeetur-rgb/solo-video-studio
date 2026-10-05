// Storyboard Creator Module with Frame Scrubbing and Visual Lightbox Preview
class StoryboardCreator {
    constructor() {
        this.videoFileEl = document.getElementById('story_video_file');
        this.outputEl = document.getElementById('story_output');
        this.playerWrapper = document.getElementById('story-player-wrapper');
        this.videoEl = document.getElementById('story-video');
        this.playheadTimeEl = document.getElementById('current-playhead-time');
        this.counterBadge = document.getElementById('frame-counter-badge');
        this.chipsContainer = document.getElementById('timestamps-container');
        this.colSelect = document.getElementById('story-columns');
        this.generateBtn = document.getElementById('story-generate-btn');
        this.btnText = document.getElementById('story-btn-text');
        this.btnLoader = document.getElementById('story-btn-loader');

        // Preview Elements
        this.previewSection = document.getElementById('story-preview-section');
        this.previewImage = document.getElementById('story-preview-image');
        this.previewFilename = document.getElementById('story-preview-filename');
        this.downloadBtn = document.getElementById('story-download-btn');

        this.markedTimestamps = [];
        this.currentVideoPath = null;
        this.lastImageUrl = null;
        this.lastFilename = null;
        this.lastDownloadUrl = null;

        this.init();
    }

    init() {
        if (!this.videoEl) return;

        // Track playhead time
        this.videoEl.addEventListener('timeupdate', () => {
            const current = this.videoEl.currentTime;
            this.playheadTimeEl.textContent = this.formatTime(current);
        });

        // Keyboard shortcut: Press M to mark frame, Space to play/pause
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'KeyM') {
                e.preventDefault();
                this.markCurrentFrame();
            }
        });
    }

    loadVideo(videoPath) {
        if (!videoPath) return;
        this.currentVideoPath = videoPath;
        this.videoEl.src = `/api/preview/stream?path=${encodeURIComponent(videoPath)}`;
        this.videoEl.load();
        this.playerWrapper.classList.remove('hidden');
        this.markedTimestamps = [];
        this.renderChips();
    }

    formatTime(sec) {
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    markCurrentFrame() {
        if (!this.videoEl || !this.currentVideoPath) {
            window.showToast("Please select a video file first.", "warning");
            return;
        }

        const t = Math.round(this.videoEl.currentTime * 10) / 10;
        if (!this.markedTimestamps.includes(t)) {
            this.markedTimestamps.push(t);
            this.markedTimestamps.sort((a, b) => a - b);
            this.renderChips();
            window.showToast(`Marked frame at ${this.formatTime(t)}`, "info");
        } else {
            window.showToast(`Timestamp ${this.formatTime(t)} is already marked.`, "warning");
        }
    }

    removeTimestamp(t) {
        this.markedTimestamps = this.markedTimestamps.filter(x => x !== t);
        this.renderChips();
    }

    clearFrames() {
        this.markedTimestamps = [];
        this.renderChips();
    }

    renderChips() {
        this.counterBadge.textContent = this.markedTimestamps.length;

        if (this.markedTimestamps.length === 0) {
            this.chipsContainer.innerHTML = `<span class="text-xs text-[#777777] italic">No frames marked yet. Scrub through the video above and click "Mark Frame".</span>`;
            return;
        }

        this.chipsContainer.innerHTML = this.markedTimestamps.map((t, idx) => `
            <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDF9F3] border border-[#E95722]/30 rounded-xl text-xs font-semibold text-[#111111] shadow-sm">
                <span class="text-[#E95722] font-bold">#${idx + 1}</span>
                <span class="font-mono">${this.formatTime(t)}</span>
                <button type="button" onclick="window.storyboard.removeTimestamp(${t})" class="ml-1 text-[#777777] hover:text-red-500 text-sm font-bold">×</button>
            </div>
        `).join('');
    }

    async generate() {
        if (!this.currentVideoPath) {
            window.showToast("Please select a video first.", "warning");
            return;
        }

        if (this.markedTimestamps.length === 0) {
            window.showToast("Please mark at least one frame before generating.", "warning");
            return;
        }

        const outputFolder = this.outputEl.value.trim();
        const columns = parseInt(this.colSelect.value) || 5;

        this.setLoading(true);

        try {
            const res = await fetch('/api/storyboard/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video_path: this.currentVideoPath,
                    output_folder: outputFolder,
                    timestamps: this.markedTimestamps,
                    columns: columns
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                this.lastImageUrl = data.image_url;
                this.lastFilename = data.filename;
                this.lastDownloadUrl = data.download_url;

                // Show in preview card
                if (this.previewSection && this.previewImage) {
                    this.previewImage.src = data.image_url;
                    this.previewFilename.textContent = data.filename;
                    this.downloadBtn.href = data.download_url;
                    this.downloadBtn.setAttribute('download', data.filename);
                    this.previewSection.classList.remove('hidden');
                    this.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                window.showOutputCard('Storyboard Grid Created!', data.message, 'success', [
                    { label: 'Inspect Fullscreen', action: () => this.inspectImage() },
                    { label: 'Open Output Folder', action: () => window.fsExplorer.open(null, 'folder', 'Output Folder') }
                ]);
                window.showToast("Storyboard generated successfully!", "success");
            } else {
                window.showOutputCard('Storyboard Generation Failed', data.message || "Failed to extract frames", 'error');
                window.showToast(data.message || "Failed to generate storyboard", "error");
            }
        } catch (e) {
            window.showOutputCard('Network Error', e.toString(), 'error');
            window.showToast("Failed to connect to the server", "error");
        } finally {
            this.setLoading(false);
        }
    }

    inspectImage() {
        if (this.lastImageUrl) {
            window.openImageModal(this.lastImageUrl, this.lastFilename, this.lastDownloadUrl);
        }
    }

    setLoading(loading) {
        if (loading) {
            this.generateBtn.disabled = true;
            this.generateBtn.classList.add('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Extracting frames and building grid...";
            this.btnLoader.classList.remove('hidden');
        } else {
            this.generateBtn.disabled = false;
            this.generateBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            this.btnText.textContent = "Generate Storyboard Grid";
            this.btnLoader.classList.add('hidden');
        }
    }
}
