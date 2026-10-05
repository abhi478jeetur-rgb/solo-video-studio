import os
import re
import urllib.parse
import subprocess
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename

from core.config import BASE_DIR, INPUT_DIR, OUTPUT_DIR, UPLOAD_DIR, VOICE_DIR
from core.utils import (
    find_audio_files,
    is_audio_file,
    is_video_file,
    get_video_duration,
    get_audio_metadata,
    detect_silence_segments,
    format_bytes,
    format_seconds
)

voice_cleaner_bp = Blueprint('voice_cleaner', __name__, url_prefix='/api/voice_cleaner')

ALLOWED_EXTENSIONS = {
    '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus', '.webm',
    '.mp4', '.mov', '.mkv', '.avi'
}

def is_allowed_file(filename):
    _, ext = os.path.splitext(filename)
    return ext.lower() in ALLOWED_EXTENSIONS

@voice_cleaner_bp.route('/upload', methods=['POST'])
def upload_voice():
    """Receives uploaded voice/audio file and saves it to uploads/voices."""
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "No file attached to upload request."}), 400
        
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({"success": False, "message": "No file selected."}), 400

    filename = secure_filename(file.filename)
    if not filename:
        filename = "recording.mp3"
        
    _, ext = os.path.splitext(filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return jsonify({
            "success": False, 
            "message": f"Unsupported format '{ext}'. Supported: MP3, WAV, M4A, AAC, FLAC, OGG, WEBM, MP4."
        }), 400

    # Avoid name collision
    target_path = os.path.join(VOICE_DIR, filename)
    base_name, file_ext = os.path.splitext(filename)
    counter = 1
    while os.path.exists(target_path):
        target_path = os.path.join(VOICE_DIR, f"{base_name}_{counter}{file_ext}")
        counter += 1

    try:
        file.save(target_path)
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to save file: {str(e)}"}), 500

    # Probe metadata
    meta = get_audio_metadata(target_path)
    encoded_path = urllib.parse.quote(target_path)

    return jsonify({
        "success": True,
        "filename": os.path.basename(target_path),
        "path": target_path,
        "size": meta.get("size", "0 MB"),
        "raw_size": meta.get("raw_size", 0),
        "duration": meta.get("duration", 0.0),
        "duration_formatted": meta.get("duration_formatted", "00:00"),
        "channels": meta.get("channels", "Stereo"),
        "sample_rate": meta.get("sample_rate", "44.1 kHz"),
        "bitrate": meta.get("bitrate", "320 kbps"),
        "codec": meta.get("codec", "AUDIO"),
        "stream_url": f"/api/preview/audio?path={encoded_path}",
        "download_url": f"/api/preview/download?path={encoded_path}"
    })

@voice_cleaner_bp.route('/analyze', methods=['POST'])
def analyze_voice():
    """Runs silence detection on audio file and returns detailed gap metrics and segment timeline."""
    data = request.json or {}
    path = data.get('path', '').strip()
    
    if not path or not os.path.isfile(path):
        return jsonify({"success": False, "message": f"Audio file not found: {path}"}), 404

    try:
        noise_db = float(data.get('noise_db', -36))
    except (ValueError, TypeError):
        noise_db = -36.0

    try:
        min_duration = float(data.get('min_duration', 0.35))
    except (ValueError, TypeError):
        min_duration = 0.35

    try:
        padding = float(data.get('padding', 0.08))
    except (ValueError, TypeError):
        padding = 0.08

    result = detect_silence_segments(path, noise_db=noise_db, min_duration=min_duration)
    total_dur = result.get('total_duration', 0.0)
    total_silence = result.get('total_silence', 0.0)
    count = result.get('count', 0)
    
    # Estimate cleaned length: speech time + (count * padding)
    speech_duration = max(0.0, total_dur - total_silence)
    estimated_clean = min(total_dur, speech_duration + (count * padding))
    time_saved = max(0.0, total_dur - estimated_clean)
    pct_reduction = round((time_saved / total_dur) * 100, 1) if total_dur > 0 else 0.0

    meta = get_audio_metadata(path)

    return jsonify({
        "success": True,
        "filename": os.path.basename(path),
        "path": path,
        "total_duration": total_dur,
        "total_duration_formatted": format_seconds(total_dur),
        "silence_gaps_count": count,
        "total_silence_seconds": total_silence,
        "total_silence_formatted": format_seconds(total_silence),
        "speech_seconds": round(speech_duration, 2),
        "estimated_duration": round(estimated_clean, 2),
        "estimated_duration_formatted": format_seconds(estimated_clean),
        "time_saved_seconds": round(time_saved, 2),
        "time_saved_formatted": format_seconds(time_saved),
        "reduction_percent": pct_reduction,
        "segments": result.get('segments', []),
        "meta": meta
    })

@voice_cleaner_bp.route('/process', methods=['POST'])
def process_voice():
    """
    Removes dead silence gaps while preserving pristine audio quality.
    Supports MP3 (320kbps), Lossless WAV, or M4A/AAC output formats.
    """
    data = request.json or {}
    input_path = data.get('input_path', '').strip()
    output_folder = data.get('output_folder', '').strip() or OUTPUT_DIR
    
    if not input_path or not os.path.isfile(input_path):
        return jsonify({"success": False, "message": f"Input voice file not found: {input_path}"}), 404

    os.makedirs(output_folder, exist_ok=True)

    # Parameters
    try:
        noise_db = float(data.get('noise_db', -36))
    except (ValueError, TypeError):
        noise_db = -36.0

    try:
        min_duration = float(data.get('min_duration', 0.35))
    except (ValueError, TypeError):
        min_duration = 0.35

    try:
        padding = float(data.get('padding', 0.08))
    except (ValueError, TypeError):
        padding = 0.08

    output_format = str(data.get('output_format', 'mp3')).lower().strip()
    if output_format not in ['mp3', 'wav', 'm4a']:
        output_format = 'mp3'

    normalize = bool(data.get('normalize', False))
    highpass = bool(data.get('highpass', False))

    orig_dur = get_video_duration(input_path)

    # Determine output file name
    base_name, _ = os.path.splitext(os.path.basename(input_path))
    clean_filename = f"{base_name}_cleaned.{output_format}"
    output_path = os.path.join(output_folder, clean_filename)

    # Avoid overwriting
    counter = 1
    while os.path.exists(output_path):
        output_path = os.path.join(output_folder, f"{base_name}_cleaned_{counter}.{output_format}")
        counter += 1

    # Build audio filter graph
    filters = []
    if highpass:
        # High-pass filter removes sub-60Hz air conditioner hum, table thumps, wind rumble
        filters.append("highpass=f=60")

    # Silence remove filter:
    # Trims start silence and middle silence gaps with safety cushion padding
    silence_filter = (
        f"silenceremove="
        f"start_periods=1:start_duration=0.01:start_threshold={noise_db}dB:"
        f"stop_periods=-1:stop_duration={min_duration}:stop_threshold={noise_db}dB:"
        f"stop_silence={padding}"
    )
    filters.append(silence_filter)

    if normalize:
        # EBU R128 loudness normalization for broadcast-ready voice volume
        filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")

    filter_complex = ",".join(filters)

    # High-fidelity encoding configuration
    cmd = ['ffmpeg', '-y', '-i', input_path, '-af', filter_complex]

    if output_format == 'wav':
        # Studio Master 16-bit PCM uncompressed
        cmd.extend(['-c:a', 'pcm_s16le'])
    elif output_format == 'm4a':
        # High quality AAC 320kbps
        cmd.extend(['-c:a', 'aac', '-b:a', '320k'])
    else:
        # MP3 Studio 320kbps with LAME psychoacoustic tuning
        cmd.extend(['-c:a', 'libmp3lame', '-b:a', '320k', '-q:a', '0'])

    cmd.append(output_path)

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr or str(e)
        return jsonify({
            "success": False,
            "message": "FFmpeg audio processing failed.",
            "details": err_msg[-800:] if len(err_msg) > 800 else err_msg
        }), 500

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        return jsonify({
            "success": False,
            "message": "Processed file was not created or audio was completely silent."
        }), 500

    clean_dur = get_video_duration(output_path)
    clean_stat = os.stat(output_path)
    time_saved = max(0.0, orig_dur - clean_dur)
    pct_reduction = round((time_saved / orig_dur) * 100, 1) if orig_dur > 0 else 0.0

    encoded_clean_path = urllib.parse.quote(output_path)
    encoded_orig_path = urllib.parse.quote(input_path)

    return jsonify({
        "success": True,
        "filename": os.path.basename(output_path),
        "output_path": output_path,
        "size": format_bytes(clean_stat.st_size),
        "raw_size": clean_stat.st_size,
        "original_duration": round(orig_dur, 2),
        "original_duration_formatted": format_seconds(orig_dur),
        "cleaned_duration": round(clean_dur, 2),
        "cleaned_duration_formatted": format_seconds(clean_dur),
        "time_saved_seconds": round(time_saved, 2),
        "time_saved_formatted": format_seconds(time_saved),
        "reduction_percent": pct_reduction,
        "stream_url": f"/api/preview/audio?path={encoded_clean_path}",
        "download_url": f"/api/preview/download?path={encoded_clean_path}",
        "original_stream_url": f"/api/preview/audio?path={encoded_orig_path}"
    })

@voice_cleaner_bp.route('/batch', methods=['POST'])
def batch_process():
    """Batch clean silence gaps from all audio files in a folder."""
    data = request.json or {}
    input_folder = data.get('input_folder', '').strip() or INPUT_DIR
    output_folder = data.get('output_folder', '').strip() or OUTPUT_DIR

    if not os.path.isdir(input_folder):
        return jsonify({"success": False, "message": f"Input folder not found: {input_folder}"}), 404

    os.makedirs(output_folder, exist_ok=True)

    try:
        noise_db = float(data.get('noise_db', -36))
    except (ValueError, TypeError):
        noise_db = -36.0

    try:
        min_duration = float(data.get('min_duration', 0.35))
    except (ValueError, TypeError):
        min_duration = 0.35

    try:
        padding = float(data.get('padding', 0.08))
    except (ValueError, TypeError):
        padding = 0.08

    output_format = str(data.get('output_format', 'mp3')).lower().strip()
    if output_format not in ['mp3', 'wav', 'm4a']:
        output_format = 'mp3'

    normalize = bool(data.get('normalize', False))
    highpass = bool(data.get('highpass', False))

    audio_files = find_audio_files(input_folder)
    if not audio_files:
        return jsonify({
            "success": False,
            "message": f"No audio or video files found in folder: {input_folder}"
        }), 400

    results = []
    total_orig_time = 0.0
    total_clean_time = 0.0
    success_count = 0

    filters = []
    if highpass:
        filters.append("highpass=f=60")
    silence_filter = (
        f"silenceremove="
        f"start_periods=1:start_duration=0.01:start_threshold={noise_db}dB:"
        f"stop_periods=-1:stop_duration={min_duration}:stop_threshold={noise_db}dB:"
        f"stop_silence={padding}"
    )
    filters.append(silence_filter)
    if normalize:
        filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    filter_complex = ",".join(filters)

    for file_path in audio_files:
        try:
            orig_dur = get_video_duration(file_path)
            total_orig_time += orig_dur

            base_name, _ = os.path.splitext(os.path.basename(file_path))
            out_filename = f"{base_name}_cleaned.{output_format}"
            out_path = os.path.join(output_folder, out_filename)

            c = 1
            while os.path.exists(out_path):
                out_path = os.path.join(output_folder, f"{base_name}_cleaned_{c}.{output_format}")
                c += 1

            cmd = ['ffmpeg', '-y', '-i', file_path, '-af', filter_complex]
            if output_format == 'wav':
                cmd.extend(['-c:a', 'pcm_s16le'])
            elif output_format == 'm4a':
                cmd.extend(['-c:a', 'aac', '-b:a', '320k'])
            else:
                cmd.extend(['-c:a', 'libmp3lame', '-b:a', '320k', '-q:a', '0'])
            cmd.append(out_path)

            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode == 0 and os.path.exists(out_path):
                clean_dur = get_video_duration(out_path)
                total_clean_time += clean_dur
                success_count += 1
                encoded = urllib.parse.quote(out_path)
                results.append({
                    "original_name": os.path.basename(file_path),
                    "cleaned_name": os.path.basename(out_path),
                    "output_path": out_path,
                    "original_duration": format_seconds(orig_dur),
                    "cleaned_duration": format_seconds(clean_dur),
                    "time_saved": format_seconds(max(0.0, orig_dur - clean_dur)),
                    "stream_url": f"/api/preview/audio?path={encoded}",
                    "download_url": f"/api/preview/download?path={encoded}",
                    "status": "success"
                })
            else:
                results.append({
                    "original_name": os.path.basename(file_path),
                    "status": "error",
                    "error": proc.stderr[-200:] if proc.stderr else "Unknown FFmpeg error"
                })
        except Exception as ex:
            results.append({
                "original_name": os.path.basename(file_path),
                "status": "error",
                "error": str(ex)
            })

    total_saved = max(0.0, total_orig_time - total_clean_time)
    pct = round((total_saved / total_orig_time) * 100, 1) if total_orig_time > 0 else 0.0

    return jsonify({
        "success": True,
        "processed_count": success_count,
        "total_files": len(audio_files),
        "total_original_time": format_seconds(total_orig_time),
        "total_cleaned_time": format_seconds(total_clean_time),
        "total_time_saved": format_seconds(total_saved),
        "overall_reduction_percent": pct,
        "results": results
    })

@voice_cleaner_bp.route('/scan-folder', methods=['POST'])
def scan_folder():
    """Scans input folder for audio and voice files."""
    data = request.json or {}
    folder = data.get('folder', '').strip() or INPUT_DIR
    
    if not os.path.isdir(folder):
        return jsonify({"success": False, "message": f"Folder not found: {folder}"}), 404

    files = find_audio_files(folder)
    total_size = sum(os.path.getsize(f) for f in files if os.path.exists(f))
    
    return jsonify({
        "success": True,
        "count": len(files),
        "total_size": format_bytes(total_size),
        "files": [{"name": os.path.basename(f), "path": f, "size": format_bytes(os.path.getsize(f))} for f in files[:20]]
    })
