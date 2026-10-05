// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        
        // Hide status message when switching tabs
        document.getElementById('status-message').classList.add('hidden');
    });
});

// Helper for UI status updates
function updateStatus(btn, btnText, loader, statusMsg, isProcessing, isSuccess = null, message = null) {
    if (isProcessing) {
        btn.disabled = true;
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
        statusMsg.classList.remove('show', 'success', 'error');
        statusMsg.classList.add('hidden');
    } else {
        btn.disabled = false;
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
        
        if (message) {
            statusMsg.classList.remove('hidden');
            statusMsg.textContent = message;
            if (isSuccess) {
                statusMsg.classList.add('success', 'show');
            } else {
                statusMsg.classList.add('error', 'show');
            }
        }
    }
}

// Splitter Form Submission
document.getElementById('splitter-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const duration = document.getElementById('duration').value;
    const prefix = document.getElementById('prefix').value;
    const input_folder = document.getElementById('split_input_folder').value;
    const output_folder = document.getElementById('split_output_folder').value;
    const compression = document.getElementById('compression').value;
    
    const btn = document.getElementById('process-btn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    const statusMsg = document.getElementById('status-message');

    updateStatus(btn, btnText, loader, statusMsg, true);

    try {
        const response = await fetch('/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration, prefix, input_folder, output_folder, compression })
        });

        const data = await response.json();
        updateStatus(btn, btnText, loader, statusMsg, false, response.ok, data.message || (response.ok ? "Done" : "An error occurred"));
    } catch (err) {
        updateStatus(btn, btnText, loader, statusMsg, false, false, "Failed to connect to the server.");
    }
});

async function updateVideoInfo() {
    const input_folder = document.getElementById('split_input_folder').value;
    const duration = document.getElementById('duration').value;
    const infoBox = document.getElementById('video-info-box');
    
    if (!input_folder) return;
    
    try {
        const res = await fetch('/video_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_folder, duration })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('info-count').textContent = data.count;
            document.getElementById('info-size').textContent = data.size_mb;
            document.getElementById('info-parts').textContent = data.parts;
            infoBox.classList.remove('hidden');
        } else {
            infoBox.classList.add('hidden');
        }
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('duration').addEventListener('input', updateVideoInfo);

async function selectSplitFolder(inputId) {
    await selectFolder(inputId);
    updateVideoInfo();
}

// Bulk Editor: Select Folder functionality
async function selectFolder(inputId) {
    try {
        const response = await fetch('/select_folder');
        const data = await response.json();
        
        if (data.success && data.path) {
            document.getElementById(inputId).value = data.path;
        }
    } catch (err) {
        console.error("Failed to open folder dialog", err);
    }
}

// Bulk Editor Form Submission
document.getElementById('bulk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    const btn = document.getElementById('bulk-process-btn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    const statusMsg = document.getElementById('status-message');

    updateStatus(btn, btnText, loader, statusMsg, true);

    try {
        const response = await fetch('/process_bulk', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        updateStatus(btn, btnText, loader, statusMsg, false, response.ok, data.message || (response.ok ? "Done" : "An error occurred"));
    } catch (err) {
        updateStatus(btn, btnText, loader, statusMsg, false, false, "Failed to connect to the server.");
    }
});

// Storyboard State
let storyTimestamps = [];
const videoElement = document.getElementById('story-video');
const timestampsList = document.getElementById('timestamps-list');
const frameCount = document.getElementById('frame-count');

async function selectStoryFile() {
    try {
        const response = await fetch('/select_file');
        const data = await response.json();
        
        if (data.success && data.path) {
            document.getElementById('story_video_file').value = data.path;
            
            // Load video in player
            const previewContainer = document.getElementById('video-preview-container');
            previewContainer.classList.remove('hidden');
            
            videoElement.src = '/video_stream?path=' + encodeURIComponent(data.path);
            videoElement.load();
            
            // Reset state
            storyTimestamps = [];
            renderTimestamps();
        }
    } catch (err) {
        console.error("Failed to open file dialog", err);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderTimestamps() {
    frameCount.textContent = storyTimestamps.length;
    
    if (storyTimestamps.length === 0) {
        timestampsList.innerHTML = '<span style="color: #94a3b8; font-size: 0.85rem;">No frames marked yet.</span>';
        return;
    }
    
    // Sort timestamps
    storyTimestamps.sort((a, b) => a - b);
    
    timestampsList.innerHTML = '';
    storyTimestamps.forEach((t, index) => {
        const tag = document.createElement('div');
        tag.style.background = 'var(--primary)';
        tag.style.color = 'white';
        tag.style.padding = '3px 8px';
        tag.style.borderRadius = '4px';
        tag.style.fontSize = '0.85rem';
        tag.style.display = 'flex';
        tag.style.alignItems = 'center';
        tag.style.gap = '5px';
        
        tag.innerHTML = `
            ${formatTime(t)}
            <span style="cursor:pointer; font-weight:bold;" onclick="removeTimestamp(${index})">&times;</span>
        `;
        timestampsList.appendChild(tag);
    });
}

function addCurrentFrame() {
    if (!videoElement.src) {
        alert('Please select a video first.');
        return;
    }
    
    const currentTime = videoElement.currentTime;
    if (!storyTimestamps.includes(currentTime)) {
        storyTimestamps.push(currentTime);
        renderTimestamps();
    }
}

function removeTimestamp(index) {
    storyTimestamps.splice(index, 1);
    renderTimestamps();
}

function autoMarkFrames() {
    if (!videoElement.src || isNaN(videoElement.duration)) {
        alert('Please select a video and let it load first.');
        return;
    }
    
    const interval = parseFloat(document.getElementById('auto_mark_sec').value);
    if (isNaN(interval) || interval <= 0) {
        alert('Please enter a valid interval.');
        return;
    }
    
    const duration = videoElement.duration;
    let t = 0;
    while (t <= duration) {
        if (!storyTimestamps.includes(t)) {
            storyTimestamps.push(t);
        }
        t += interval;
    }
    
    renderTimestamps();
}

// Storyboard Form Submission
document.getElementById('storyboard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const video_path = document.getElementById('story_video_file').value;
    const output_folder = document.getElementById('story_output_folder').value;
    const columns = document.getElementById('grid_columns').value;
    
    const btn = document.getElementById('story-process-btn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.loader');
    const statusMsg = document.getElementById('status-message');

    if (storyTimestamps.length === 0) {
        alert('Please mark at least one frame.');
        return;
    }

    updateStatus(btn, btnText, loader, statusMsg, true);

    try {
        const response = await fetch('/generate_grid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                video_path, 
                output_folder, 
                timestamps: storyTimestamps,
                columns
            })
        });

        const data = await response.json();
        updateStatus(btn, btnText, loader, statusMsg, false, response.ok, data.message || (response.ok ? "Done" : "An error occurred"));
    } catch (err) {
        updateStatus(btn, btnText, loader, statusMsg, false, false, "Failed to connect to the server.");
    }
});
