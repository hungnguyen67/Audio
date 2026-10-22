import os
from pathlib import Path

ROOT = Path(__file__).parents[3].resolve()
FRONTEND_ROOT = ROOT / "frontend" / "dist"
if not FRONTEND_ROOT.exists():
    FRONTEND_ROOT = ROOT / "frontend"

VOICE = "vi-VN-HoaiMyNeural"
EDGE_VOICES = {
    "edge:vi-VN-HoaiMyNeural": "vi-VN-HoaiMyNeural",
    "edge:vi-VN-NamMinhNeural": "vi-VN-NamMinhNeural",
}

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("DB_PORT", "3306")),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", "123456"),
    "database": os.environ.get("DB_NAME", "audio_story"),
}
