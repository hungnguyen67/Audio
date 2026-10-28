import asyncio
import threading

import edge_tts

from app.core.config import EDGE_VOICES, VOICE

EDGE_TTS_RECEIVE_TIMEOUT_SECONDS = 120
EDGE_TTS_REQUEST_LOCK = threading.Lock()


def _synthesize_text_blocking(text, edge_voice_name, progress_callback=None):
    with EDGE_TTS_REQUEST_LOCK:
        communicator = edge_tts.Communicate(
            text,
            edge_voice_name,
            receive_timeout=EDGE_TTS_RECEIVE_TIMEOUT_SECONDS,
        )
        chunks = []
        for chunk in communicator.stream_sync():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
                if progress_callback:
                    progress_callback(len(chunk["data"]))
        return b"".join(chunks)


async def synthesize_text(text, voice=None, progress_callback=None):
    selected_voice = voice or f"edge:{VOICE}"
    edge_voice_name = EDGE_VOICES.get(selected_voice, VOICE if selected_voice == VOICE else None)
    if not edge_voice_name:
        raise RuntimeError("Chỉ hỗ trợ giọng Hoài My.")

    return await asyncio.to_thread(_synthesize_text_blocking, text, edge_voice_name, progress_callback)
