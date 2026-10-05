import os
import math
import glob
import subprocess
from flask import Blueprint, request, jsonify, send_file
from PIL import Image, ImageDraw, ImageFont
from core.config import TEMP_DIR, OUTPUT_DIR
from core.utils import format_seconds

storyboard_bp = Blueprint('storyboard', __name__, url_prefix='/api/storyboard')

@storyboard_bp.route('/stream', methods=['GET'])
def stream_video():
    path = request.args.get('path', '').strip()
    if not path or not os.path.isfile(path):
        return "Video file not found", 404
    return send_file(path, conditional=True)

@storyboard_bp.route('/generate', methods=['POST'])
def generate_storyboard():
    data = request.json or {}
    video_path = data.get('video_path', '').strip()
    output_folder = data.get('output_folder', '').strip() or OUTPUT_DIR
    timestamps = data.get('timestamps', [])
    columns = int(data.get('columns', 5))

    if not video_path or not os.path.isfile(video_path):
        return jsonify({"success": False, "message": "Valid video file path required."}), 400
    if not timestamps:
        return jsonify({"success": False, "message": "At least one timestamp frame must be selected."}), 400

    os.makedirs(output_folder, exist_ok=True)
    frames_temp = os.path.join(TEMP_DIR, 'storyboard_frames')
    os.makedirs(frames_temp, exist_ok=True)

    # Clean old frames in temp
    for f in glob.glob(os.path.join(frames_temp, '*.jpg')):
        try:
            os.remove(f)
        except Exception:
            pass

    timestamps = sorted(list(set(timestamps)))
    extracted_frames = []

    try:
        for i, t in enumerate(timestamps):
            out_frame = os.path.join(frames_temp, f"f_{i:04d}.jpg")
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(t),
                '-i', video_path,
                '-vframes', '1',
                '-q:v', '2',
                out_frame
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0 and os.path.exists(out_frame):
                extracted_frames.append((out_frame, t, i + 1))

        if not extracted_frames:
            return jsonify({"success": False, "message": "Could not extract video frames."}), 500

        # Load and badge images with PIL
        images = []
        for frame_file, t_sec, idx in extracted_frames:
            img = Image.open(frame_file).convert('RGB')
            draw = ImageDraw.Draw(img)

            mins = int(t_sec // 60)
            secs = int(t_sec % 60)
            label = f"#{idx:02d}  {mins:02d}:{secs:02d}"

            # Calculate adaptive font size
            font_size = max(18, int(img.height * 0.045))
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), label, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            pad_x, pad_y = 12, 8

            # Modern rounded tag background
            badge_bg = (17, 17, 17, 210) # Ink black overlay
            draw.rectangle(
                [10, 10, 10 + text_w + pad_x * 2, 10 + text_h + pad_y * 2],
                fill=badge_bg[:3]
            )
            # Accent color bar on left of label
            draw.rectangle([10, 10, 14, 10 + text_h + pad_y * 2], fill=(233, 87, 34)) # SOLO Orange
            draw.text((10 + pad_x, 10 + pad_y), label, fill=(247, 235, 221), font=font) # Warm Cream

            images.append(img)

        # Assemble grid
        first_w, first_h = images[0].size
        rows = math.ceil(len(images) / columns)
        gap = 8
        header_h = 70

        total_w = (first_w * columns) + (gap * (columns + 1))
        total_h = header_h + (first_h * rows) + (gap * (rows + 1))

        grid_canvas = Image.new('RGB', (total_w, total_h), color=(26, 26, 26))
        draw_grid = ImageDraw.Draw(grid_canvas)

        # Header title
        title_text = f"Storyboard: {os.path.basename(video_path)} ({len(images)} Frames)"
        try:
            h_font = ImageFont.truetype("arial.ttf", 24)
        except Exception:
            h_font = ImageFont.load_default()
        draw_grid.text((gap + 10, 22), title_text, fill=(247, 235, 221), font=h_font)

        # Paste frames
        for i, img in enumerate(images):
            r = i // columns
            c = i % columns
            x = gap + c * (first_w + gap)
            y = header_h + gap + r * (first_h + gap)
            grid_canvas.paste(img, (x, y))

        base_name = os.path.splitext(os.path.basename(video_path))[0]
        out_filename = f"Storyboard_{base_name}.jpg"
        final_output_path = os.path.join(output_folder, out_filename)
        grid_canvas.save(final_output_path, quality=95)

        # Cleanup temp frames
        for frame_file, _, _ in extracted_frames:
            try:
                os.remove(frame_file)
            except Exception:
                pass

        import urllib.parse
        encoded_path = urllib.parse.quote(final_output_path)

        return jsonify({
            "success": True,
            "message": f"Storyboard successfully generated: {out_filename}",
            "file_path": final_output_path,
            "filename": out_filename,
            "image_url": f"/api/preview/image?path={encoded_path}",
            "download_url": f"/api/preview/download?path={encoded_path}",
            "output_folder": output_folder,
            "frames_count": len(images)
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"Storyboard generation error: {str(e)}"}), 500
