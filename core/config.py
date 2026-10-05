import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INPUT_DIR = os.path.join(BASE_DIR, 'input')
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
TEMP_DIR = os.path.join(UPLOAD_DIR, 'temp')
VOICE_DIR = os.path.join(UPLOAD_DIR, 'voices')

# Ensure critical directories exist
for directory in [INPUT_DIR, OUTPUT_DIR, UPLOAD_DIR, TEMP_DIR, VOICE_DIR]:
    os.makedirs(directory, exist_ok=True)
