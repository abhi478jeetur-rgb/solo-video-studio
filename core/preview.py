import os
import mimetypes
import subprocess
from flask import Blueprint, request, jsonify, send_file, abort, Response

preview_bp = Blueprint('preview', __name__, url_prefix='/api/preview')

@preview_bp.route('/stream', methods=['GET'])
@preview_bp.route('/audio', methods=['GET'])
def stream_media():
    path = request.args.get('path', '').strip()
    if not path or not os.path.isfile(path):
        return "Media file not found", 404
        
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        ext = os.path.splitext(path)[1].lower()
        if ext == '.mp3':
            mime_type = 'audio/mpeg'
        elif ext == '.wav':
            mime_type = 'audio/wav'
        elif ext in ('.m4a', '.aac'):
            mime_type = 'audio/mp4'
        elif ext == '.ogg':
            mime_type = 'audio/ogg'
        elif ext in ('.webm',):
            mime_type = 'audio/webm'
        else:
            mime_type = 'video/mp4'
        
    return send_file(path, mimetype=mime_type, conditional=True)

@preview_bp.route('/image', methods=['GET'])
def view_image():
    path = request.args.get('path', '').strip()
    if not path or not os.path.isfile(path):
        return "Image file not found", 404
        
    mime_type, _ = mimetypes.guess_type(path)
    return send_file(path, mimetype=mime_type or 'image/jpeg', conditional=True)

@preview_bp.route('/download', methods=['GET'])
def download_file():
    path = request.args.get('path', '').strip()
    if not path or not os.path.isfile(path):
        return "File not found", 404
        
    filename = os.path.basename(path)
    return send_file(path, as_attachment=True, download_name=filename)

@preview_bp.route('/frame', methods=['GET'])
def get_video_frame():
    """Extracts a single frame at a specific timestamp for canvas preview and watermark picking."""
    path = request.args.get('path', '').strip()
    t = request.args.get('t', '0').strip()
    if not path or not os.path.isfile(path):
        return "Video file not found", 404
        
    cmd = [
        'ffmpeg', '-ss', str(t), '-i', path,
        '-vframes', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return Response(proc.stdout, mimetype='image/jpeg')
    except Exception as e:
        return jsonify({"error": str(e)}), 500
