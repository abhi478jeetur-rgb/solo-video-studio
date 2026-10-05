import os
import cv2
import numpy as np
import base64
import threading
import uuid
import time
import io
import urllib.parse
from flask import Blueprint, request, jsonify, send_file, Response
from werkzeug.utils import secure_filename
from PIL import Image

from core.config import UPLOAD_DIR, INPUT_DIR, OUTPUT_DIR
from core.utils import find_image_files, format_bytes
from core.overlay_generator import generate_header_card, composite_overlay_on_image

image_cleaner_bp = Blueprint('image_cleaner', __name__, url_prefix='/api/image_cleaner')

# Global background jobs dictionary
IMAGE_JOBS = {}
IMAGE_JOBS_LOCK = threading.Lock()

def read_image_safe(file_path):
    """Safely reads an image using numpy to handle Windows unicode paths."""
    try:
        data = np.fromfile(file_path, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
        return img
    except Exception as e:
        print(f"Error reading image {file_path}: {e}")
        return None

def write_image_safe(img, output_path):
    """Safely writes an image using numpy to handle Windows unicode paths."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        ext = os.path.splitext(output_path)[1].lower()
        if not ext:
            ext = '.png'
            output_path += ext
        success, encoded = cv2.imencode(ext, img)
        if success:
            encoded.tofile(output_path)
            return True
        return False
    except Exception as e:
        print(f"Error writing image {output_path}: {e}")
        return False

def image_to_base64(img, ext='.jpg'):
    """Encodes cv2 image to base64 data URL."""
    try:
        success, encoded = cv2.imencode(ext, img)
        if success:
            b64 = base64.b64encode(encoded).decode('utf-8')
            mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'
            return f"data:{mime};base64,{b64}"
    except Exception:
        pass
    return None

def pil_to_base64(pil_img, format='PNG'):
    """Encodes PIL image to base64 data URL."""
    try:
        buf = io.BytesIO()
        pil_img.save(buf, format=format)
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        mime = 'image/png' if format == 'PNG' else 'image/jpeg'
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None

def decode_base64_mask(b64_str, target_w, target_h):
    """Decodes a base64 brush mask drawn on frontend canvas and scales to target image size."""
    try:
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
        mask_bytes = base64.b64decode(b64_str)
        nparr = np.frombuffer(mask_bytes, np.uint8)
        mask_img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        # If alpha channel present, use alpha as mask
        if mask_img.shape[2] == 4:
            alpha = mask_img[:, :, 3]
            resized_mask = cv2.resize(alpha, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
            _, binary_mask = cv2.threshold(resized_mask, 10, 255, cv2.THRESH_BINARY)
            return binary_mask
        else:
            gray = cv2.cvtColor(mask_img, cv2.COLOR_BGR2GRAY)
            resized_mask = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
            _, binary_mask = cv2.threshold(resized_mask, 10, 255, cv2.THRESH_BINARY)
            return binary_mask
    except Exception as e:
        print(f"Error decoding base64 mask: {e}")
        return None

def build_gemini_watermark_mask(h, w):
    """Creates an inpainting mask for the Google Gemini watermark at bottom-right corner."""
    mask = np.zeros((h, w), dtype=np.uint8)
    box_w = max(24, int(w * 0.085))
    box_h = max(24, int(h * 0.085))
    pad_right = max(10, int(w * 0.02))
    pad_bottom = max(10, int(h * 0.02))
    
    x1 = max(0, w - box_w - pad_right)
    y1 = max(0, h - box_h - pad_bottom)
    x2 = min(w, w - pad_right + 5)
    y2 = min(h, h - pad_bottom + 5)
    
    cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask

def build_custom_boxes_mask(h, w, boxes):
    """Builds mask from user-defined bounding boxes on canvas."""
    mask = np.zeros((h, w), dtype=np.uint8)
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
            x1 = max(0, int(bx * w))
            y1 = max(0, int(by * h))
            x2 = min(w, int((bx + bw) * w))
            y2 = min(h, int((by + bh) * h))
        else:
            x1 = max(0, int(bx))
            y1 = max(0, int(by))
            x2 = min(w, int(bx + bw))
            y2 = min(h, int(by + bh))
            
        cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
        
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask

def inpaint_image(img, mask):
    """Performs Telea inpainting on BGR/BGRA image."""
    h, w = img.shape[:2]
    has_alpha = (img.ndim == 3 and img.shape[2] == 4)
    if has_alpha:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr = img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        alpha = None
        
    cleaned_bgr = cv2.inpaint(bgr, mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)
    
    if has_alpha:
        cleaned = cv2.merge([cleaned_bgr[:, :, 0], cleaned_bgr[:, :, 1], cleaned_bgr[:, :, 2], alpha])
        return cleaned
    return cleaned_bgr

def apply_social_stamp(cv_img, stamp_config):
    """Composites the social header stamp onto cv_img according to stamp_config."""
    if not stamp_config or not stamp_config.get('enabled'):
        return cv_img

    try:
        # Convert CV2 image to PIL Image (RGBA)
        if cv_img.ndim == 3 and cv_img.shape[2] == 4:
            pil_img = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGRA2RGBA))
        else:
            pil_img = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)).convert('RGBA')

        header_card = generate_header_card(
            logo_path=stamp_config.get('logo_path'),
            display_name=stamp_config.get('display_name', 'Solo Vibe'),
            handle=stamp_config.get('handle', '@solovibecode'),
            template=stamp_config.get('template', 'classic_card'),
            ring_color=stamp_config.get('ring_color', '#FF6B00'),
            bg_style=stamp_config.get('bg_style', '#000000'),
            text_color=stamp_config.get('text_color', '#FFFFFF'),
            handle_color=stamp_config.get('handle_color', '#71767B'),
            show_verified=stamp_config.get('show_verified', True),
            scale=float(stamp_config.get('scale', 1.0))
        )

        pos = stamp_config.get('position', 'top-center')
        coords = stamp_config.get('coords')

        stamped = composite_overlay_on_image(pil_img, header_card, position=pos, custom_coords=coords)

        # Convert back to CV2 format
        stamped_np = np.array(stamped)
        if cv_img.ndim == 3 and cv_img.shape[2] == 4:
            return cv2.cvtColor(stamped_np, cv2.COLOR_RGBA2BGRA)
        else:
            return cv2.cvtColor(stamped_np, cv2.COLOR_RGBA2BGR)
    except Exception as e:
        print(f"Error applying stamp: {e}")
        return cv_img

# --- Header Badge Generation API ---
@image_cleaner_bp.route('/generate_header', methods=['POST'])
def api_generate_header():
    """Generates the Reels Header card and returns data URL or direct file download."""
    try:
        data = request.json or {}
        download = request.args.get('download') == '1' or data.get('download')

        header_card = generate_header_card(
            logo_path=data.get('logo_path'),
            display_name=data.get('display_name', 'Solo Vibe'),
            handle=data.get('handle', '@solovibecode'),
            template=data.get('template', 'classic_card'),
            ring_color=data.get('ring_color', '#FF6B00'),
            bg_style=data.get('bg_style', '#000000'),
            text_color=data.get('text_color', '#FFFFFF'),
            handle_color=data.get('handle_color', '#71767B'),
            show_verified=data.get('show_verified', True),
            scale=float(data.get('scale', 1.0))
        )

        if download:
            buf = io.BytesIO()
            header_card.save(buf, format='PNG')
            buf.seek(0)
            return send_file(buf, mimetype='image/png', as_attachment=True, download_name='reels-header.png')

        b64 = pil_to_base64(header_card, 'PNG')
        return jsonify({
            "success": True,
            "data_url": b64,
            "width": header_card.width,
            "height": header_card.height
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@image_cleaner_bp.route('/upload_logo', methods=['POST'])
def api_upload_logo():
    """Uploads a channel profile logo for the header badge."""
    if 'logo' not in request.files:
        return jsonify({"success": False, "error": "No logo file provided"}), 400
    file = request.files['logo']
    if not file or not file.filename:
        return jsonify({"success": False, "error": "Empty filename"}), 400
        
    filename = f"logo_{int(time.time())}_{secure_filename(file.filename)}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    save_path = os.path.join(UPLOAD_DIR, filename)
    file.save(save_path)
    
    return jsonify({
        "success": True,
        "path": save_path,
        "filename": filename
    })

# --- Preview Endpoint ---
@image_cleaner_bp.route('/preview', methods=['POST'])
def preview_inpaint():
    """Returns Before and After images for interactive preview (with optional social header stamp)."""
    try:
        data = request.json or {}
        image_path = data.get('image_path')
        mode = data.get('mode', 'gemini_auto')
        boxes = data.get('boxes', [])
        brush_mask_b64 = data.get('brush_mask')
        stamp_config = data.get('stamp_config')
        
        if not image_path or not os.path.isfile(image_path):
            return jsonify({"success": False, "error": f"Image file not found: {image_path}"}), 400
            
        img = read_image_safe(image_path)
        if img is None:
            return jsonify({"success": False, "error": "Failed to decode image"}), 400
            
        h, w = img.shape[:2]
        
        # Build mask according to mode
        if mode == 'gemini_auto':
            mask = build_gemini_watermark_mask(h, w)
        elif mode == 'brush_mask' and brush_mask_b64:
            mask = decode_base64_mask(brush_mask_b64, w, h)
            if mask is None:
                mask = build_gemini_watermark_mask(h, w)
        elif mode == 'custom_boxes' and boxes:
            mask = build_custom_boxes_mask(h, w, boxes)
        else:
            mask = build_gemini_watermark_mask(h, w)
            
        cleaned = inpaint_image(img, mask)

        # Apply social header stamp if enabled
        if stamp_config and stamp_config.get('enabled'):
            cleaned = apply_social_stamp(cleaned, stamp_config)
        
        # Scale preview for speed if huge
        max_dim = 1280
        if max(h, w) > max_dim:
            scale = max_dim / float(max(h, w))
            preview_orig = cv2.resize(img, (int(w * scale), int(h * scale)))
            preview_clean = cv2.resize(cleaned, (int(w * scale), int(h * scale)))
        else:
            preview_orig = img
            preview_clean = cleaned
            
        orig_b64 = image_to_base64(preview_orig, '.jpg')
        clean_b64 = image_to_base64(preview_clean, '.jpg')
        
        return jsonify({
            "success": True,
            "width": w,
            "height": h,
            "before": orig_b64,
            "after": clean_b64
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# --- Bulk Image Processing Worker ---
def run_bulk_images_worker(job_id, input_folder, output_folder, mode, boxes, brush_mask_b64, stamp_config=None):
    """Background worker for batch cleaning images and applying custom brand stamp."""
    try:
        image_files = find_image_files(input_folder)
        total = len(image_files)
        
        with IMAGE_JOBS_LOCK:
            IMAGE_JOBS[job_id]['total'] = total
            IMAGE_JOBS[job_id]['status'] = 'running'
            
        if total == 0:
            with IMAGE_JOBS_LOCK:
                IMAGE_JOBS[job_id]['status'] = 'completed'
                IMAGE_JOBS[job_id]['message'] = 'No image files found in input directory'
            return

        os.makedirs(output_folder, exist_ok=True)

        # Pre-generate header card if stamp enabled to avoid recreating per file
        header_card = None
        if stamp_config and stamp_config.get('enabled'):
            try:
                header_card = generate_header_card(
                    logo_path=stamp_config.get('logo_path'),
                    display_name=stamp_config.get('display_name', 'Solo Vibe'),
                    handle=stamp_config.get('handle', '@solovibecode'),
                    template=stamp_config.get('template', 'classic_card'),
                    ring_color=stamp_config.get('ring_color', '#FF6B00'),
                    bg_style=stamp_config.get('bg_style', '#000000'),
                    text_color=stamp_config.get('text_color', '#FFFFFF'),
                    handle_color=stamp_config.get('handle_color', '#71767B'),
                    show_verified=stamp_config.get('show_verified', True),
                    scale=float(stamp_config.get('scale', 1.0))
                )
            except Exception as e:
                print(f"Error pre-generating header card: {e}")
        
        for idx, img_path in enumerate(image_files):
            filename = os.path.basename(img_path)
            with IMAGE_JOBS_LOCK:
                IMAGE_JOBS[job_id]['current_index'] = idx + 1
                IMAGE_JOBS[job_id]['current_file'] = filename
                IMAGE_JOBS[job_id]['percent'] = int((idx / total) * 100)
                
            try:
                img = read_image_safe(img_path)
                if img is None:
                    continue
                    
                h, w = img.shape[:2]
                
                # Inpaint watermark
                if mode == 'gemini_auto':
                    mask = build_gemini_watermark_mask(h, w)
                elif mode == 'brush_mask' and brush_mask_b64:
                    mask = decode_base64_mask(brush_mask_b64, w, h)
                    if mask is None:
                        mask = build_gemini_watermark_mask(h, w)
                elif mode == 'custom_boxes' and boxes:
                    mask = build_custom_boxes_mask(h, w, boxes)
                else:
                    mask = build_gemini_watermark_mask(h, w)
                    
                cleaned = inpaint_image(img, mask)

                # Composite brand stamp if enabled
                if header_card:
                    if cleaned.ndim == 3 and cleaned.shape[2] == 4:
                        pil_img = Image.fromarray(cv2.cvtColor(cleaned, cv2.COLOR_BGRA2RGBA))
                    else:
                        pil_img = Image.fromarray(cv2.cvtColor(cleaned, cv2.COLOR_BGR2RGB)).convert('RGBA')

                    pos = stamp_config.get('position', 'top-center')
                    coords = stamp_config.get('coords')
                    stamped_pil = composite_overlay_on_image(pil_img, header_card, position=pos, custom_coords=coords)

                    stamped_np = np.array(stamped_pil)
                    if cleaned.ndim == 3 and cleaned.shape[2] == 4:
                        cleaned = cv2.cvtColor(stamped_np, cv2.COLOR_RGBA2BGRA)
                    else:
                        cleaned = cv2.cvtColor(stamped_np, cv2.COLOR_RGBA2BGR)
                
                # Output filename
                base_name, ext = os.path.splitext(filename)
                out_name = f"clean_{base_name}{ext}"
                out_path = os.path.join(output_folder, out_name)
                
                write_image_safe(cleaned, out_path)
            except Exception as e:
                print(f"Error processing {img_path}: {e}")
                
        with IMAGE_JOBS_LOCK:
            IMAGE_JOBS[job_id]['status'] = 'completed'
            IMAGE_JOBS[job_id]['percent'] = 100
            IMAGE_JOBS[job_id]['current_file'] = 'Finished processing all images'
            
    except Exception as e:
        with IMAGE_JOBS_LOCK:
            IMAGE_JOBS[job_id]['status'] = 'error'
            IMAGE_JOBS[job_id]['error'] = str(e)

@image_cleaner_bp.route('/process_bulk', methods=['POST'])
def process_bulk_images():
    """Starts background bulk watermark removal job with optional brand stamp."""
    data = request.json or {}
    input_folder = data.get('input_folder', '').strip()
    output_folder = data.get('output_folder', '').strip()
    mode = data.get('mode', 'gemini_auto')
    boxes = data.get('boxes', [])
    brush_mask_b64 = data.get('brush_mask')
    stamp_config = data.get('stamp_config')
    
    if not input_folder or not os.path.isdir(input_folder):
        return jsonify({"success": False, "error": f"Invalid input folder: '{input_folder}'"}), 400
        
    if not output_folder:
        output_folder = OUTPUT_DIR
        
    image_files = find_image_files(input_folder)
    if not image_files:
        return jsonify({"success": False, "error": "No valid image files (.jpg, .png, .webp, .bmp) found in input folder"}), 400
        
    job_id = str(uuid.uuid4())
    with IMAGE_JOBS_LOCK:
        IMAGE_JOBS[job_id] = {
            "status": "queued",
            "percent": 0,
            "total": len(image_files),
            "current_index": 0,
            "current_file": "Initializing...",
            "input_folder": input_folder,
            "output_folder": output_folder,
            "error": None
        }
        
    thread = threading.Thread(
        target=run_bulk_images_worker,
        args=(job_id, input_folder, output_folder, mode, boxes, brush_mask_b64, stamp_config),
        daemon=True
    )
    thread.start()
    
    return jsonify({
        "success": True,
        "job_id": job_id,
        "total_files": len(image_files),
        "message": f"Queued {len(image_files)} images for processing"
    })

@image_cleaner_bp.route('/status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    with IMAGE_JOBS_LOCK:
        job = IMAGE_JOBS.get(job_id)
        if not job:
            return jsonify({"success": False, "error": "Job not found"}), 404
        return jsonify({"success": True, "job": job})

@image_cleaner_bp.route('/gallery', methods=['GET'])
def get_gallery():
    """Lists processed images in output folder."""
    folder = request.args.get('folder', OUTPUT_DIR)
    if not os.path.exists(folder):
        return jsonify({"success": True, "images": []})
        
    image_files = find_image_files(folder)
    items = []
    for f in image_files:
        try:
            stat = os.stat(f)
            encoded = urllib.parse.quote(f)
            items.append({
                "name": os.path.basename(f),
                "path": f,
                "size": format_bytes(stat.st_size),
                "stream_url": f"/api/preview/stream?path={encoded}",
                "download_url": f"/api/preview/download?path={encoded}",
                "mtime": stat.st_mtime
            })
        except Exception:
            pass
            
    items.sort(key=lambda x: x['mtime'], reverse=True)
    return jsonify({"success": True, "images": items})
