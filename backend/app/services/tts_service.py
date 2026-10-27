import edge_tts

from app.core.config import EDGE_VOICES, VOICE

EDGE_TTS_RECEIVE_TIMEOUT_SECONDS = 120


async def synthesize_text(text, voice=None, progress_callback=None):
    selected_voice = voice or f"edge:{VOICE}"
    edge_voice_name = EDGE_VOICES.get(selected_voice, VOICE if selected_voice == VOICE else None)
    if not edge_voice_name:
        raise RuntimeError("Chỉ hỗ trợ giọng Hoài My.")

    communicator = edge_tts.Communicate(
        text,
        edge_voice_name,
        receive_timeout=EDGE_TTS_RECEIVE_TIMEOUT_SECONDS,
    )
    chunks = []
    async for chunk in communicator.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
            if progress_callback:
                progress_callback(len(chunk["data"]))
    return b"".join(chunks)
