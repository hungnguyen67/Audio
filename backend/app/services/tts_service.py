import asyncio
import datetime
import email.utils
import threading
import time
import urllib.request

import edge_tts
import edge_tts.communicate as edge_tts_communicate
import edge_tts.drm
from edge_tts.exceptions import NoAudioReceived

from app.core.config import EDGE_VOICES, VOICE

EDGE_TTS_RECEIVE_TIMEOUT_SECONDS = 120
EDGE_TTS_REQUEST_LOCK = threading.Lock()
EDGE_TTS_MIN_REQUEST_INTERVAL_SECONDS = 2.5
EDGE_TTS_MIN_AUDIO_BYTES = 2048
EDGE_TTS_MIN_AUDIO_BYTES_PER_CHARACTER = 2
_next_request_at = 0.0
_last_skew_sync_at = 0.0


def _date_to_string_with_clock_skew():
    adjusted_timestamp = edge_tts.drm.DRM.get_unix_timestamp()
    adjusted_datetime = datetime.datetime.fromtimestamp(
        adjusted_timestamp,
        datetime.timezone.utc,
    )
    return adjusted_datetime.strftime(
        "%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)"
    )


edge_tts_communicate.date_to_string = _date_to_string_with_clock_skew


def sync_drm_clock_skew():
    """
    Đồng bộ độ lệch thời gian giữa máy local và máy chủ Microsoft Bing.
    Token Sec-MS-GEC của Edge TTS được chia theo các khung 5 phút (300s).
    Nếu đồng hồ hệ thống chạy nhanh hoặc chậm (ví dụ lệch > 60s),
    token sẽ bị Microsoft coi là của tương lai/quá khứ và từ chối gửi audio (NoAudioReceived).
    """
    global _last_skew_sync_at
    now = time.monotonic()
    _last_skew_sync_at = now
    try:
        req = urllib.request.Request(
            "https://www.bing.com",
            method="HEAD",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            server_date = resp.headers.get("Date")
        if server_date:
            server_dt = email.utils.parsedate_to_datetime(server_date)
            local_dt = datetime.datetime.now(datetime.timezone.utc)
            skew = server_dt.timestamp() - local_dt.timestamp()
            edge_tts.drm.DRM.clock_skew_seconds = skew
            if abs(skew) > 1.0:
                print(
                    f"[edge-tts] Đã đồng bộ độ lệch đồng hồ: {skew:+.2f}s "
                    f"(đảm bảo token Sec-MS-GEC khớp chuẩn với máy chủ Microsoft).",
                    flush=True,
                )
    except Exception as error:
        print(f"[edge-tts] Không thể đồng bộ giờ với Bing: {error}", flush=True)


# Đồng bộ độ lệch đồng hồ ngay khi nạp module
sync_drm_clock_skew()


def minimum_audio_bytes_for_text(text):
    return max(
        EDGE_TTS_MIN_AUDIO_BYTES,
        len(text.strip()) * EDGE_TTS_MIN_AUDIO_BYTES_PER_CHARACTER,
    )


async def synthesize_text(text, voice=None, progress_callback=None):
    global _next_request_at

    selected_voice = voice or f"edge:{VOICE}"
    edge_voice_name = EDGE_VOICES.get(selected_voice, VOICE if selected_voice == VOICE else None)
    if not edge_voice_name:
        raise RuntimeError("Chỉ hỗ trợ giọng Hoài My.")

    # Định kỳ cập nhật lại độ lệch đồng hồ nếu đã quá 10 phút
    if time.monotonic() - _last_skew_sync_at > 600:
        await asyncio.to_thread(sync_drm_clock_skew)

    # Acquire without blocking the event loop; requests may run on separate loops.
    await asyncio.to_thread(EDGE_TTS_REQUEST_LOCK.acquire)
    try:
        wait_seconds = _next_request_at - time.monotonic()
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)

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

        audio = b"".join(chunks)
        minimum_audio_bytes = minimum_audio_bytes_for_text(text)
        if len(audio) < minimum_audio_bytes:
            raise NoAudioReceived(
                f"Edge TTS returned suspiciously short audio "
                f"({len(audio)} bytes for {len(text.strip())} characters; "
                f"expected at least {minimum_audio_bytes})."
            )

        _next_request_at = time.monotonic() + EDGE_TTS_MIN_REQUEST_INTERVAL_SECONDS
        return audio
    finally:
        EDGE_TTS_REQUEST_LOCK.release()
