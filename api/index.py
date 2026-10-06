import os
import sys

# Add project root to sys.path so modules and core can be imported
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import app

# Vercel Serverless Function entry point
# Vercel's Python runtime invokes the WSGI callable named 'app'
