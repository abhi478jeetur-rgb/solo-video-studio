// Main Application Controller & Toast System

// Toast System
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colorStyles = {
        success: 'bg-[#111111] text-[#F7EBDD] border-emerald-500/50',
        error: 'bg-rose-950 text-rose-100 border-rose-500/50',
        warning: 'bg-amber-950 text-amber-100 border-amber-500/50',
        info: 'bg-[#111111] text-[#F7EBDD] border-[#E95722]/50'
    };

    const icons = {
        success: 'check-circle-2',
        error: 'alert-triangle',
        warning: 'alert-circle',
        info: 'info'
    };

    toast.className = `pointer-events-auto p-4 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-semibold transform transition-all duration-300 translate-y-2 opacity-0 ${colorStyles[type] || colorStyles.info}`;
    toast.innerHTML = `
        <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0 text-[#E95722]"></i>
        <span class="flex-1">${message}</span>
        <button type="button" class="text-white/60 hover:text-white" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
};

// Result Summary Banner
window.showOutputCard = function(title, message, type = 'success', actions = [], errorDetails = null) {
    const card = document.getElementById('output-result-card');
    const titleEl = document.getElementById('result-title');
    const msgEl = document.getElementById('result-message');
    const actionsEl = document.getElementById('result-actions');
    const errorDetailsContainer = document.getElementById('result-error-details');
    const errorTextEl = document.getElementById('result-error-text');
    const iconContainer = document.getElementById('result-icon-container');

    if (!card) return;

    card.classList.remove('hidden');
    titleEl.textContent = title;
    msgEl.textContent = message;

    if (type === 'success') {
        card.style.borderLeftColor = '#E95722';
        iconContainer.className = 'w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5';
        iconContainer.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i>';
    } else {
        card.style.borderLeftColor = '#EF4444';
        iconContainer.className = 'w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5';
        iconContainer.innerHTML = '<i data-lucide="alert-octagon" class="w-5 h-5"></i>';
    }

    if (errorDetails) {
        errorDetailsContainer.classList.remove('hidden');
        errorTextEl.textContent = errorDetails;
    } else {
        errorDetailsContainer.classList.add('hidden');
    }

    actionsEl.innerHTML = '';
    if (actions && actions.length > 0) {
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-solo-secondary px-3 py-1.5 rounded-xl text-xs font-semibold';
            btn.textContent = action.label;
            btn.onclick = action.action;
            actionsEl.appendChild(btn);
        });
    }

    if (window.lucide) lucide.createIcons();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// Global Video Preview Modal Controls
window.openVideoModal = function(streamUrl, filename, size = '', downloadUrl = null) {
    const modal = document.getElementById('video-preview-modal');
    const player = document.getElementById('modal-video-player');
    const titleEl = document.getElementById('modal-video-title');
    const sizeEl = document.getElementById('modal-video-size');
    const downloadBtn = document.getElementById('modal-video-download');

    if (!modal || !player) return;

    titleEl.textContent = filename || 'Video Preview';
    sizeEl.textContent = size ? `Size: ${size}` : '';
    downloadBtn.href = downloadUrl || streamUrl;
    downloadBtn.setAttribute('download', filename || 'video.mp4');

    player.src = streamUrl;
    player.load();
    modal.classList.remove('hidden');
    player.play().catch(() => {});
};

window.closeVideoModal = function() {
    const modal = document.getElementById('video-preview-modal');
    const player = document.getElementById('modal-video-player');
    if (player) {
        player.pause();
        player.src = '';
    }
    if (modal) {
        modal.classList.add('hidden');
    }
};

// Global Image Preview Modal Controls
window.openImageModal = function(imageUrl, filename, downloadUrl = null) {
    const modal = document.getElementById('image-preview-modal');
    const viewer = document.getElementById('modal-image-viewer');
    const titleEl = document.getElementById('modal-image-title');
    const downloadBtn = document.getElementById('modal-image-download');

    if (!modal || !viewer) return;

    titleEl.textContent = filename || 'Storyboard Preview';
    downloadBtn.href = downloadUrl || imageUrl;
    downloadBtn.setAttribute('download', filename || 'Storyboard.jpg');

    viewer.src = imageUrl;
    modal.classList.remove('hidden');
};

window.closeImageModal = function() {
    const modal = document.getElementById('image-preview-modal');
    const viewer = document.getElementById('modal-image-viewer');
    if (viewer) viewer.src = '';
    if (modal) modal.classList.add('hidden');
};

// Close modals on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeVideoModal();
        window.closeImageModal();
        if (window.fsExplorer) window.fsExplorer.close();
    }
});

// Tab Controller
function initTabs() {
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;

            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.add('hidden'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.remove('hidden');
            }
        });
    });
}

// Global initialization on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTabs();

    // Initialize modules
    window.fsExplorer = new FileSystemExplorer();
    window.splitter = new VideoSplitter();
    window.bulkEditor = new BulkEditor();
    if (window.ImageCleaner) {
        window.imageCleaner = new ImageCleaner();
    }
    if (window.VoiceCleaner) {
        window.voiceCleaner = new VoiceCleaner();
    }
    window.storyboard = new StoryboardCreator();

    // Render icons
    if (window.lucide) {
        lucide.createIcons();
    }
});
