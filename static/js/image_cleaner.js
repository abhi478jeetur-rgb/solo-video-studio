// Image Watermark Studio Controller
// Handles Auto Gemini watermark removal, interactive canvas brush/box selection,
// Social Reels Header Stamp Generation, and bulk processing

class ImageCleaner {
    constructor() {
        this.mode = 'gemini_auto'; // 'gemini_auto' or 'canvas'
        this.activeTool = 'box'; // 'box' or 'brush'
        this.brushSize = 20;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.selectedBoxes = []; // Array of {x, y, w, h} (percentages 0..100)
        this.currentBox = null;
        
        this.baseCanvas = document.getElementById('img-base-canvas');
        this.drawCanvas = document.getElementById('img-draw-canvas');
        this.baseCtx = this.baseCanvas ? this.baseCanvas.getContext('2d') : null;
        this.drawCtx = this.drawCanvas ? this.drawCanvas.getContext('2d') : null;
        
        this.currentImage = null;
        this.currentImagePath = null;
        this.activeJobId = null;
        this.pollInterval = null;

        // Channel Branding & Reels Header Stamp State
        this.stampEnabled = false;
        this.stampTemplate = 'classic_card';
        this.stampLogoPath = null;
        this.stampPosition = 'top-center';
        this.stampCustomCoords = { x: 50, y: 8 };
        this.stampDebounceTimer = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupCanvasEvents();
        this.loadSampleImagesList();
        this.loadGallery();
        this.updateHeaderPreview();
    }

    setupEventListeners() {
        const inputEl = document.getElementById('img_cleaner_input');
        if (inputEl) {
            inputEl.addEventListener('change', () => this.loadSampleImagesList());
            inputEl.addEventListener('blur', () => this.loadSampleImagesList());
        }

        const brushSlider = document.getElementById('canvas-brush-size');
        if (brushSlider) {
            brushSlider.addEventListener('input', (e) => {
                this.brushSize = parseInt(e.target.value, 10) || 20;
            });
        }
    }

    // --- Mode Management ---
    setMode(mode) {
        this.mode = mode;
        const autoBtn = document.getElementById('img-mode-auto-btn');
        const canvasBtn = document.getElementById('img-mode-canvas-btn');
        const autoCard = document.getElementById('img-auto-info-card');
        const studioCard = document.getElementById('img-canvas-studio-card');

        if (mode === 'gemini_auto') {
            autoBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-[#E95722] text-white border-[#E95722] shadow-sm';
            canvasBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]';
            autoCard.classList.remove('hidden');
            studioCard.classList.add('hidden');
        } else {
            canvasBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-[#E95722] text-white border-[#E95722] shadow-sm';
            autoBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]';
            autoCard.classList.add('hidden');
            studioCard.classList.remove('hidden');

            if (!this.currentImage) {
                const select = document.getElementById('canvas-sample-select');
                if (select && select.options.length > 1 && select.options[1].value) {
                    select.selectedIndex = 1;
                    this.loadSelectedSample(select.options[1].value);
                }
            }
        }
    }

    setCanvasTool(tool) {
        this.activeTool = tool;
        const boxBtn = document.getElementById('tool-box-btn');
        const brushBtn = document.getElementById('tool-brush-btn');
        const brushContainer = document.getElementById('brush-size-container');

        if (tool === 'box') {
            boxBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-[#111111] text-white border-[#111111]';
            brushBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]';
            brushContainer.classList.add('hidden');
            brushContainer.classList.remove('flex');
            document.getElementById('canvas-selection-status').textContent = 'Drag a rectangle over the watermark';
        } else {
            brushBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-[#111111] text-white border-[#111111]';
            boxBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]';
            brushContainer.classList.remove('hidden');
            brushContainer.classList.add('flex');
            document.getElementById('canvas-selection-status').textContent = 'Paint with the brush directly over the watermark';
        }
    }

    // --- Channel Branding & Reels Header Stamp Management ---
    toggleStamp(enabled) {
        this.stampEnabled = enabled;
        const panel = document.getElementById('stamp-config-panel');
        if (panel) {
            if (enabled) {
                panel.classList.remove('hidden');
                this.updateHeaderPreview();
                window.showToast('Brand Stamp enabled! Configured header will be stamped onto processed images.', 'info');
            } else {
                panel.classList.add('hidden');
            }
        }
    }

    setStampTemplate(tpl) {
        this.stampTemplate = tpl;
        const buttons = document.querySelectorAll('.stamp-tpl-btn');
        buttons.forEach(btn => {
            btn.className = 'stamp-tpl-btn p-2.5 rounded-xl border text-left transition bg-white text-[#111111] border-[#E5DCD0] hover:border-[#E95722]';
        });

        const activeBtn = document.getElementById(`stamp-tpl-${tpl}`);
        if (activeBtn) {
            activeBtn.className = 'stamp-tpl-btn p-2.5 rounded-xl border text-left transition bg-[#111111] text-white border-[#111111] shadow-sm';
        }

        this.updateHeaderPreview();
    }

    async handleLogoUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Local thumbnail preview immediately
        const reader = new FileReader();
        reader.onload = (e) => {
            const logoImg = document.getElementById('stamp-logo-img');
            if (logoImg) logoImg.src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Upload to server
        const formData = new FormData();
        formData.append('logo', file);

        try {
            const res = await fetch('/api/image_cleaner/upload_logo', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success && data.path) {
                this.stampLogoPath = data.path;
                window.showToast('Profile logo uploaded successfully', 'success');
                this.updateHeaderPreview();
            }
        } catch (e) {
            console.error('Logo upload failed:', e);
        }
    }

    onPositionChange(val) {
        this.stampPosition = val;
        if (val === 'custom') {
            window.showToast('Custom position selected: Click anywhere on the image canvas to place your header stamp!', 'info');
            document.getElementById('canvas-selection-status').textContent = 'Click on canvas to place the Reels header stamp';
        }
    }

    getStampConfig() {
        if (!this.stampEnabled) return null;

        const nameInput = document.getElementById('stamp-name-input');
        const handleInput = document.getElementById('stamp-handle-input');
        const ringColor = document.getElementById('stamp-ring-color');
        const bgStyle = document.getElementById('stamp-bg-style');
        const textColor = document.getElementById('stamp-text-color');
        const handleColor = document.getElementById('stamp-handle-color');
        const verifiedToggle = document.getElementById('stamp-verified-toggle');
        const scaleSlider = document.getElementById('stamp-scale-slider');
        const posSelect = document.getElementById('stamp-position-select');

        return {
            enabled: true,
            display_name: nameInput ? nameInput.value.trim() : 'Solo Vibe',
            handle: handleInput ? handleInput.value.trim() : '@solovibecode',
            template: this.stampTemplate,
            ring_color: ringColor ? ringColor.value : '#FF6B00',
            bg_style: bgStyle ? bgStyle.value : '#000000',
            text_color: textColor ? textColor.value : '#FFFFFF',
            handle_color: handleColor ? handleColor.value : '#71767B',
            show_verified: verifiedToggle ? verifiedToggle.checked : true,
            scale: scaleSlider ? parseFloat(scaleSlider.value) : 1.0,
            position: posSelect ? posSelect.value : 'top-center',
            coords: this.stampCustomCoords,
            logo_path: this.stampLogoPath
        };
    }

    updateHeaderPreview() {
        if (this.stampDebounceTimer) clearTimeout(this.stampDebounceTimer);

        this.stampDebounceTimer = setTimeout(async () => {
            const config = this.getStampConfig() || {
                display_name: document.getElementById('stamp-name-input')?.value || 'Solo Vibe',
                handle: document.getElementById('stamp-handle-input')?.value || '@solovibecode',
                template: this.stampTemplate,
                ring_color: document.getElementById('stamp-ring-color')?.value || '#FF6B00',
                bg_style: document.getElementById('stamp-bg-style')?.value || '#000000',
                text_color: document.getElementById('stamp-text-color')?.value || '#FFFFFF',
                handle_color: document.getElementById('stamp-handle-color')?.value || '#71767B',
                show_verified: document.getElementById('stamp-verified-toggle')?.checked ?? true,
                scale: parseFloat(document.getElementById('stamp-scale-slider')?.value || 1.0),
                logo_path: this.stampLogoPath
            };

            // Update color hex badges
            const ringVal = document.getElementById('stamp-ring-val');
            const ringColor = document.getElementById('stamp-ring-color');
            const avatarRing = document.getElementById('stamp-avatar-ring-preview');
            if (ringVal && ringColor) {
                ringVal.textContent = ringColor.value;
                if (avatarRing) avatarRing.style.borderColor = ringColor.value;
            }

            try {
                const res = await fetch('/api/image_cleaner/generate_header', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                const data = await res.json();
                if (data.success && data.data_url) {
                    const previewImg = document.getElementById('stamp-live-preview-img');
                    if (previewImg) previewImg.src = data.data_url;
                }
            } catch (e) {
                console.error('Failed to generate header preview:', e);
            }
        }, 120);
    }

    async downloadStandaloneHeader() {
        const config = this.getStampConfig() || {
            display_name: document.getElementById('stamp-name-input')?.value || 'Solo Vibe',
            handle: document.getElementById('stamp-handle-input')?.value || '@solovibecode',
            template: this.stampTemplate,
            ring_color: document.getElementById('stamp-ring-color')?.value || '#FF6B00',
            bg_style: document.getElementById('stamp-bg-style')?.value || '#000000',
            text_color: document.getElementById('stamp-text-color')?.value || '#FFFFFF',
            handle_color: document.getElementById('stamp-handle-color')?.value || '#71767B',
            show_verified: document.getElementById('stamp-verified-toggle')?.checked ?? true,
            scale: parseFloat(document.getElementById('stamp-scale-slider')?.value || 1.0),
            logo_path: this.stampLogoPath
        };

        try {
            window.showToast('Generating 4K High-Res PNG Header...', 'info');
            const res = await fetch('/api/image_cleaner/generate_header?download=1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reels-header-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            window.showToast('High-Res Header PNG downloaded!', 'success');
        } catch (e) {
            window.showToast('Download failed: ' + e.message, 'error');
        }
    }

    // --- Sample Loading & Canvas Methods ---
    async loadSampleImagesList() {
        const inputFolder = document.getElementById('img_cleaner_input').value.trim();
        const badge = document.getElementById('img-input-count-badge');
        const select = document.getElementById('canvas-sample-select');
        
        if (!inputFolder) return;

        try {
            const res = await fetch(`/api/fs/list?path=${encodeURIComponent(inputFolder)}`);
            const data = await res.json();
            if (data.success && data.items) {
                const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
                const images = data.items.filter(item => !item.is_dir && imgExts.some(ext => item.name.toLowerCase().endsWith(ext)));

                badge.textContent = `${images.length} images detected`;
                
                select.innerHTML = '<option value="">Select an image from input folder...</option>';
                images.forEach(img => {
                    const opt = document.createElement('option');
                    opt.value = img.path;
                    opt.textContent = img.name;
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            console.error('Failed to list input images:', e);
        }
    }

    loadSelectedSample(imagePath) {
        if (!imagePath) return;
        this.currentImagePath = imagePath;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.setupImageOnCanvas(img);
        };
        img.src = `/api/preview/image?path=${encodeURIComponent(imagePath)}&t=${Date.now()}`;
    }

    handleCustomImageUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.currentImagePath = null;
                this.currentCustomDataUrl = e.target.result;
                this.setupImageOnCanvas(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    setupImageOnCanvas(img) {
        this.currentImage = img;
        const wrapper = document.getElementById('canvas-wrapper');
        const emptyState = document.getElementById('canvas-empty-state');

        emptyState.classList.add('hidden');
        wrapper.classList.remove('hidden');

        this.baseCanvas.width = img.naturalWidth || img.width;
        this.baseCanvas.height = img.naturalHeight || img.height;
        this.drawCanvas.width = this.baseCanvas.width;
        this.drawCanvas.height = this.baseCanvas.height;

        this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        this.baseCtx.drawImage(img, 0, 0);

        this.clearCanvasMask();
    }

    setupCanvasEvents() {
        if (!this.drawCanvas) return;

        const getPos = (e) => {
            const rect = this.drawCanvas.getBoundingClientRect();
            const scaleX = this.drawCanvas.width / rect.width;
            const scaleY = this.drawCanvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        this.drawCanvas.addEventListener('mousedown', (e) => {
            if (!this.currentImage) return;

            const pos = getPos(e);

            // If user clicked while Custom Stamp Placement is active
            if (this.stampPosition === 'custom' && this.stampEnabled) {
                const pctX = (pos.x / this.drawCanvas.width) * 100;
                const pctY = (pos.y / this.drawCanvas.height) * 100;
                this.stampCustomCoords = { x: Math.round(pctX), y: Math.round(pctY) };
                window.showToast(`Stamp position set to: X=${this.stampCustomCoords.x}%, Y=${this.stampCustomCoords.y}%`, 'success');
                this.redrawBoxes();
                return;
            }

            this.isDrawing = true;
            this.startX = pos.x;
            this.startY = pos.y;

            if (this.activeTool === 'brush') {
                this.drawCtx.beginPath();
                this.drawCtx.moveTo(pos.x, pos.y);
                this.drawCtx.strokeStyle = 'rgba(233, 87, 34, 0.85)';
                this.drawCtx.lineWidth = this.brushSize * (this.drawCanvas.width / 800);
                this.drawCtx.lineCap = 'round';
                this.drawCtx.lineJoin = 'round';
                this.drawCtx.lineTo(pos.x, pos.y);
                this.drawCtx.stroke();
            }
        });

        this.drawCanvas.addEventListener('mousemove', (e) => {
            if (!this.isDrawing) return;
            const pos = getPos(e);

            if (this.activeTool === 'brush') {
                this.drawCtx.lineTo(pos.x, pos.y);
                this.drawCtx.stroke();
            } else if (this.activeTool === 'box') {
                this.redrawBoxes();
                const w = pos.x - this.startX;
                const h = pos.y - this.startY;

                this.drawCtx.fillStyle = 'rgba(233, 87, 34, 0.35)';
                this.drawCtx.strokeStyle = '#E95722';
                this.drawCtx.lineWidth = 3;
                this.drawCtx.fillRect(this.startX, this.startY, w, h);
                this.drawCtx.strokeRect(this.startX, this.startY, w, h);
            }
        });

        const stopDrawing = (e) => {
            if (!this.isDrawing) return;
            this.isDrawing = false;

            if (this.activeTool === 'box') {
                const pos = getPos(e);
                const x = Math.min(this.startX, pos.x);
                const y = Math.min(this.startY, pos.y);
                const w = Math.abs(pos.x - this.startX);
                const h = Math.abs(pos.y - this.startY);

                if (w > 5 && h > 5) {
                    const pctBox = {
                        x: (x / this.drawCanvas.width) * 100,
                        y: (y / this.drawCanvas.height) * 100,
                        w: (w / this.drawCanvas.width) * 100,
                        h: (h / this.drawCanvas.height) * 100
                    };
                    this.selectedBoxes.push(pctBox);
                }
                this.redrawBoxes();
            }
        };

        this.drawCanvas.addEventListener('mouseup', stopDrawing);
        this.drawCanvas.addEventListener('mouseleave', stopDrawing);
    }

    redrawBoxes() {
        this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        
        // Draw selected inpaint watermark boxes
        this.selectedBoxes.forEach(b => {
            const x = (b.x / 100) * this.drawCanvas.width;
            const y = (b.y / 100) * this.drawCanvas.height;
            const w = (b.w / 100) * this.drawCanvas.width;
            const h = (b.h / 100) * this.drawCanvas.height;

            this.drawCtx.fillStyle = 'rgba(233, 87, 34, 0.4)';
            this.drawCtx.strokeStyle = '#E95722';
            this.drawCtx.lineWidth = 3;
            this.drawCtx.fillRect(x, y, w, h);
            this.drawCtx.strokeRect(x, y, w, h);
        });

        // If custom stamp position is active, draw a pin marker
        if (this.stampPosition === 'custom' && this.stampCustomCoords && this.stampEnabled) {
            const px = (this.stampCustomCoords.x / 100) * this.drawCanvas.width;
            const py = (this.stampCustomCoords.y / 100) * this.drawCanvas.height;
            
            this.drawCtx.save();
            this.drawCtx.fillStyle = '#1DA1F2';
            this.drawCtx.strokeStyle = '#FFFFFF';
            this.drawCtx.lineWidth = 2;
            this.drawCtx.beginPath();
            this.drawCtx.arc(px, py, 12, 0, Math.PI * 2);
            this.drawCtx.fill();
            this.drawCtx.stroke();
            this.drawCtx.fillStyle = '#FFFFFF';
            this.drawCtx.font = 'bold 10px sans-serif';
            this.drawCtx.textAlign = 'center';
            this.drawCtx.textBaseline = 'middle';
            this.drawCtx.fillText('STAMP', px, py);
            this.drawCtx.restore();
        }
    }

    autoMarkGeminiCorner() {
        if (!this.currentImage) {
            window.showToast('Please select or upload an image first', 'warning');
            return;
        }

        const geminiBox = {
            x: 88,
            y: 88,
            w: 10,
            h: 10
        };

        this.selectedBoxes = [geminiBox];
        this.redrawBoxes();
        window.showToast('Gemini bottom-right watermark region selected', 'info');
    }

    clearCanvasMask() {
        this.selectedBoxes = [];
        if (this.drawCtx) {
            this.drawCtx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        }
        document.getElementById('inpaint-preview-card').classList.add('hidden');
    }

    // --- Preview & Execution ---
    async testInpaintPreview() {
        if (!this.currentImagePath && !this.currentCustomDataUrl) {
            window.showToast('Please load an image to preview inpaint', 'warning');
            return;
        }

        const btn = document.getElementById('preview-inpaint-btn');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Analyzing & Stamping...</span>';
        if (window.lucide) lucide.createIcons();

        try {
            let brushMaskB64 = null;
            if (this.activeTool === 'brush') {
                brushMaskB64 = this.drawCanvas.toDataURL('image/png');
            }

            const payload = {
                image_path: this.currentImagePath,
                mode: this.selectedBoxes.length > 0 ? 'custom_boxes' : (brushMaskB64 ? 'brush_mask' : 'gemini_auto'),
                boxes: this.selectedBoxes,
                brush_mask: brushMaskB64,
                stamp_config: this.getStampConfig()
            };

            const res = await fetch('/api/image_cleaner/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                document.getElementById('preview-before-img').src = data.before;
                document.getElementById('preview-after-img').src = data.after;
                document.getElementById('inpaint-preview-card').classList.remove('hidden');
                document.getElementById('inpaint-preview-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                window.showToast('Preview generated! Cleaned and stamped with your channel brand.', 'success');
            } else {
                window.showToast(data.error || 'Failed to preview inpaint', 'error');
            }
        } catch (e) {
            window.showToast('Error generating preview: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5 text-[#E95722]"></i><span>Test Inpaint Preview</span>';
            if (window.lucide) lucide.createIcons();
        }
    }

    async startBulkJob() {
        const inputFolder = document.getElementById('img_cleaner_input').value.trim();
        const outputFolder = document.getElementById('img_cleaner_output').value.trim();

        if (!inputFolder) {
            window.showToast('Please specify an input folder', 'warning');
            return;
        }

        const submitBtn = document.getElementById('img-bulk-submit-btn');
        const btnText = document.getElementById('img-btn-text');
        const btnLoader = document.getElementById('img-btn-loader');
        
        submitBtn.disabled = true;
        btnText.textContent = 'Queueing Bulk Process...';
        btnLoader.classList.remove('hidden');

        try {
            let brushMaskB64 = null;
            if (this.mode === 'canvas' && this.activeTool === 'brush') {
                brushMaskB64 = this.drawCanvas.toDataURL('image/png');
            }

            const payload = {
                input_folder: inputFolder,
                output_folder: outputFolder,
                mode: this.mode === 'canvas' ? (this.selectedBoxes.length > 0 ? 'custom_boxes' : 'brush_mask') : 'gemini_auto',
                boxes: this.selectedBoxes,
                brush_mask: brushMaskB64,
                stamp_config: this.getStampConfig()
            };

            const res = await fetch('/api/image_cleaner/process_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                this.activeJobId = data.job_id;
                this.showProgress(true);
                this.startPolling(data.job_id);
                window.showToast(`Started processing ${data.total_files} images in background`, 'success');
            } else {
                window.showToast(data.error || 'Failed to start bulk job', 'error');
                submitBtn.disabled = false;
                btnText.textContent = 'Clean All Images in Bulk Folder';
                btnLoader.classList.add('hidden');
            }
        } catch (e) {
            window.showToast('Connection error: ' + e.message, 'error');
            submitBtn.disabled = false;
            btnText.textContent = 'Clean All Images in Bulk Folder';
            btnLoader.classList.add('hidden');
        }
    }

    showProgress(show) {
        const card = document.getElementById('img-progress-card');
        if (show) card.classList.remove('hidden');
        else card.classList.add('hidden');
    }

    startPolling(jobId) {
        if (this.pollInterval) clearInterval(this.pollInterval);

        this.pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/image_cleaner/status/${jobId}`);
                const data = await res.json();
                if (!data.success || !data.job) return;

                const job = data.job;
                const percent = job.percent || 0;

                document.getElementById('img-progress-percent').textContent = `${percent}%`;
                document.getElementById('img-progress-bar').style.width = `${percent}%`;
                document.getElementById('img-progress-detail').textContent = job.current_file || 'Processing...';
                document.getElementById('img-progress-step').textContent = `Image ${job.current_index || 0} of ${job.total || 0}`;

                if (job.status === 'completed' || job.status === 'error') {
                    clearInterval(this.pollInterval);
                    this.pollInterval = null;

                    const submitBtn = document.getElementById('img-bulk-submit-btn');
                    submitBtn.disabled = false;
                    document.getElementById('img-btn-text').textContent = 'Clean All Images in Bulk Folder';
                    document.getElementById('img-btn-loader').classList.add('hidden');

                    if (job.status === 'completed') {
                        window.showToast('All images processed and stamped successfully!', 'success');
                        window.showOutputCard(
                            'Bulk Processing Complete',
                            `Successfully processed and saved branded images to ${job.output_folder}.`,
                            'success',
                            [{ label: 'View Output Gallery', action: () => this.loadGallery() }]
                        );
                        this.loadGallery();
                    } else {
                        window.showToast('Job encountered an error: ' + job.error, 'error');
                    }
                }
            } catch (e) {
                console.error('Polling error:', e);
            }
        }, 1200);
    }

    async loadGallery() {
        const outputFolder = document.getElementById('img_cleaner_output').value.trim();
        const section = document.getElementById('img-gallery-section');
        const grid = document.getElementById('img-gallery-grid');
        const countBadge = document.getElementById('img-gallery-count-badge');

        try {
            const res = await fetch(`/api/image_cleaner/gallery?folder=${encodeURIComponent(outputFolder)}`);
            const data = await res.json();
            if (data.success && data.images && data.images.length > 0) {
                section.classList.remove('hidden');
                countBadge.textContent = `${data.images.length} Images`;
                grid.innerHTML = '';

                data.images.forEach(img => {
                    const card = document.createElement('div');
                    card.className = 'group relative bg-white rounded-2xl border border-[#E5DCD0] overflow-hidden shadow-sm hover:shadow-md transition';
                    card.innerHTML = `
                        <div class="aspect-square bg-neutral-100 overflow-hidden cursor-pointer flex items-center justify-center" onclick="window.openImageModal('${img.stream_url}', '${img.name}', '${img.download_url}')">
                            <img src="${img.stream_url}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" alt="${img.name}">
                        </div>
                        <div class="p-2.5 flex items-center justify-between">
                            <div class="truncate pr-1">
                                <p class="text-xs font-bold text-[#111111] truncate" title="${img.name}">${img.name}</p>
                                <span class="text-[10px] text-[#777777]">${img.size}</span>
                            </div>
                            <a href="${img.download_url}" download="${img.name}" class="p-1.5 rounded-lg border border-[#E5DCD0] hover:bg-[#FAF4ED] text-[#111111] transition" title="Download clean image">
                                <i data-lucide="download" class="w-3.5 h-3.5 text-[#E95722]"></i>
                            </a>
                        </div>
                    `;
                    grid.appendChild(card);
                });

                if (window.lucide) lucide.createIcons();
            } else {
                section.classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to load images gallery:', e);
        }
    }
}

window.ImageCleaner = ImageCleaner;
