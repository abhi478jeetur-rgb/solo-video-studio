import os
import sys
from flask import Flask, render_template, jsonify, request, redirect, url_for
from flask_cors import CORS

from core.config import BASE_DIR, INPUT_DIR, OUTPUT_DIR, UPLOAD_DIR
from core.utils import check_ffmpeg
from core.fs import fs_bp
from core.preview import preview_bp
from modules.splitter import splitter_bp
from modules.bulk_editor import bulk_bp
from modules.storyboard import storyboard_bp
from modules.image_cleaner import image_cleaner_bp
from modules.voice_cleaner import voice_cleaner_bp

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    app.config['UPLOAD_FOLDER'] = UPLOAD_DIR
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024 # 500 MB max request
    
    # Register Modular Blueprints
    app.register_blueprint(fs_bp)
    app.register_blueprint(preview_bp)
    app.register_blueprint(splitter_bp)
    app.register_blueprint(bulk_bp)
    app.register_blueprint(storyboard_bp)
    app.register_blueprint(image_cleaner_bp)
    app.register_blueprint(voice_cleaner_bp)
    
    # Main Dashboard Route
    @app.route('/')
    def index():
        ffmpeg_ok = check_ffmpeg()
        return render_template(
            'index.html',
            ffmpeg_ok=ffmpeg_ok,
            default_input=INPUT_DIR,
            default_output=OUTPUT_DIR
        )

    # Status / Health API
    @app.route('/api/status', methods=['GET'])
    def app_status():
        return jsonify({
            "status": "online",
            "ffmpeg": check_ffmpeg(),
            "python_executable": sys.executable,
            "base_dir": BASE_DIR,
            "input_dir": INPUT_DIR,
            "output_dir": OUTPUT_DIR
        })

    # Legacy Backward-Compatibility Handlers
    @app.route('/select_folder', methods=['GET'])
    def legacy_select_folder():
        from core.fs import native_browse
        return native_browse()

    @app.route('/select_file', methods=['GET'])
    def legacy_select_file():
        # Inject mode='file' for backward compat
        request.json = {'mode': 'file'}
        from core.fs import native_browse
        return native_browse()

    @app.route('/video_stream')
    def legacy_video_stream():
        path = request.args.get('path')
        return redirect(url_for('storyboard.stream_video', path=path))

    @app.route('/video_info', methods=['POST'])
    def legacy_video_info():
        from modules.splitter.routes import get_info
        return get_info()

    @app.route('/process', methods=['POST'])
    def legacy_process():
        from modules.splitter.routes import process_split
        return process_split()

    @app.route('/process_bulk', methods=['POST'])
    def legacy_process_bulk():
        from modules.bulk_editor.routes import process_bulk
        return process_bulk()

    @app.route('/generate_grid', methods=['POST'])
    def legacy_generate_grid():
        from modules.storyboard.routes import generate_storyboard
        return generate_storyboard()

    # Global Error Handlers
    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith('/api/'):
            return jsonify({"success": False, "error": "Endpoint not found"}), 404
        return render_template('index.html', error="Page not found"), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "details": str(e)
        }), 500

    return app

app = create_app()

if __name__ == '__main__':
    print("[INFO] Video Studio Pro (Solo Theme) starting...")
    print(f"[INFO] Base Dir: {BASE_DIR}")
    print(f"[INFO] Python: {sys.executable}")
    print(f"[INFO] FFmpeg installed: {check_ffmpeg()}")
    print("[INFO] Local URL:   http://localhost:5000")
    print("[INFO] Network URL: http://0.0.0.0:5000 (accessible on Phone/LAN via your PC's IP)")
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
