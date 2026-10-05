import os
import subprocess
import urllib.parse
from flask import Blueprint, request, jsonify
from core.config import INPUT_DIR, OUTPUT_DIR
from core.utils import find_video_files, get_video_duration, format_bytes, format_seconds

splitter_bp = Blueprint('splitter', __name__, url_prefix='/api/splitter')

def get_folder_clips(output_folder, filter_prefix=None):
    if not os.path.exists(output_folder):
        return []
    videos = find_video_files(output_folder)
    clips = []
    for v in videos:
        basename = os.path.basename(v)
        if filter_prefix and not basename.startswith(filter_prefix):
            continue
        try:
            stat = os.stat(v)
            dur = get_video_duration(v)
            encoded_path = urllib.parse.quote(v)
            clips.append({
                "name": basename,
                "path": v,
                "size": format_bytes(stat.st_size),
                "duration": format_seconds(dur) if dur > 0 else "--:--",
                "stream_url": f"/api/preview/stream?path={encoded_path}",
                "download_url": f"/api/preview/download?path={encoded_path}",
                "mtime": stat.st_mtime
            })
        except Exception:
            pass
    # Sort latest modified or alphabetical
    clips.sort(key=lambda x: x['mtime'], reverse=True)
    return clips

@splitter_bp.route('/info', methods=['POST'])
def get_info():
    data = request.json or {}
    input_folder = data.get('input_folder', '').strip() or INPUT_DIR
    duration = float(data.get('duration', 10) or 10)
    
    if not os.path.exists(input_folder):
        return jsonify({"success": False, "message": f"Input folder does not exist: {input_folder}"}), 400
        
    videos = find_video_files(input_folder)
    if not videos:
        return jsonify({
            "success": True,
            "count": 0,
            "total_size": "0 B",
            "parts": 0,
            "message": "No video files found in folder"
        })
        
    total_bytes = 0
    total_parts = 0
    
    for v in videos:
        try:
            total_bytes += os.path.getsize(v)
            dur = get_video_duration(v)
            if dur > 0:
                parts = int(dur // duration)
                if dur % duration > 0.05:
                    parts += 1
                total_parts += max(1, parts)
            else:
                total_parts += 1
        except Exception:
            pass
            
    return jsonify({
        "success": True,
        "count": len(videos),
        "total_size": format_bytes(total_bytes),
        "parts": total_parts,
        "files": [os.path.basename(v) for v in videos]
    })

@splitter_bp.route('/clips', methods=['GET'])
def get_clips():
    output_folder = request.args.get('output_folder', '').strip() or OUTPUT_DIR
    prefix = request.args.get('prefix', '').strip()
    clips = get_folder_clips(output_folder, filter_prefix=prefix if prefix else None)
    return jsonify({
        "success": True,
        "clips": clips,
        "count": len(clips)
    })

@splitter_bp.route('/process', methods=['POST'])
def process_split():
    data = request.json or {}
    duration = float(data.get('duration', 10) or 10)
    prefix = data.get('prefix', 'Part').strip() or 'Part'
    input_folder = data.get('input_folder', '').strip() or INPUT_DIR
    output_folder = data.get('output_folder', '').strip() or OUTPUT_DIR
    compression = data.get('compression', '23')

    if not os.path.exists(input_folder):
        return jsonify({"success": False, "message": f"Input folder not found: {input_folder}"}), 400
        
    video_files = find_video_files(input_folder)
    if not video_files:
        return jsonify({"success": False, "message": f"No video files found in '{input_folder}'"}), 400

    os.makedirs(output_folder, exist_ok=True)
    processed_count = 0

    try:
        for idx, video_file in enumerate(video_files):
            # Clean safe naming pattern
            if len(video_files) > 1:
                base_title = os.path.splitext(os.path.basename(video_file))[0]
                output_pattern = os.path.join(output_folder, f"{prefix}_{base_title}_part_%03d.mp4")
            else:
                output_pattern = os.path.join(output_folder, f"{prefix}_part_%03d.mp4")

            command = [
                'ffmpeg', '-y',
                '-i', video_file,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', str(compression),
                '-c:a', 'copy',
                '-force_key_frames', f'expr:gte(t,n_forced*{duration})',
                '-map', '0',
                '-segment_time', str(duration),
                '-f', 'segment',
                '-reset_timestamps', '1',
                '-segment_start_number', '1',
                output_pattern
            ]

            res = subprocess.run(command, capture_output=True, text=True)
            if res.returncode != 0:
                return jsonify({
                    "success": False,
                    "message": f"Error splitting '{os.path.basename(video_file)}'",
                    "details": res.stderr
                }), 500
                
            processed_count += 1

        # Fetch all generated clips for instant preview
        clips = get_folder_clips(output_folder, filter_prefix=prefix)
        if not clips:
            # Fallback to all clips in output folder
            clips = get_folder_clips(output_folder)

        return jsonify({
            "success": True,
            "message": f"Successfully split {processed_count} video(s) into {len(clips)} clip(s).",
            "output_folder": output_folder,
            "clips": clips
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"Processing failed: {str(e)}"}), 500
