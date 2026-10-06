import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IS_VERCEL = bool(os.environ.get('VERCEL'))

if IS_VERCEL:
    STORAGE_ROOT = '/tmp/solo_studio'
    INPUT_DIR = os.path.join(STORAGE_ROOT, 'input')
    OUTPUT_DIR = os.path.join(STORAGE_ROOT, 'output')
    UPLOAD_DIR = os.path.join(STORAGE_ROOT, 'uploads')
    TEMP_DIR = os.path.join(STORAGE_ROOT, 'temp')
    VOICE_DIR = os.path.join(STORAGE_ROOT, 'voices')
else:
    INPUT_DIR = os.path.join(BASE_DIR, 'input')
    OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
    UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
    TEMP_DIR = os.path.join(UPLOAD_DIR, 'temp')
    VOICE_DIR = os.path.join(UPLOAD_DIR, 'voices')

# Ensure critical directories exist
for directory in [INPUT_DIR, OUTPUT_DIR, UPLOAD_DIR, TEMP_DIR, VOICE_DIR]:
    try:
        os.makedirs(directory, exist_ok=True)
    except Exception as e:
        print(f"[WARN] Could not create {directory}: {e}")
