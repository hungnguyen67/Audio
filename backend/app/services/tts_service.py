import asyncio
import datetime
import email.utils
import os
import threading
import time
import urllib.request

import edge_tts
import edge_tts.communicate as edge_tts_communicate
import edge_tts.drm
from edge_tts.exceptions import NoAudioReceived

from app.core.config import EDGE_VOICES, VOICE

EDGE_TTS_RECEIVE_TIMEOUT_SECONDS = 120
EDGE_TTS_MIN_REQUEST_INTERVAL_SECONDS = 2.5
EDGE_TTS_MIN_AUDIO_BYTES = 2048
EDGE_TTS_MIN_AUDIO_BYTES_PER_CHARACTER = 2
TTS_CONCURRENCY = int(os.environ.get("TTS_CONCURRENCY", "1"))
if not 1 <= TTS_CONCURRENCY <= 4:
    raise ValueError("TTS_CONCURRENCY phải nằm trong khoảng 1 đến 4.")

EDGE_TTS_REQUEST_SLOTS = threading.BoundedSemaphore(TTS_CONCURRENCY)
_REQUEST_START_LOCK = threading.Lock()
_CLOCK_SYNC_LOCK = threading.Lock()
_TTS_STATS_LOCK = threading.Lock()
_next_request_at = 0.0
_last_skew_sync_at = 0.0
_TTS_STATS = {
    "requests": 0,
    "successes": 0,
    "failures": 0,
    "noAudioReceived": 0,
    "totalQueueSeconds": 0.0,
    "totalFirstByteSeconds": 0.0,
    "firstByteSamples": 0,
    "totalStreamSeconds": 0.0,
    "totalAudioBytes": 0,
}


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
            _last_skew_sync_at = time.monotonic()
            if abs(skew) > 1.0:
                print(
                    f"[edge-tts] Đã đồng bộ độ lệch đồng hồ: {skew:+.2f}s "
                    f"(đảm bảo token Sec-MS-GEC khớp chuẩn với máy chủ Microsoft).",
                    flush=True,
                )
        else:
            print("[edge-tts] Máy chủ Bing không trả về header Date.", flush=True)
    except Exception as error:
        print(f"[edge-tts] Không thể đồng bộ giờ với Bing: {error}", flush=True)


# Đồng bộ độ lệch đồng hồ ngay khi nạp module
sync_drm_clock_skew()


def minimum_audio_bytes_for_text(text):
    return max(
        EDGE_TTS_MIN_AUDIO_BYTES,
        len(text.strip()) * EDGE_TTS_MIN_AUDIO_BYTES_PER_CHARACTER,
    )


def _sync_drm_clock_skew_if_stale():
    if time.monotonic() - _last_skew_sync_at <= 600:
        return
    with _CLOCK_SYNC_LOCK:
        if time.monotonic() - _last_skew_sync_at > 600:
            sync_drm_clock_skew()


async def _acquire_request_slot():
    acquire_task = asyncio.create_task(
        asyncio.to_thread(EDGE_TTS_REQUEST_SLOTS.acquire)
    )
    try:
        await asyncio.shield(acquire_task)
    except asyncio.CancelledError:
        if await asyncio.shield(acquire_task):
            EDGE_TTS_REQUEST_SLOTS.release()
        raise


async def _wait_for_request_start():
    global _next_request_at

    with _REQUEST_START_LOCK:
        now = time.monotonic()
        request_start_at = max(now, _next_request_at)
        _next_request_at = request_start_at + EDGE_TTS_MIN_REQUEST_INTERVAL_SECONDS
    await asyncio.sleep(max(0.0, request_start_at - now))


def _record_tts_result(queue_seconds, first_byte_seconds, stream_seconds, audio_bytes, error):
    with _TTS_STATS_LOCK:
        _TTS_STATS["requests"] += 1
        _TTS_STATS["totalQueueSeconds"] += queue_seconds
        _TTS_STATS["totalStreamSeconds"] += stream_seconds
        _TTS_STATS["totalAudioBytes"] += audio_bytes
        if error is None:
            _TTS_STATS["successes"] += 1
        else:
            _TTS_STATS["failures"] += 1
            if isinstance(error, NoAudioReceived):
                _TTS_STATS["noAudioReceived"] += 1
        if first_byte_seconds is not None:
            _TTS_STATS["totalFirstByteSeconds"] += first_byte_seconds
            _TTS_STATS["firstByteSamples"] += 1


def get_tts_stats():
    with _TTS_STATS_LOCK:
        stats = dict(_TTS_STATS)
    stats["averageQueueSeconds"] = (
        stats["totalQueueSeconds"] / stats["requests"] if stats["requests"] else 0.0
    )
    stats["averageFirstByteSeconds"] = (
        stats["totalFirstByteSeconds"] / stats["firstByteSamples"]
        if stats["firstByteSamples"]
        else None
    )
    stats["averageStreamSeconds"] = (
        stats["totalStreamSeconds"] / stats["requests"] if stats["requests"] else 0.0
    )
    stats["noAudioRate"] = (
        stats["noAudioReceived"] / stats["requests"] if stats["requests"] else 0.0
    )
    return stats


async def synthesize_text(text, voice=None, progress_callback=None):
    selected_voice = voice or f"edge:{VOICE}"
    edge_voice_name = EDGE_VOICES.get(selected_voice, VOICE if selected_voice == VOICE else None)
    if not edge_voice_name:
        raise RuntimeError("Chỉ hỗ trợ giọng Hoài My.")

    if time.monotonic() - _last_skew_sync_at > 600:
        await asyncio.to_thread(_sync_drm_clock_skew_if_stale)
    queued_at = time.perf_counter()
    await _acquire_request_slot()
    request_started_at = None
    stream_started_at = None
    first_byte_seconds = None
    audio_bytes = 0
    try:
        await _wait_for_request_start()
        request_started_at = time.perf_counter()
        queue_seconds = request_started_at - queued_at
        communicator = edge_tts.Communicate(
            text,
            edge_voice_name,
            receive_timeout=EDGE_TTS_RECEIVE_TIMEOUT_SECONDS,
        )
        chunks = []
        stream_started_at = time.perf_counter()
        async for chunk in communicator.stream():
            if chunk["type"] == "audio":
                if first_byte_seconds is None:
                    first_byte_seconds = time.perf_counter() - stream_started_at
                chunks.append(chunk["data"])
                audio_bytes += len(chunk["data"])
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

        stream_seconds = time.perf_counter() - stream_started_at
        _record_tts_result(
            queue_seconds,
            first_byte_seconds,
            stream_seconds,
            audio_bytes,
            None,
        )
        print(
            f"[edge-tts] ok chars={len(text)} bytes={audio_bytes} "
            f"queue={queue_seconds:.2f}s "
            f"first_byte={first_byte_seconds:.2f}s "
            f"stream={stream_seconds:.2f}s",
            flush=True,
        )
        return audio
    except Exception as error:
        if isinstance(error, NoAudioReceived) and audio_bytes == 0:
            await asyncio.to_thread(sync_drm_clock_skew)
        stream_seconds = (
            time.perf_counter() - stream_started_at
            if stream_started_at is not None
            else 0.0
        )
        queue_seconds = (
            request_started_at - queued_at
            if request_started_at is not None
            else time.perf_counter() - queued_at
        )
        _record_tts_result(
            queue_seconds,
            first_byte_seconds,
            stream_seconds,
            audio_bytes,
            error,
        )
        print(
            f"[edge-tts] failed chars={len(text)} bytes={audio_bytes} "
            f"queue={queue_seconds:.2f}s "
            f"first_byte={first_byte_seconds if first_byte_seconds is not None else 'n/a'} "
            f"stream={stream_seconds:.2f}s error={type(error).__name__}: {error}",
            flush=True,
        )
        raise
    finally:
        EDGE_TTS_REQUEST_SLOTS.release()
