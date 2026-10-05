// Voice Cleaner & Silence Removal Studio Module
class VoiceCleaner {
    constructor() {
        this.mode = 'single'; // 'single' or 'batch'
        this.currentFilePath = null;
        this.currentMeta = null;
        this.currentAnalysis = null;
        this.activePreset = 'natural';

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.singleContainer = document.getElementById('voice-single-container');
        this.batchContainer = document.getElementById('voice-batch-container');
        this.singleBtn = document.getElementById('voice-mode-single-btn');
        this.batchBtn = document.getElementById('voice-mode-batch-btn');

        this.dropzone = document.getElementById('voice-dropzone');
        this.fileInput = document.getElementById('voice-file-input');
        this.pathInput = document.getElementById('voice_single_path');
        
        this.loadedCard = document.getElementById('voice-loaded-card');
        this.loadedName = document.getElementById('voice-loaded-name');
        this.loadedCodec = document.getElementById('voice-loaded-codec');
        this.loadedSize = document.getElementById('voice-loaded-size');
        this.loadedDuration = document.getElementById('voice-loaded-duration');
        this.loadedSampleRate = document.getElementById('voice-loaded-samplerate');
        this.loadedChannels = document.getElementById('voice-loaded-channels');

        this.analysisCard = document.getElementById('voice-analysis-card');
        this.statGaps = document.getElementById('voice-stat-gaps');
        this.statSilence = document.getElementById('voice-stat-silence');
        this.statEst = document.getElementById('voice-stat-est');
        this.statReduction = document.getElementById('voice-stat-reduction');
        this.timelineBar = document.getElementById('voice-timeline-bar');
        this.timelineEnd = document.getElementById('voice-timeline-end');

        // Settings sliders
        this.thresholdInput = document.getElementById('voice_threshold');
        this.thresholdVal = document.getElementById('voice_threshold_val');
        this.minDurationInput = document.getElementById('voice_min_duration');
        this.minDurationVal = document.getElementById('voice_min_duration_val');
        this.paddingInput = document.getElementById('voice_padding');
        this.paddingVal = document.getElementById('voice_padding_val');
        this.formatSelect = document.getElementById('voice_output_format');
        this.normalizeCheck = document.getElementById('voice_normalize');
        this.highpassCheck = document.getElementById('voice_highpass');
        this.outputFolderInput = document.getElementById('voice_output_folder');

        // Results
        this.resultsCard = document.getElementById('voice-results-card');
        this.cleanedAudio = document.getElementById('voice-cleaned-audio');
        this.originalAudio = document.getElementById('voice-original-audio');
        this.resultSavedTime = document.getElementById('voice-result-saved-time');
        this.resultReductionPct = document.getElementById('voice-result-reduction-pct');
        this.resultFilename = document.getElementById('voice-result-filename');
        this.resultFilesize = document.getElementById('voice-result-filesize');
        this.downloadBtn = document.getElementById('voice-download-btn');
        this.processBtn = document.getElementById('voice-process-btn');
        this.processBtnText = document.getElementById('voice-process-btn-text');

        // Batch Elements
        this.batchInput = document.getElementById('voice_batch_input');
        this.batchOutput = document.getElementById('voice_batch_output');
        this.batchResultsCard = document.getElementById('voice-batch-results-card');
        this.batchTableBody = document.getElementById('voice-batch-table-body');
        this.batchSummaryBadge = document.getElementById('voice-batch-summary-badge');
        this.batchDetectedBadge = document.getElementById('voice-batch-detected-badge');
    }

    bindEvents() {
        if (!this.dropzone) return;

        // Drag & drop handlers
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropzone.classList.add('border-[#E95722]', 'bg-[#FAF4ED]');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dropzone.classList.remove('border-[#E95722]');
            });
        });

        this.dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                this.uploadFile(files[0]);
            }
        });

        this.dropzone.addEventListener('click', (e) => {
            // Prevent double opening if clicking something inside
            if (e.target !== this.fileInput) {
                this.fileInput.click();
            }
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.uploadFile(e.target.files[0]);
            }
        });

        // Scan batch input on change
        if (this.batchInput) {
            this.batchInput.addEventListener('change', () => this.scanBatchFolder());
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'single') {
            this.singleContainer.classList.remove('hidden');
            this.batchContainer.classList.add('hidden');
            this.singleBtn.className = "px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-[#E95722] text-white border-[#E95722] shadow-sm";
            this.batchBtn.className = "px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]";
        } else {
            this.singleContainer.classList.add('hidden');
            this.batchContainer.classList.remove('hidden');
            this.batchBtn.className = "px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-[#E95722] text-white border-[#E95722] shadow-sm";
            this.singleBtn.className = "px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]";
            this.scanBatchFolder();
        }
        if (window.lucide) lucide.createIcons();
    }

    setPreset(name) {
        this.activePreset = name;
        document.querySelectorAll('.voice-preset-btn').forEach(btn => {
            btn.classList.remove('active', 'border-[#E95722]');
            btn.classList.add('border-[#E5DCD0]');
        });

        const activeEl = document.getElementById(`preset-${name}`);
        if (activeEl) {
            activeEl.classList.add('active', 'border-[#E95722]');
            activeEl.classList.remove('border-[#E5DCD0]');
        }

        if (name === 'natural') {
            this.thresholdInput.value = -36;
            this.minDurationInput.value = 0.35;
            this.paddingInput.value = 0.08;
        } else if (name === 'aggressive') {
            this.thresholdInput.value = -32;
            this.minDurationInput.value = 0.22;
            this.paddingInput.value = 0.04;
        } else if (name === 'podcast') {
            this.thresholdInput.value = -42;
            this.minDurationInput.value = 0.60;
            this.paddingInput.value = 0.15;
        }

        this.onParamChange();
        if (this.currentFilePath) {
            this.analyzeAudio();
        }
    }

    onParamChange() {
        this.thresholdVal.textContent = `${this.thresholdInput.value} dB`;
        this.minDurationVal.textContent = `${parseFloat(this.minDurationInput.value).toFixed(2)}s`;
        this.paddingVal.textContent = `${parseFloat(this.paddingInput.value).toFixed(2)}s`;

        const bThresh = document.getElementById('voice-batch-thresh-label');
        const bGap = document.getElementById('voice-batch-gap-label');
        if (bThresh) bThresh.textContent = `${this.thresholdInput.value} dB`;
        if (bGap) bGap.textContent = `${parseFloat(this.minDurationInput.value).toFixed(2)}s`;
    }

    async uploadFile(file) {
        const progContainer = document.getElementById('voice-upload-progress-container');
        const progBar = document.getElementById('voice-upload-progress-bar');
        const progPct = document.getElementById('voice-upload-progress-pct');

        if (progContainer) {
            progContainer.classList.remove('hidden');
            progBar.style.width = '20%';
            progPct.textContent = '20%';
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            if (progBar) {
                progBar.style.width = '65%';
                progPct.textContent = '65%';
            }

            const res = await fetch('/api/voice_cleaner/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (progContainer) {
                progBar.style.width = '100%';
                progPct.textContent = '100%';
                setTimeout(() => progContainer.classList.add('hidden'), 500);
            }

            if (!data.success) {
                window.showToast(data.message || 'Audio upload failed', 'error');
                return;
            }

            this.currentFilePath = data.path;
            this.pathInput.value = data.path;
            this.renderLoadedAudio(data);
            window.showToast(`Audio uploaded: ${data.filename}`, 'success');

            // Automatically analyze gaps
            await this.analyzeAudio();
        } catch (err) {
            if (progContainer) progContainer.classList.add('hidden');
            window.showToast(`Upload failed: ${err.message}`, 'error');
        }
    }

    async loadFromPath() {
        const path = this.pathInput.value.trim();
        if (!path) {
            window.showToast('Please enter or browse for an audio file path', 'warning');
            return;
        }

        try {
            const btn = document.getElementById('voice-load-path-btn');
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Loading...</span>`;
            if (window.lucide) lucide.createIcons();

            this.currentFilePath = path;
            await this.analyzeAudio();
        } finally {
            const btn = document.getElementById('voice-load-path-btn');
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>Load</span>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    renderLoadedAudio(info) {
        this.loadedCard.classList.remove('hidden');
        this.loadedName.textContent = info.filename || 'Audio Recording';
        this.loadedCodec.textContent = info.codec || 'AUDIO';
        this.loadedSize.textContent = info.size || '--';
        this.loadedDuration.textContent = info.duration_formatted || '--:--';
        this.loadedSampleRate.textContent = info.sample_rate || '44.1 kHz';
        this.loadedChannels.textContent = info.channels || 'Stereo';
        if (window.lucide) lucide.createIcons();
    }

    async analyzeAudio() {
        if (!this.currentFilePath) return;

        try {
            const res = await fetch('/api/voice_cleaner/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: this.currentFilePath,
                    noise_db: parseFloat(this.thresholdInput.value),
                    min_duration: parseFloat(this.minDurationInput.value),
                    padding: parseFloat(this.paddingInput.value)
                })
            });
            const data = await res.json();

            if (!data.success) {
                window.showToast(data.message || 'Silence analysis failed', 'error');
                return;
            }

            this.currentAnalysis = data;
            this.renderLoadedAudio({
                filename: data.filename,
                codec: data.meta?.codec || 'AUDIO',
                size: data.meta?.size || '--',
                duration_formatted: data.total_duration_formatted,
                sample_rate: data.meta?.sample_rate || '44.1 kHz',
                channels: data.meta?.channels || 'Stereo'
            });

            this.analysisCard.classList.remove('hidden');
            this.statGaps.textContent = data.silence_gaps_count;
            this.statSilence.textContent = data.total_silence_formatted;
            this.statEst.textContent = data.estimated_duration_formatted;
            this.statReduction.textContent = `${data.reduction_percent}% Shorter`;
            this.timelineEnd.textContent = data.total_duration_formatted;

            this.renderTimeline(data.total_duration, data.segments);
        } catch (e) {
            console.error('Silence analysis error:', e);
        }
    }

    renderTimeline(totalDuration, silenceSegments) {
        if (!this.timelineBar || totalDuration <= 0) return;
        this.timelineBar.innerHTML = '';

        if (!silenceSegments || silenceSegments.length === 0) {
            // Entirely speech
            const speechEl = document.createElement('div');
            speechEl.className = 'h-full bg-[#E95722] flex-1';
            speechEl.title = `Continuous speech (No gaps detected at ${this.thresholdInput.value}dB)`;
            this.timelineBar.appendChild(speechEl);
            return;
        }

        let lastTime = 0.0;
        silenceSegments.forEach(seg => {
            const start = seg.start;
            const end = seg.end;

            // Speech slice before silence
            if (start > lastTime) {
                const speechDur = start - lastTime;
                const speechPct = (speechDur / totalDuration) * 100;
                const speechSlice = document.createElement('div');
                speechSlice.className = 'h-full bg-[#E95722] transition hover:opacity-85 cursor-pointer';
                speechSlice.style.width = `${speechPct}%`;
                speechSlice.title = `Spoken Voice: ${lastTime.toFixed(1)}s - ${start.toFixed(1)}s`;
                this.timelineBar.appendChild(speechSlice);
            }

            // Silence slice (Dead air)
            const silPct = (seg.duration / totalDuration) * 100;
            const silSlice = document.createElement('div');
            silSlice.className = 'h-full bg-[#E5DCD0] border-x border-[#FAF4ED] transition hover:bg-rose-300 cursor-pointer relative group';
            silSlice.style.width = `${silPct}%`;
            silSlice.title = `Silent Gap (Will be removed): ${start.toFixed(1)}s - ${end.toFixed(1)}s (${seg.duration.toFixed(2)}s)`;
            this.timelineBar.appendChild(silSlice);

            lastTime = end;
        });

        // Trailing speech if any
        if (lastTime < totalDuration) {
            const trailingDur = totalDuration - lastTime;
            const trailingPct = (trailingDur / totalDuration) * 100;
            const trailingSlice = document.createElement('div');
            trailingSlice.className = 'h-full bg-[#E95722] transition hover:opacity-85 cursor-pointer';
            trailingSlice.style.width = `${trailingPct}%`;
            trailingSlice.title = `Spoken Voice: ${lastTime.toFixed(1)}s - ${totalDuration.toFixed(1)}s`;
            this.timelineBar.appendChild(trailingSlice);
        }
    }

    async processAudio() {
        if (!this.currentFilePath) {
            window.showToast('Please upload or select an audio file first', 'warning');
            return;
        }

        const outFolder = this.outputFolderInput.value.trim();
        const noiseDb = parseFloat(this.thresholdInput.value);
        const minDur = parseFloat(this.minDurationInput.value);
        const padding = parseFloat(this.paddingInput.value);
        const format = this.formatSelect.value;
        const normalize = this.normalizeCheck.checked;
        const highpass = this.highpassCheck.checked;

        this.processBtn.disabled = true;
        this.processBtnText.textContent = 'Removing Silence Gaps & Encoding Audio...';
        this.processBtn.classList.add('opacity-80', 'cursor-not-allowed');

        try {
            const res = await fetch('/api/voice_cleaner/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input_path: this.currentFilePath,
                    output_folder: outFolder,
                    noise_db: noiseDb,
                    min_duration: minDur,
                    padding: padding,
                    output_format: format,
                    normalize: normalize,
                    highpass: highpass
                })
            });

            const data = await res.json();
            if (!data.success) {
                window.showToast(data.message || 'Processing failed', 'error');
                if (window.showOutputCard) {
                    window.showOutputCard('Voice Cleaning Failed', data.message || 'Error occurred during processing', 'error', [], data.details);
                }
                return;
            }

            // Render Results
            this.resultsCard.classList.remove('hidden');
            this.resultSavedTime.textContent = data.time_saved_formatted;
            this.resultReductionPct.textContent = `${data.reduction_percent}%`;
            this.resultFilename.textContent = data.filename;
            this.resultFilesize.textContent = data.size;

            this.cleanedAudio.src = data.stream_url;
            this.cleanedAudio.load();

            this.originalAudio.src = data.original_stream_url;
            this.originalAudio.load();

            this.downloadBtn.href = data.download_url;
            this.downloadBtn.setAttribute('download', data.filename);

            window.showToast(`Cleaned successfully! Saved ${data.time_saved_formatted} of dead air (${data.reduction_percent}% shorter).`, 'success');

            // Scroll down smoothly to results
            this.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } catch (err) {
            window.showToast(`Error: ${err.message}`, 'error');
        } finally {
            this.processBtn.disabled = false;
            this.processBtnText.textContent = 'Remove Silence Gaps & Clean Voice';
            this.processBtn.classList.remove('opacity-80', 'cursor-not-allowed');
            if (window.lucide) lucide.createIcons();
        }
    }

    setCleanSpeed(speed) {
        if (!this.cleanedAudio) return;
        this.cleanedAudio.playbackRate = speed;

        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.remove('active', 'border-[#E95722]', 'text-[#E95722]');
            btn.classList.add('border-[#E5DCD0]', 'text-[#777777]');
        });

        const activeBtn = Array.from(document.querySelectorAll('.speed-btn')).find(b => b.textContent.trim() === `${speed}x`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'border-[#E95722]', 'text-[#E95722]');
            activeBtn.classList.remove('border-[#E5DCD0]', 'text-[#777777]');
        }
    }

    async scanBatchFolder() {
        if (!this.batchInput) return;
        const folder = this.batchInput.value.trim();
        if (!folder) return;

        try {
            const res = await fetch('/api/voice_cleaner/scan-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: folder })
            });
            const data = await res.json();
            if (data.success && this.batchDetectedBadge) {
                this.batchDetectedBadge.textContent = `${data.count} audio file${data.count === 1 ? '' : 's'} (${data.total_size})`;
            }
        } catch (e) {
            console.error('Batch scan error:', e);
        }
    }

    async processBatch() {
        const inFolder = this.batchInput.value.trim();
        const outFolder = this.batchOutput.value.trim();

        if (!inFolder) {
            window.showToast('Please select an input voice folder', 'warning');
            return;
        }

        const btn = document.getElementById('voice-batch-process-btn');
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Processing Voice Batch...</span>`;
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/voice_cleaner/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input_folder: inFolder,
                    output_folder: outFolder,
                    noise_db: parseFloat(this.thresholdInput.value),
                    min_duration: parseFloat(this.minDurationInput.value),
                    padding: parseFloat(this.paddingInput.value),
                    output_format: this.formatSelect.value,
                    normalize: this.normalizeCheck.checked,
                    highpass: this.highpassCheck.checked
                })
            });

            const data = await res.json();
            if (!data.success) {
                window.showToast(data.message || 'Batch failed', 'error');
                return;
            }

            this.batchResultsCard.classList.remove('hidden');
            this.batchSummaryBadge.textContent = `${data.processed_count}/${data.total_files} Cleaned (${data.total_time_saved} saved)`;

            this.batchTableBody.innerHTML = data.results.map(item => `
                <tr class="hover:bg-[#FAF4ED]/50 transition">
                    <td class="py-2.5 px-3 font-semibold text-[#111111]">${item.original_name}</td>
                    <td class="py-2.5 px-3 text-[#777777] font-mono">${item.original_duration || '--'}</td>
                    <td class="py-2.5 px-3 font-bold text-emerald-700 font-mono">${item.cleaned_duration || '--'}</td>
                    <td class="py-2.5 px-3 font-bold text-[#E95722] font-mono">${item.time_saved || '--'}</td>
                    <td class="py-2.5 px-3 text-right">
                        ${item.status === 'success' ? `
                            <a href="${item.download_url}" download class="inline-flex items-center gap-1 text-[11px] font-bold text-[#E95722] hover:underline bg-white px-2.5 py-1 rounded-lg border border-[#E5DCD0]">
                                <i data-lucide="download" class="w-3 h-3"></i>
                                <span>Download</span>
                            </a>
                        ` : `<span class="text-rose-600 text-[11px] font-bold">Failed</span>`}
                    </td>
                </tr>
            `).join('');

            window.showToast(`Batch completed: Cleaned ${data.processed_count} files, saved ${data.total_time_saved} of silence!`, 'success');
            if (window.lucide) lucide.createIcons();

        } catch (err) {
            window.showToast(`Batch error: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i><span>Batch Clean All Voice Files</span>`;
            if (window.lucide) lucide.createIcons();
        }
    }
}

window.VoiceCleaner = VoiceCleaner;
