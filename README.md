# Solo Video Studio — Creator AI Multi-Tool Suite

<div align="center">

![Solo Video Studio Banner](https://img.shields.io/badge/Solo-Video%20Studio-E95722?style=for-the-badge&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.9+-blue.svg?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-Web%20Engine-black.svg?style=for-the-badge&logo=flask&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-Ultra--Fast-green.svg?style=for-the-badge&logo=ffmpeg&logoColor=white)

**A high-performance local AI studio for content creators: 10s video splitter, bulk watermark cleaner, AI image inpainting, voice silence cleaner, and storyboard creator.**

</div>

---

## 🚀 Key Modules & Features

### 1. 🎙️ Voice & Audio Silence Cleaner *(New)*
- **Zero Quality Loss**: Export in pristine **Studio Master Lossless WAV (PCM)**, **Ultra MP3 (320 kbps)**, or **M4A / AAC (320 kbps)**.
- **Smart Silence & Gap Removal**: Automatically removes dead air and long pauses between speech where nothing is spoken.
- **Voice Cushion Padding**: Preserves natural breath pauses (default 80ms) so words and pronunciation are never clipped.
- **3 Speed Presets**:
  - 🎯 **Natural Flow (Recommended)**: Smooth conversational pacing with breath margins.
  - ⚡ **Jump-Cut Fast**: Ultra-tight pacing for Reels, Shorts, and TikTok.
  - 🎙️ **Relaxed Studio**: Cleans only long hesitations, ideal for podcasts.
- **Dual Before/After Audio Player**: Interactive timeline visualizer with waveform bars, live gap statistics, playback speed controls (1.0x, 1.25x, 1.5x), and 1-click download.
- **Batch Processing**: Clean entire folders of voice recordings in one click.

### 2. ✂️ Video Segment Splitter
- Automatically splits long videos into precise 10-second (or custom duration) clips ready for Shorts, Reels, and TikTok.
- Lossless video stream copying or high-quality CRF compression.

### 3. 🎬 Bulk Video Watermark & Logo Editor
- Batch removes AI watermarks (3-zone watermark interpolation algorithm).
- Overlay custom brand logos across full folders of video content with position presets.

### 4. ✨ Image Watermark Studio
- **Auto Gemini Watermark Removal**: 1-click bulk removal of Google Gemini sparkle watermarks.
- **Interactive Canvas Brush**: Paint custom masks or draw bounding boxes to erase unwanted elements using Telea Navier-Stokes inpainting.

### 5. 🖼️ Storyboard Creator
- Generates high-resolution multi-frame contact sheets and preview grids from video files.

---

## 🛠️ Prerequisites

1. **Python 3.9+** installed on your system.
2. **FFmpeg & FFprobe**:
   - Ensure `ffmpeg` and `ffprobe` are installed and available in your system `PATH`.
   - On Windows, install via winget:
     ```powershell
     winget install Gyan.FFmpeg
     ```

---

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/abhi478jeetur-rgb/solo-video-studio.git
   cd solo-video-studio
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the application**:
   - **On Windows (Quick Start)**: Double-click `run.bat` or run:
     ```bash
     .\run.bat
     ```
   - **Direct Python**:
     ```bash
     python app.py
     ```

5. Open your browser and navigate to:
   ```
   http://127.0.0.1:5000
   ```

---

## 📁 Project Structure

```
solo-video-studio/
├── app.py                     # Main Flask application entry point
├── core/                      # Core configuration, filesystem, and utilities
│   ├── config.py              # Directory paths & global config
│   ├── fs.py                  # File explorer & drive scanner API
│   ├── preview.py             # Audio/video streaming & downloads
│   └── utils.py               # FFmpeg helpers, silence detection, metadata
├── modules/                   # Feature blueprints
│   ├── voice_cleaner/         # Silence removal & audio enhancement
│   ├── splitter/              # 10s video segment splitter
│   ├── bulk_editor/           # Watermark removal & logo overlay
│   ├── image_cleaner/         # Image inpainting & watermark studio
│   └── storyboard/            # Storyboard grid generator
├── static/                    # CSS stylesheets and modular JS controllers
├── templates/                 # Jinja2 HTML templates & tab components
├── requirements.txt           # Python dependencies
└── run.bat                    # One-click Windows launcher
```

---

## 📄 License

MIT License. Free for personal and commercial use.
