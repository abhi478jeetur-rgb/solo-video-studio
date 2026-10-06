import os
import glob
import json
import subprocess
import shutil
import re

VIDEO_EXTENSIONS = ('.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv')
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff')
AUDIO_EXTENSIONS = ('.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus', '.webm')

def is_video_file(filename):
    return filename.lower().endswith(VIDEO_EXTENSIONS)

def is_image_file(filename):
    return filename.lower().endswith(IMAGE_EXTENSIONS)

def is_audio_file(filename):
    return filename.lower().endswith(AUDIO_EXTENSIONS)

def find_audio_files(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return []
    
    matched = []
    try:
        for entry in os.scandir(folder_path):
            if entry.is_file() and (is_audio_file(entry.name) or is_video_file(entry.name)):
                matched.append(entry.path)
    except Exception:
        pass
    return sorted(matched)

def find_video_files(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return []
    
    matched = []
    try:
        for entry in os.scandir(folder_path):
            if entry.is_file() and is_video_file(entry.name):
                matched.append(entry.path)
    except Exception:
        pass
    return sorted(matched)

def find_image_files(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return []
    
    matched = []
    try:
        for entry in os.scandir(folder_path):
            if entry.is_file() and is_image_file(entry.name):
                matched.append(entry.path)
    except Exception:
        pass
    return sorted(matched)

def get_video_dimensions(video_path):
    """Returns (width, height) of the video stream."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json', video_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        stream = data.get('streams', [{}])[0]
        return int(stream.get('width', 1080)), int(stream.get('height', 1920))
    except Exception:
        return 1080, 1920

def get_video_duration(video_path):
    """Returns float duration in seconds."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 0.0

def format_bytes(size_in_bytes):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_in_bytes < 1024.0:
            return f"{size_in_bytes:.1f} {unit}"
        size_in_bytes /= 1024.0
    return f"{size_in_bytes:.1f} TB"

def format_seconds(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def check_ffmpeg():
    if shutil.which('ffmpeg') is not None and shutil.which('ffprobe') is not None:
        return True
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
        return shutil.which('ffmpeg') is not None and shutil.which('ffprobe') is not None
    except Exception:
        return False

def get_audio_metadata(file_path):
    """Returns dictionary of audio format, duration, channels, sample_rate, bitrate."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'stream=codec_name,channels,sample_rate,bit_rate:format=duration,size,format_name',
            '-of', 'json', file_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        
        streams = data.get('streams', [])
        audio_stream = next((s for s in streams if s.get('codec_name')), {})
        fmt = data.get('format', {})
        
        dur = float(fmt.get('duration', 0.0) or 0.0)
        size = int(fmt.get('size', 0) or 0)
        channels = int(audio_stream.get('channels', 2) or 2)
        sample_rate = int(audio_stream.get('sample_rate', 44100) or 44100)
        bit_rate = int(audio_stream.get('bit_rate', 0) or fmt.get('bit_rate', 0) or 0)
        codec = audio_stream.get('codec_name', 'unknown')
        
        return {
            "duration": dur,
            "duration_formatted": format_seconds(dur),
            "size": format_bytes(size),
            "raw_size": size,
            "channels": "Stereo" if channels == 2 else ("Mono" if channels == 1 else f"{channels}ch"),
            "sample_rate": f"{sample_rate // 1000} kHz" if sample_rate >= 1000 else f"{sample_rate} Hz",
            "bitrate": f"{bit_rate // 1000} kbps" if bit_rate > 0 else "320 kbps (est)",
            "codec": codec.upper()
        }
    except Exception:
        dur = get_video_duration(file_path)
        size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        return {
            "duration": dur,
            "duration_formatted": format_seconds(dur),
            "size": format_bytes(size),
            "raw_size": size,
            "channels": "Stereo",
            "sample_rate": "44.1 kHz",
            "bitrate": "Standard",
            "codec": "AUDIO"
        }

def detect_silence_segments(audio_path, noise_db=-36, min_duration=0.3):
    """
    Runs ffmpeg silencedetect to identify all silent gaps.
    Returns:
      {
        'segments': [{'start': float, 'end': float, 'duration': float}],
        'total_silence': float,
        'count': int,
        'total_duration': float
      }
    """
    total_dur = get_video_duration(audio_path)
    if total_dur <= 0:
        return {'segments': [], 'total_silence': 0.0, 'count': 0, 'total_duration': 0.0}
        
    cmd = [
        'ffmpeg', '-i', audio_path,
        '-af', f'silencedetect=noise={noise_db}dB:d={min_duration}',
        '-f', 'null', '-'
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True)
        lines = res.stderr.splitlines()
        
        silences = []
        current_start = None
        for line in lines:
            m_start = re.search(r'silence_start:\s*([\d\.\-]+)', line)
            if m_start:
                try:
                    current_start = max(0.0, float(m_start.group(1)))
                except ValueError:
                    pass
            m_end = re.search(r'silence_end:\s*([\d\.\-]+)\s*\|\s*silence_duration:\s*([\d\.\-]+)', line)
            if m_end:
                try:
                    s_end = min(total_dur, float(m_end.group(1)))
                    s_dur = float(m_end.group(2))
                    s_start = current_start if current_start is not None else max(0.0, s_end - s_dur)
                    silences.append({
                        'start': round(s_start, 2),
                        'end': round(s_end, 2),
                        'duration': round(s_dur, 2)
                    })
                except ValueError:
                    pass
                current_start = None
                
        # Check if file ends in silence
        if current_start is not None and current_start < total_dur:
            s_dur = total_dur - current_start
            if s_dur >= min_duration:
                silences.append({
                    'start': round(current_start, 2),
                    'end': round(total_dur, 2),
                    'duration': round(s_dur, 2)
                })

        total_silence = sum(s['duration'] for s in silences)
        return {
            'segments': silences,
            'total_silence': round(total_silence, 2),
            'count': len(silences),
            'total_duration': round(total_dur, 2)
        }
    except Exception as e:
        return {'segments': [], 'total_silence': 0.0, 'count': 0, 'total_duration': total_dur, 'error': str(e)}
