import os
import sys
import subprocess
import string
from flask import Blueprint, request, jsonify
from core.config import BASE_DIR, INPUT_DIR, OUTPUT_DIR
from core.utils import is_video_file, is_audio_file, format_bytes

fs_bp = Blueprint('fs', __name__, url_prefix='/api/fs')

def get_drives():
    drives = []
    for letter in string.ascii_uppercase:
        drive_path = f"{letter}:\\"
        if os.path.exists(drive_path):
            drives.append({"name": f"Local Disk ({letter}:)", "path": drive_path})
    return drives

def get_quick_locations():
    home = os.path.expanduser("~")
    locations = [
        {"name": "Project Input Folder", "path": INPUT_DIR, "icon": "folder-input"},
        {"name": "Project Output Folder", "path": OUTPUT_DIR, "icon": "folder-output"},
        {"name": "Desktop", "path": os.path.join(home, "Desktop"), "icon": "monitor"},
        {"name": "Videos", "path": os.path.join(home, "Videos"), "icon": "video"},
        {"name": "Downloads", "path": os.path.join(home, "Downloads"), "icon": "download"},
        {"name": "User Home", "path": home, "icon": "home"},
    ]
    return [loc for loc in locations if os.path.exists(loc["path"])]

@fs_bp.route('/quick-locations', methods=['GET'])
def quick_locations():
    return jsonify({
        "success": True,
        "quick": get_quick_locations(),
        "drives": get_drives()
    })

@fs_bp.route('/list', methods=['GET'])
def list_directory():
    req_path = request.args.get('path', '').strip()
    include_files = request.args.get('include_files', 'true').lower() == 'true'
    
    if not req_path:
        req_path = BASE_DIR
        
    if not os.path.exists(req_path):
        return jsonify({
            "success": False,
            "message": f"Path does not exist: {req_path}",
            "current_path": req_path
        }), 404

    req_path = os.path.abspath(req_path)
    parent_path = os.path.dirname(req_path) if os.path.dirname(req_path) != req_path else None
    
    directories = []
    video_files = []
    
    try:
        with os.scandir(req_path) as entries:
            for entry in entries:
                try:
                    if entry.name.startswith('.'):
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        directories.append({
                            "name": entry.name,
                            "path": entry.path,
                            "type": "folder"
                        })
                    elif include_files and entry.is_file(follow_symlinks=False):
                        if is_video_file(entry.name):
                            stat = entry.stat()
                            video_files.append({
                                "name": entry.name,
                                "path": entry.path,
                                "type": "video",
                                "size": format_bytes(stat.st_size),
                                "raw_size": stat.st_size
                            })
                        elif is_audio_file(entry.name):
                            stat = entry.stat()
                            video_files.append({
                                "name": entry.name,
                                "path": entry.path,
                                "type": "audio",
                                "size": format_bytes(stat.st_size),
                                "raw_size": stat.st_size
                            })
                except PermissionError:
                    continue
    except PermissionError:
        return jsonify({"success": False, "message": "Permission denied accessing folder."}), 403
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

    directories.sort(key=lambda x: x['name'].lower())
    video_files.sort(key=lambda x: x['name'].lower())

    return jsonify({
        "success": True,
        "current_path": req_path,
        "parent_path": parent_path,
        "directories": directories,
        "video_files": video_files,
        "total_videos": len(video_files)
    })

@fs_bp.route('/check-path', methods=['POST'])
def check_path():
    data = request.json or {}
    path = data.get('path', '').strip()
    target_type = data.get('type', 'folder') # 'folder' or 'file'

    if not path:
        return jsonify({"valid": False, "message": "Path is empty"})

    if not os.path.exists(path):
        return jsonify({"valid": False, "message": "Path not found on disk"})

    if target_type == 'folder':
        if not os.path.isdir(path):
            return jsonify({"valid": False, "message": "Specified path is not a folder"})
        
        # Count videos in folder
        videos = []
        try:
            for f in os.scandir(path):
                if f.is_file() and is_video_file(f.name):
                    videos.append(f)
        except Exception:
            pass
        return jsonify({
            "valid": True,
            "type": "folder",
            "video_count": len(videos),
            "message": f"Valid folder ({len(videos)} video{'s' if len(videos) != 1 else ''} found)"
        })
    else:
        if not os.path.isfile(path):
            return jsonify({"valid": False, "message": "Specified path is not a file"})
        return jsonify({
            "valid": True,
            "type": "file",
            "size": format_bytes(os.path.getsize(path)),
            "message": "Valid video file selected"
        })

@fs_bp.route('/native-browse', methods=['POST'])
def native_browse():
    """Launches the native OS dialog safely via sys.executable with a timeout."""
    data = request.json or {}
    mode = data.get('mode', 'folder')
    initial_dir = data.get('initial_dir', BASE_DIR)

    script_path = os.path.join(os.path.dirname(__file__), 'native_dialog.py')
    cmd = [sys.executable, script_path, mode, initial_dir]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        selected_path = res.stdout.strip()
        if selected_path:
            return jsonify({"success": True, "path": selected_path})
        return jsonify({"success": False, "message": "Dialog cancelled or no selection made"})
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "message": "Dialog timed out after 45 seconds"}), 408
    except Exception as e:
        return jsonify({"success": False, "message": f"Could not launch native dialog: {str(e)}"}), 500
