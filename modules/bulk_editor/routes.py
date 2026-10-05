import os
import json
import subprocess
import threading
import uuid
import time
import urllib.parse
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from core.config import UPLOAD_DIR, INPUT_DIR, OUTPUT_DIR
from core.utils import find_video_files, get_video_dimensions, format_bytes

bulk_bp = Blueprint('bulk_editor', __name__, url_prefix='/api/bulk')

# Global jobs store
BULK_JOBS = {}
JOBS_LOCK = threading.Lock()

def get_folder_videos(output_folder):
    if not os.path.exists(output_folder):
        return []
    videos = find_video_files(output_folder)
    items = []
    for v in videos:
        try:
            stat = os.stat(v)
            encoded_path = urllib.parse.quote(v)
            items.append({
                "name": os.path.basename(v),
                "path": v,
                "size": format_bytes(stat.st_size),
                "stream_url": f"/api/preview/stream?path={encoded_path}",
                "download_url": f"/api/preview/download?path={encoded_path}",
                "mtime": stat.st_mtime
            })
        except Exception:
            pass
    items.sort(key=lambda x: x['mtime'], reverse=True)
    return items

def run_bulk_worker(job_id, input_folder, output_folder, logo_path, logo_pos, remove_dola, remove_gemini=False, custom_delogo=None):
    video_files = find_video_files(input_folder)
    total = len(video_files)
    
    pos_map = {
        'top-left': '20:20',
        'top-right': 'main_w-overlay_w-20:20',
        'bottom-left': '20:main_h-overlay_h-20',
        'bottom-right': 'main_w-overlay_w-20:main_h-overlay_h-20',
        'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2'
    }
    overlay_coords = pos_map.get(logo_pos, '20:20')

    with JOBS_LOCK:
        BULK_JOBS[job_id]['total'] = total
        BULK_JOBS[job_id]['status'] = 'running'

    for idx, video_file in enumerate(video_files):
        filename = os.path.basename(video_file)
        with JOBS_LOCK:
            BULK_JOBS[job_id]['current_index'] = idx + 1
            BULK_JOBS[job_id]['current_file'] = filename
            BULK_JOBS[job_id]['percent'] = int((idx / total) * 100)

        output_file = os.path.join(output_folder, f"edited_{filename}")

        try:
            filters = []
            w, h = get_video_dimensions(video_file)
            
            # Preset 1: Dola AI Watermarks (3 zones)
            if remove_dola:
                box_w = max(10, int(w * 0.25))
                box_h = max(10, int(h * 0.05))
                x1, y1 = int(w * 0.73), int(h * 0.92)
                x2, y2 = int(w * 0.05), int(h * 0.46)
                x3, y3 = int(w * 0.73), int(h * 0.04)
                filters.append(f"delogo=x={x1}:y={y1}:w={box_w}:h={box_h}")
                filters.append(f"delogo=x={x2}:y={y2}:w={box_w}:h={box_h}")
                filters.append(f"delogo=x={x3}:y={y3}:w={box_w}:h={box_h}")

            # Preset 2: Gemini / Google Video Watermark (Bottom-Right corner)
            if remove_gemini:
                g_w = max(16, int(w * 0.14))
                g_h = max(16, int(h * 0.08))
                gx = max(0, int(w * 0.84))
                gy = max(0, int(h * 0.90))
                filters.append(f"delogo=x={gx}:y={gy}:w={g_w}:h={g_h}")

            # Custom Visual Canvas Delogo region & optional time range
            if custom_delogo and isinstance(custom_delogo, dict):
                boxes = custom_delogo.get('boxes', [])
                t_start = custom_delogo.get('time_start')
                t_end = custom_delogo.get('time_end')
                
                time_filter = ""
                if t_start is not None and t_end is not None and float(t_end) > float(t_start):
                    time_filter = f":enable='between(t,{float(t_start)},{float(t_end)})'"
                
                for b in boxes:
                    bx = float(b.get('x', 0))
                    by = float(b.get('y', 0))
                    bw = float(b.get('w', 0))
                    bh = float(b.get('h', 0))
                    
                    if bx > 1.0 or by > 1.0 or bw > 1.0 or bh > 1.0:
                        if bx <= 100 and by <= 100:
                            bx /= 100.0
                            by /= 100.0
                            bw /= 100.0
                            bh /= 100.0
                            
                    if bx <= 1.0 and by <= 1.0:
                        dx = max(0, int(bx * w))
                        dy = max(0, int(by * h))
                        dw = min(w - dx, max(8, int(bw * w)))
                        dh = min(h - dy, max(8, int(bh * h)))
                    else:
                        dx = max(0, int(bx))
                        dy = max(0, int(by))
                        dw = min(w - dx, max(8, int(bw)))
                        dh = min(h - dy, max(8, int(bh)))
                        
                    filters.append(f"delogo=x={dx}:y={dy}:w={dw}:h={dh}{time_filter}")

            filter_complex = ""
            if logo_path:
                if filters:
                    video_filter_chain = ",".join(filters)
                    filter_complex = f"[0:v]{video_filter_chain}[bg];[bg][1:v]overlay={overlay_coords}[outv]"
                else:
                    filter_complex = f"[0:v][1:v]overlay={overlay_coords}[outv]"
            else:
                if filters:
                    filter_complex = f"[0:v]{','.join(filters)}[outv]"

            command = ['ffmpeg', '-y', '-i', video_file]
            if logo_path:
                command.extend(['-i', logo_path])
            if filter_complex:
                command.extend(['-filter_complex', filter_complex, '-map', '[outv]', '-map', '0:a?'])
            else:
                command.extend(['-map', '0:v', '-map', '0:a?'])
                
            command.extend(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'copy', output_file])

            res = subprocess.run(command, capture_output=True, text=True)
            if res.returncode == 0 and os.path.exists(output_file):
                stat = os.stat(output_file)
                encoded = urllib.parse.quote(output_file)
                with JOBS_LOCK:
                    BULK_JOBS[job_id]['completed_files'].append({
                        "name": os.path.basename(output_file),
                        "path": output_file,
                        "size": format_bytes(stat.st_size),
                        "stream_url": f"/api/preview/stream?path={encoded}",
                        "download_url": f"/api/preview/download?path={encoded}",
                        "mtime": stat.st_mtime
                    })
            else:
                err_msg = res.stderr or "FFmpeg encoding error"
                with JOBS_LOCK:
                    BULK_JOBS[job_id]['errors'].append({
                        "file": filename,
                        "error": err_msg[-300:] if len(err_msg) > 300 else err_msg
                    })

        except Exception as e:
            with JOBS_LOCK:
                BULK_JOBS[job_id]['errors'].append({
                    "file": filename,
                    "error": str(e)
                })

    with JOBS_LOCK:
        BULK_JOBS[job_id]['percent'] = 100
        BULK_JOBS[job_id]['status'] = 'completed' if len(BULK_JOBS[job_id]['completed_files']) > 0 else 'failed'
        BULK_JOBS[job_id]['message'] = f"Completed {len(BULK_JOBS[job_id]['completed_files'])} of {total} videos."

@bulk_bp.route('/start', methods=['POST'])
def start_bulk_job():
    input_folder = request.form.get('input_folder', '').strip() or INPUT_DIR
    output_folder = request.form.get('output_folder', '').strip() or OUTPUT_DIR
    logo_pos = request.form.get('logo_pos', 'top-left')
    remove_dola = request.form.get('remove_dola') == 'yes'
    remove_gemini = request.form.get('remove_gemini') == 'yes'
    
    custom_delogo_raw = request.form.get('custom_delogo', '').strip()
    custom_delogo = None
    if custom_delogo_raw:
        try:
            custom_delogo = json.loads(custom_delogo_raw)
        except Exception:
            pass

    if not os.path.exists(input_folder):
        return jsonify({"success": False, "message": f"Input folder not found: {input_folder}"}), 400

    video_files = find_video_files(input_folder)
    if not video_files:
        return jsonify({"success": False, "message": f"No video files found in '{input_folder}'"}), 400

    os.makedirs(output_folder, exist_ok=True)

    logo_path = None
    if 'logo' in request.files:
        logo_file = request.files['logo']
        if logo_file and logo_file.filename:
            filename = secure_filename(logo_file.filename)
            logo_path = os.path.join(UPLOAD_DIR, filename)
            logo_file.save(logo_path)

    job_id = str(uuid.uuid4())
    with JOBS_LOCK:
        BULK_JOBS[job_id] = {
            "status": "queued",
            "percent": 0,
            "total": len(video_files),
            "current_index": 0,
            "current_file": "",
            "completed_files": [],
            "errors": [],
            "message": "Initializing...",
            "output_folder": output_folder,
            "created_at": time.time()
        }

    thread = threading.Thread(
        target=run_bulk_worker,
        args=(job_id, input_folder, output_folder, logo_path, logo_pos, remove_dola, remove_gemini, custom_delogo),
        daemon=True
    )
    thread.start()

    return jsonify({
        "success": True,
        "job_id": job_id,
        "total": len(video_files),
        "message": f"Bulk job started for {len(video_files)} videos."
    })

@bulk_bp.route('/status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    with JOBS_LOCK:
        job = BULK_JOBS.get(job_id)
        if not job:
            return jsonify({"success": False, "message": "Job not found"}), 404
        return jsonify({
            "success": True,
            **job
        })

@bulk_bp.route('/videos', methods=['GET'])
def get_videos():
    output_folder = request.args.get('output_folder', '').strip() or OUTPUT_DIR
    videos = get_folder_videos(output_folder)
    return jsonify({
        "success": True,
        "videos": videos,
        "count": len(videos)
    })

@bulk_bp.route('/process', methods=['POST'])
def process_bulk():
    return start_bulk_job()
