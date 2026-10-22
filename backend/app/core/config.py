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
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "123456",
    "database": "audio_story",
}
