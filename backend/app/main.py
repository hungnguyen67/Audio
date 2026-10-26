import asyncio
import hashlib
import json
import os
import re
import sys
import threading
import time
from urllib.request import Request, urlopen
import uuid
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

import edge_tts
import mysql.connector

from app.core.config import EDGE_VOICES, FRONTEND_ROOT, VOICE
from app.core.logging import configure_console_encoding
from app.repositories.database import get_connection
from app.services.chapter_import import fetch_chapter_from_url
from app.services.tts_service import EDGE_TTS_RECEIVE_TIMEOUT_SECONDS, synthesize_text

configure_console_encoding()

CHUNK_JOBS = {}
CHUNK_JOBS_LOCK = threading.Lock()
AUDIO_JOBS_BY_KEY = {}
AUDIO_JOB_START_LOCK = threading.Lock()
AUTO_AUDIO_INTERVAL_SECONDS = 60
AUTO_AUDIO_RETRY_MINUTES = 3
AUTO_AUDIO_WAKE = threading.Event()
EDGE_TTS_CHUNK_SIZE = 1000
EDGE_TTS_CHUNK_CONCURRENCY = 3
EDGE_TTS_EXECUTOR = ThreadPoolExecutor(max_workers=EDGE_TTS_CHUNK_CONCURRENCY, thread_name_prefix="edge-tts")
def auto_generate_missing_audio():
    print(
        f"[auto audio] Background queue started; idle fallback check every {AUTO_AUDIO_INTERVAL_SECONDS}s.",
        flush=True,
    )
    while True:
        AUTO_AUDIO_WAKE.clear()
        try:
            with CHUNK_JOBS_LOCK:
                has_active_jobs = bool(AUDIO_JOBS_BY_KEY)
            if has_active_jobs:
                AUTO_AUDIO_WAKE.wait(AUTO_AUDIO_INTERVAL_SECONDS)
                continue

            connection = get_connection()
            cursor = None
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "SELECT c.id, c.chapter_number, c.title, s.title "
                    "FROM chapters c JOIN stories s ON s.id = c.story_id "
                    "LEFT JOIN chapter_audios ca ON ca.chapter_id = c.id "
                    "AND ca.voice = %s AND ca.content_hash = SHA2(c.content, 256) "
                    "AND ca.status = 'ready' "
                    "WHERE ca.id IS NULL "
                    "AND NOT EXISTS ("
                    "SELECT 1 FROM chapter_audios failed_ca "
                    "WHERE failed_ca.chapter_id = c.id AND failed_ca.voice = %s "
                    "AND failed_ca.content_hash = SHA2(c.content, 256) "
                    "AND failed_ca.status = 'error' "
                    f"AND failed_ca.updated_at >= NOW() - INTERVAL {AUTO_AUDIO_RETRY_MINUTES} MINUTE) "
                    "AND NOT EXISTS ("
                    "SELECT 1 FROM chapters earlier "
                    "LEFT JOIN chapter_audios earlier_ca ON earlier_ca.chapter_id = earlier.id "
                    "AND earlier_ca.voice = %s "
                    "AND earlier_ca.content_hash = SHA2(earlier.content, 256) "
                    "AND earlier_ca.status = 'ready' "
                    "WHERE earlier.story_id = c.story_id "
                    "AND earlier.chapter_number < c.chapter_number "
                    "AND earlier_ca.id IS NULL) "
                    "ORDER BY c.created_at, c.chapter_number LIMIT 1",
                    (f"edge:{VOICE}", f"edge:{VOICE}", f"edge:{VOICE}"),
                )
                chapter = cursor.fetchone()
            finally:
                if cursor:
                    cursor.close()
                connection.close()

            if chapter:
                request = Request(
                    f"http://127.0.0.1:3001/api/chapters/{chapter[0]}/audio-jobs?voice=edge%3A{VOICE}",
                    method="POST",
                )
                with urlopen(request, timeout=10) as response:
                    result = json.loads(response.read().decode("utf-8"))
                print(
                    f'[auto audio] Đã xếp hàng chương {chapter[1]} "{chapter[2]}" '
                    f'của truyện "{chapter[3]}" (ID: {chapter[0]}): '
                    f'{result.get("status", "unknown")}.',
                    flush=True,
                )
        except Exception as error:
            print(f"Auto audio check failed: {error}")
        AUTO_AUDIO_WAKE.wait(AUTO_AUDIO_INTERVAL_SECONDS)


class AudioHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return

        if path == "/.well-known/appspecific/com.chrome.devtools.json":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return

        if path == "/api/stories":
            self.send_json(HTTPStatus.OK, self.list_stories())
            return

        if path == "/api/runtime-info":
            self.send_json(HTTPStatus.OK, {
                "pythonExecutable": sys.executable,
                "edgeTtsVersion": edge_tts.__version__,
                "chunkSize": EDGE_TTS_CHUNK_SIZE,
                "chunkConcurrency": EDGE_TTS_CHUNK_CONCURRENCY,
            })
            return

        audio_job_match = re.fullmatch(r"/api/audio-jobs/([a-f0-9]+)", path)
        if audio_job_match:
            with CHUNK_JOBS_LOCK:
                job = CHUNK_JOBS.get(audio_job_match.group(1))
                public_job = {
                    key: value for key, value in job.items() if key != "cacheId"
                } if job else None
                if public_job:
                    public_job["activeChunks"] = [
                        dict(chunk) for chunk in job.get("activeChunks", [])
                    ]
            self.send_json(HTTPStatus.OK, public_job or {"status": "not_found"})
            return

        playback_match = re.fullmatch(r"/api/playback-state/([a-f0-9]+)", path)
        if playback_match:
            self.get_playback_state(playback_match.group(1))
            return

        story_progress_match = re.fullmatch(r"/api/story-progress/([a-f0-9]+)", path)
        if story_progress_match:
            self.get_story_progress(story_progress_match.group(1))
            return

        chunk_match = re.fullmatch(r"/api/audio-chunks/([a-f0-9]+)", path)
        if chunk_match:
            self.stream_chunk(chunk_match.group(1))
            return

        chapter_match = re.fullmatch(r"/api/chapters/([a-f0-9]+)", path)
        if chapter_match:
            self.get_chapter(chapter_match.group(1))
            return

        match = re.fullmatch(r"/api/audio/([a-f0-9]+)", path)
        if match:
            self.stream_audio(match.group(1))
            return

        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/api/import-chapter":
            self.import_chapter()
            return

        if path == "/api/stories":
            self.create_story()
            return

        if path == "/api/chapters":
            self.save_chapter()
            return

        audio_job_match = re.fullmatch(r"/api/chapters/([a-f0-9]+)/audio-jobs", path)
        if audio_job_match:
            self.start_audio_job(audio_job_match.group(1), parse_qs(urlsplit(self.path).query))
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def import_chapter(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Link chương không hợp lệ."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Dữ liệu yêu cầu không hợp lệ.")
            url = str(payload.get("url", "")).strip()
            chapter = fetch_chapter_from_url(url)
            self.send_json(HTTPStatus.OK, chapter)
        except (ValueError, TypeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": str(error)})
        except UnicodeDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Dữ liệu link phải ở định dạng UTF-8."})
        except RuntimeError as error:
            self.send_json(HTTPStatus.BAD_GATEWAY, {"message": str(error)})

    def do_PUT(self):
        path = urlsplit(self.path).path
        story_match = re.fullmatch(r"/api/stories/([a-f0-9]+)", path)
        if story_match:
            self.update_story(story_match.group(1))
            return
        playback_match = re.fullmatch(r"/api/playback-state/([a-f0-9]+)", path)
        if playback_match:
            self.save_playback_state(playback_match.group(1))
            return
        story_progress_match = re.fullmatch(r"/api/story-progress/([a-f0-9]+)", path)
        if story_progress_match:
            self.save_story_progress(story_progress_match.group(1))
            return
        chapter_match = re.fullmatch(r"/api/chapters/([a-f0-9]+)", urlsplit(self.path).path)
        if not chapter_match:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.update_chapter(chapter_match.group(1))

    def do_DELETE(self):
        chapter_match = re.fullmatch(r"/api/chapters/([a-f0-9]+)", self.path)
        if chapter_match:
            self.delete_chapter(chapter_match.group(1))
            return

        story_match = re.fullmatch(r"/api/stories/([a-f0-9]+)", self.path)
        if story_match:
            self.delete_story(story_match.group(1))
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def get_story_progress(self, story_id):
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT chapter_id AS chapterId, chapter_number AS chapterNumber "
            "FROM story_progress WHERE story_id = %s",
            (story_id,),
        )
        progress = cursor.fetchone() or {"chapterId": None, "chapterNumber": 0}
        cursor.close()
        connection.close()
        self.send_json(HTTPStatus.OK, progress)

    def save_story_progress(self, story_id):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            chapter_id = str(payload.get("chapterId", "")).strip()
            chapter_number = int(payload.get("chapterNumber", 0) or 0)
            if not chapter_id or chapter_number < 1:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Chương nghe không hợp lệ."})
                return
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute(
                "SELECT 1 FROM chapters WHERE id = %s AND story_id = %s AND chapter_number = %s",
                (chapter_id, story_id, chapter_number),
            )
            if not cursor.fetchone():
                cursor.close()
                connection.close()
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy chương trong truyện."})
                return
            cursor.execute(
                "INSERT INTO story_progress (story_id, chapter_id, chapter_number) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE chapter_id = VALUES(chapter_id), chapter_number = VALUES(chapter_number)",
                (story_id, chapter_id, chapter_number),
            )
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"message": "Đã lưu tập đang nghe."})
        except (ValueError, TypeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": f"Chương nghe không hợp lệ: {error}"})
        except UnicodeDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Dữ liệu gửi lên phải ở định dạng UTF-8."})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def get_playback_state(self, chapter_id):
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT voice, playback_rate, volume FROM playback_settings WHERE id = 1")
        settings = cursor.fetchone() or {
            "voice": "edge:vi-VN-HoaiMyNeural",
            "playback_rate": 1,
            "volume": 1,
        }
        cursor.execute(
            "SELECT chunk_index, position_seconds FROM chapter_progress WHERE chapter_id = %s",
            (chapter_id,),
        )
        progress = cursor.fetchone() or {"chunk_index": 0, "position_seconds": 0}
        cursor.close()
        connection.close()
        self.send_json(HTTPStatus.OK, {
            "voice": settings["voice"],
            "playbackRate": float(settings["playback_rate"]),
            "volume": float(settings["volume"]),
            "chunkIndex": progress["chunk_index"],
            "positionSeconds": float(progress["position_seconds"]),
        })

    def save_playback_state(self, chapter_id):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            voice = self.normalize_voice(payload.get("voice", "edge:vi-VN-HoaiMyNeural"))
            playback_rate = min(3, max(0.75, float(payload.get("playbackRate", 1))))
            volume = min(1, max(0, float(payload.get("volume", 1))))
            chunk_index = max(0, int(payload.get("chunkIndex", 0)))
            position_seconds = max(0, float(payload.get("positionSeconds", 0)))
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute("SELECT 1 FROM chapters WHERE id = %s", (chapter_id,))
            if not cursor.fetchone():
                cursor.close()
                connection.close()
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy chương để lưu tiến độ."})
                return
            cursor.execute(
                "INSERT INTO playback_settings (id, voice, playback_rate, volume) VALUES (1, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE voice = VALUES(voice), playback_rate = VALUES(playback_rate), volume = VALUES(volume)",
                (voice, playback_rate, volume),
            )
            cursor.execute(
                "INSERT INTO chapter_progress (chapter_id, chunk_index, position_seconds) VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE chunk_index = VALUES(chunk_index), position_seconds = VALUES(position_seconds)",
                (chapter_id, chunk_index, position_seconds),
            )
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"message": "Đã lưu tiến độ nghe."})
        except (ValueError, TypeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": f"Thiết lập nghe không hợp lệ: {error}"})
        except UnicodeDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Dữ liệu gửi lên phải ở định dạng UTF-8."})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def delete_chapter(self, chapter_id):
        try:
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute(
                "SELECT audio_id FROM chapter_audios WHERE chapter_id = %s "
                "UNION SELECT id FROM audios WHERE chapter_id = %s",
                (chapter_id, chapter_id),
            )
            audio_ids = [row[0] for row in cursor.fetchall()]
            if audio_ids:
                placeholders = ",".join(["%s"] * len(audio_ids))
                cursor.execute(f"DELETE FROM audios WHERE id IN ({placeholders})", audio_ids)
            cursor.execute("DELETE FROM chapters WHERE id = %s", (chapter_id,))
            deleted = cursor.rowcount
            connection.commit()
            cursor.close()
            connection.close()
            if not deleted:
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy tập."})
                return
            self.send_json(HTTPStatus.OK, {"message": "Đã xóa tập."})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def delete_story(self, story_id):
        try:
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute(
                "DELETE FROM audios WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = %s)",
                (story_id,),
            )
            cursor.execute("DELETE FROM stories WHERE id = %s", (story_id,))
            deleted = cursor.rowcount
            connection.commit()
            cursor.close()
            connection.close()
            if not deleted:
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy truyện."})
                return
            self.send_json(HTTPStatus.OK, {"message": "Đã xóa truyện và các tập audio liên quan."})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    @staticmethod
    def normalize_voice(value):
        voice = str(value or "edge:vi-VN-HoaiMyNeural").strip()
        if voice not in EDGE_VOICES:
            raise ValueError("Giọng đọc không hợp lệ. Chỉ hỗ trợ Hoài My và Nam Minh.")
        return voice

    def save_chapter(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            story_id = str(payload.get("storyId", "")).strip()
            title = str(payload.get("title", "")).strip()
            content = str(payload.get("content", "")).strip()
            chapter_number = int(payload.get("chapterNumber", 0) or 0)
            if not story_id or not title or not content or chapter_number < 1:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Tên tập, nội dung và số tập là bắt buộc."})
                return

            chapter_id = uuid.uuid4().hex
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute(
                "INSERT INTO chapters (id, story_id, chapter_number, title, content) VALUES (%s, %s, %s, %s, %s)",
                (chapter_id, story_id, chapter_number, title, content),
            )
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"id": chapter_id, "storyId": story_id, "number": chapter_number, "title": title})
            AUTO_AUDIO_WAKE.set()
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})
        except Exception as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": str(error)})

    def update_chapter(self, chapter_id):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            chapter_number = int(payload.get("chapterNumber", 0) or 0)
            title = str(payload.get("title", "")).strip()
            content = str(payload.get("content", "")).strip()
            if chapter_number < 1 or not title or not content:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Số tập, tên tập và nội dung là bắt buộc."})
                return
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute("SELECT id FROM chapters WHERE id = %s", (chapter_id,))
            if not cursor.fetchone():
                cursor.close()
                connection.close()
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy tập."})
                return
            cursor.execute(
                "UPDATE chapters SET chapter_number = %s, title = %s, content = %s WHERE id = %s",
                (chapter_number, title, content, chapter_id),
            )
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"id": chapter_id, "message": "Đã cập nhật tập. Audio sẽ tạo lại theo nội dung mới."})
            AUTO_AUDIO_WAKE.set()
        except UnicodeDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Dữ liệu gửi lên phải ở định dạng UTF-8."})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def get_chapter(self, chapter_id):
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, story_id, chapter_number, title, content FROM chapters WHERE id = %s", (chapter_id,))
        chapter = cursor.fetchone()
        cursor.close()
        connection.close()
        if not chapter:
            self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy tập."})
            return
        self.send_json(HTTPStatus.OK, chapter)

    @staticmethod
    def split_content(content, max_size=EDGE_TTS_CHUNK_SIZE):
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]
        if not paragraphs:
            return [content]

        chunks = []
        current = ""
        for paragraph in paragraphs:
            if len(paragraph) <= max_size:
                if current and len(current) + len(paragraph) + 2 > max_size:
                    chunks.append(current)
                    current = ""
                current = f"{current}\n\n{paragraph}".strip()
                continue

            while len(paragraph) > max_size:
                cut = paragraph.rfind(" ", 0, max_size)
                cut = cut if cut > 400 else max_size
                piece, paragraph = paragraph[:cut].strip(), paragraph[cut:].strip()
                if current:
                    chunks.append(current)
                    current = ""
                if len(piece) > max_size:
                    chunks.append(piece[:max_size])
                    piece = piece[max_size:]
                chunks.append(piece)

            if current and len(current) + len(paragraph) + 2 > max_size:
                chunks.append(current)
                current = ""
            current = f"{current}\n\n{paragraph}".strip()

        if current:
            chunks.append(current)

        return chunks or [content]

    def start_audio_job(self, chapter_id, query):
        with AUDIO_JOB_START_LOCK:
            self._start_audio_job_locked(chapter_id, query)

    def _start_audio_job_locked(self, chapter_id, query):
        connection = None
        cursor = None
        try:
            voice = self.normalize_voice(query.get("voice", [None])[0])
            connection = get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute("SELECT id, chapter_number, title, content FROM chapters WHERE id = %s", (chapter_id,))
            chapter = cursor.fetchone()
            if not chapter:
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy tập."})
                return
            content_hash = hashlib.sha256(chapter["content"].encode("utf-8")).hexdigest()
            cursor.execute(
                "SELECT id, audio_id, status FROM chapter_audios WHERE chapter_id = %s AND voice = %s AND content_hash = %s",
                (chapter_id, voice, content_hash),
            )
            cache = cursor.fetchone()
            if cache and cache["status"] == "ready" and cache["audio_id"]:
                cursor.execute(
                    "SELECT id, chunk_index FROM audio_chunks "
                    "WHERE chapter_audio_id = %s ORDER BY chunk_index",
                    (cache["id"],),
                )
                chunks = [
                    {"index": chunk["chunk_index"], "url": f"/api/audio-chunks/{chunk['id']}"}
                    for chunk in cursor.fetchall()
                ]
                self.send_json(HTTPStatus.OK, {
                    "status": "ready",
                    "url": f"/api/audio/{cache['audio_id']}",
                    "chunks": chunks,
                    "cached": True,
                })
                return

            job_key = f"{chapter_id}:{voice}:{content_hash}"
            with CHUNK_JOBS_LOCK:
                existing_job = AUDIO_JOBS_BY_KEY.get(job_key)
            if existing_job:
                self.send_json(HTTPStatus.ACCEPTED, {"status": "processing", "jobId": existing_job})
                return

            if not cache:
                cache_id = uuid.uuid4().hex
                cursor.execute(
                    "INSERT INTO chapter_audios (id, chapter_id, voice, content_hash, status) VALUES (%s, %s, %s, %s, 'generating')",
                    (cache_id, chapter_id, voice, content_hash),
                )
            else:
                cache_id = cache["id"]
                cursor.execute("UPDATE chapter_audios SET status = 'generating', error_message = NULL WHERE id = %s", (cache_id,))
            connection.commit()
            cursor.close()
            cursor = None
            connection.close()
            connection = None

            with CHUNK_JOBS_LOCK:
                job_id = uuid.uuid4().hex
                AUDIO_JOBS_BY_KEY[job_key] = job_id
                CHUNK_JOBS[job_id] = {
                    "status": "processing",
                    "completedChunks": [],
                    "completedCount": 0,
                    "totalChunks": 0,
                    "activeChunks": [],
                    "voice": voice,
                }
            queued_at = time.perf_counter()
            threading.Thread(
                target=self.run_chunk_job,
                args=(
                    job_id,
                    job_key,
                    cache_id,
                    chapter_id,
                    chapter["chapter_number"],
                    chapter["title"],
                    voice,
                    chapter["content"],
                    queued_at,
                ),
                daemon=True,
            ).start()
            self.send_json(HTTPStatus.ACCEPTED, {"status": "processing", "jobId": job_id})
        except Exception as error:
            if connection and connection.is_connected():
                connection.rollback()
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Không khởi động được audio: {error}"})
        finally:
            if cursor:
                cursor.close()
            if connection and connection.is_connected():
                connection.close()

    def store_chunk(self, job_id, cache_id, index, audio):
        chunk_id = uuid.uuid4().hex
        connection = get_connection()
        cursor = None
        try:
            cursor = connection.cursor()
            cursor.execute(
                "INSERT INTO audio_chunks (id, chapter_audio_id, chunk_index, audio_data) VALUES (%s, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE audio_data = VALUES(audio_data)",
                (chunk_id, cache_id, index, audio),
            )
            cursor.execute(
                "SELECT id FROM audio_chunks WHERE chapter_audio_id = %s AND chunk_index = %s",
                (cache_id, index),
            )
            chunk_id = cursor.fetchone()[0]
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            if cursor:
                cursor.close()
            if connection.is_connected():
                connection.close()
        with CHUNK_JOBS_LOCK:
            CHUNK_JOBS[job_id]["completedChunks"].append({"index": index, "url": f"/api/audio-chunks/{chunk_id}"})

    async def synthesize_chunks_parallel(
        self,
        chunks,
        voice,
        job_id,
        cache_id,
        max_concurrency=EDGE_TTS_CHUNK_CONCURRENCY,
    ):
        semaphore = asyncio.Semaphore(max_concurrency)
        generation_started_at = time.perf_counter()
        chunk_latencies = []
        retry_count = 0
        retried_chunk_count = 0
        chunk_store_seconds = 0.0
        connection = get_connection()
        cursor = None
        try:
            cursor = connection.cursor()
            cursor.execute(
                "SELECT id, chunk_index FROM audio_chunks WHERE chapter_audio_id = %s ORDER BY chunk_index",
                (cache_id,),
            )
            existing_chunks = cursor.fetchall()
        finally:
            if cursor:
                cursor.close()
            if connection.is_connected():
                connection.close()

        completed_indices = {chunk_index for _, chunk_index in existing_chunks}
        with CHUNK_JOBS_LOCK:
            CHUNK_JOBS[job_id]["completedChunks"] = [
                {"index": chunk_index, "url": f"/api/audio-chunks/{chunk_id}"}
                for chunk_id, chunk_index in existing_chunks
            ]
            CHUNK_JOBS[job_id]["completedCount"] = len(existing_chunks)
        first_chunk_ready = 0 in completed_indices

        async def synth_one(index, text):
            async with semaphore:
                last_error = None
                received_audio_bytes = 0
                next_progress_bytes = 1024 * 1024
                chunk_started_at = time.perf_counter()
                active_chunk = {
                    "index": index,
                    "attempt": 1,
                    "receivedBytes": 0,
                }
                with CHUNK_JOBS_LOCK:
                    CHUNK_JOBS[job_id]["activeChunks"].append(active_chunk)
                print(
                    f"[audio {job_id}] Đang tạo đoạn {index + 1}/{len(chunks)} "
                    f"({len(text):,} ký tự)...",
                    flush=True,
                )

                def report_audio_progress(byte_count):
                    nonlocal received_audio_bytes, next_progress_bytes
                    received_audio_bytes += byte_count
                    with CHUNK_JOBS_LOCK:
                        active_chunk["receivedBytes"] = received_audio_bytes
                    if received_audio_bytes >= next_progress_bytes:
                        print(
                            f"[audio {job_id}] Đoạn {index + 1}/{len(chunks)} "
                            f"đã nhận {received_audio_bytes / (1024 * 1024):.1f} MB audio...",
                            flush=True,
                        )
                        next_progress_bytes = (received_audio_bytes // (1024 * 1024) + 1) * 1024 * 1024

                try:
                    for attempt in range(3):
                        with CHUNK_JOBS_LOCK:
                            active_chunk["attempt"] = attempt + 1
                            active_chunk["receivedBytes"] = 0
                        attempt_started_at = time.perf_counter()
                        try:
                            received_audio_bytes = 0
                            next_progress_bytes = 1024 * 1024
                            audio = await asyncio.get_running_loop().run_in_executor(
                                EDGE_TTS_EXECUTOR,
                                asyncio.run,
                                self.synthesize(text, voice, report_audio_progress),
                            )
                            print(
                                f"[audio {job_id}] Đã tạo đoạn {index + 1}/{len(chunks)} "
                                f"({len(audio):,} byte, {time.perf_counter() - chunk_started_at:.2f}s, "
                                f"{attempt} lần thử lại).",
                                flush=True,
                            )
                            return index, audio, time.perf_counter() - chunk_started_at, attempt
                        except Exception as error:
                            last_error = (
                                RuntimeError(
                                    f"Edge TTS không gửi dữ liệu trong {EDGE_TTS_RECEIVE_TIMEOUT_SECONDS} giây."
                                )
                                if isinstance(error, asyncio.TimeoutError)
                                else error
                            )
                            print(
                                f"[audio {job_id}] Lỗi đoạn {index + 1}/{len(chunks)} "
                                f"(lần {attempt + 1}/3, {type(last_error).__name__}, "
                                f"{time.perf_counter() - attempt_started_at:.2f}s, "
                                f"{received_audio_bytes:,} byte): {last_error}",
                                flush=True,
                            )
                            if attempt < 2:
                                await asyncio.sleep(2 ** (attempt + 1))
                    assert last_error is not None
                    raise last_error
                finally:
                    with CHUNK_JOBS_LOCK:
                        CHUNK_JOBS[job_id]["activeChunks"].remove(active_chunk)

        tasks = [
            asyncio.create_task(synth_one(index, text))
            for index, text in enumerate(chunks)
            if index not in completed_indices
        ]
        completed_count = len(existing_chunks)
        results = []
        for task in asyncio.as_completed(tasks):
            result = await task
            results.append(result)
            index, audio, chunk_latency, retries = result
            chunk_latencies.append(chunk_latency)
            retry_count += retries
            retried_chunk_count += retries > 0
            store_started_at = time.perf_counter()
            self.store_chunk(job_id, cache_id, index, audio)
            chunk_store_seconds += time.perf_counter() - store_started_at
            if index == 0 and not first_chunk_ready:
                first_chunk_ready = True
                print(
                    f"[audio {job_id}] Chunk đầu tiên sẵn sàng sau "
                    f"{time.perf_counter() - generation_started_at:.2f}s.",
                    flush=True,
                )
            completed_count += 1
            with CHUNK_JOBS_LOCK:
                CHUNK_JOBS[job_id]["completedCount"] = completed_count
        results.sort(key=lambda item: item[0])
        synthesis_wall_seconds = time.perf_counter() - generation_started_at
        average_chunk_seconds = sum(chunk_latencies) / len(chunk_latencies) if chunk_latencies else 0
        max_chunk_seconds = max(chunk_latencies, default=0)
        retry_rate = retried_chunk_count / len(chunk_latencies) if chunk_latencies else 0
        print(
            f"[audio {job_id}] Đoạn/TTS: {len(chunk_latencies)} mới, "
            f"latency TB/cao nhất {average_chunk_seconds:.2f}/{max_chunk_seconds:.2f}s, "
            f"{retried_chunk_count} đoạn phải thử lại ({retry_rate:.0%}), "
            f"tổng retry {retry_count}; giai đoạn song song + lưu chunk "
            f"{synthesis_wall_seconds:.2f}s (ghi chunk {chunk_store_seconds:.2f}s).",
            flush=True,
        )
        return {
            "chunkCount": len(chunk_latencies),
            "averageChunkSeconds": average_chunk_seconds,
            "maxChunkSeconds": max_chunk_seconds,
            "retryCount": retry_count,
            "retriedChunkCount": retried_chunk_count,
            "retryRate": retry_rate,
            "chunkStoreSeconds": chunk_store_seconds,
            "parallelStageSeconds": synthesis_wall_seconds,
        }

    def run_chunk_job(
        self,
        job_id,
        job_key,
        cache_id,
        chapter_id,
        chapter_number,
        chapter_title,
        voice,
        content,
        queued_at,
    ):
        job_started_at = time.perf_counter()
        thread_start_delay = job_started_at - queued_at
        split_started_at = time.perf_counter()
        chunks = self.split_content(content)
        split_seconds = time.perf_counter() - split_started_at
        chapter_label = " ".join(chapter_title.split())
        with CHUNK_JOBS_LOCK:
            CHUNK_JOBS[job_id]["totalChunks"] = len(chunks)
        print(
            f'[audio {job_id}] Bắt đầu chương {chapter_number} "{chapter_label}" ({chapter_id}): '
            f"{len(content):,} ký tự, chia thành {len(chunks)} đoạn "
            f"({split_seconds:.4f}s; chờ thread {thread_start_delay:.4f}s).",
            flush=True,
        )
        try:
            parallel_metrics = asyncio.run(
                self.synthesize_chunks_parallel(
                    chunks,
                    voice,
                    job_id,
                    cache_id,
                    max_concurrency=EDGE_TTS_CHUNK_CONCURRENCY,
                )
            )
            read_started_at = time.perf_counter()
            connection = get_connection()
            cursor = None
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "SELECT audio_data FROM audio_chunks WHERE chapter_audio_id = %s ORDER BY chunk_index",
                    (cache_id,),
                )
                audio_rows = cursor.fetchall()
            finally:
                if cursor:
                    cursor.close()
                if connection.is_connected():
                    connection.close()
            read_chunks_seconds = time.perf_counter() - read_started_at

            join_started_at = time.perf_counter()
            full_audio = b"".join(row[0] for row in audio_rows)
            join_seconds = time.perf_counter() - join_started_at

            persist_started_at = time.perf_counter()
            connection = get_connection()
            cursor = connection.cursor()
            audio_hash = hashlib.sha256(f"{voice}\n{content}".encode("utf-8")).hexdigest()
            cursor.execute("SELECT id FROM audios WHERE content_hash = %s", (audio_hash,))
            existing_audio = cursor.fetchone()
            audio_id = existing_audio[0] if existing_audio else uuid.uuid4().hex
            if not existing_audio:
                cursor.execute("INSERT INTO audios (id, chapter_id, title, content_hash, preview, audio_data) VALUES (%s, %s, %s, %s, %s, %s)", (audio_id, chapter_id, f"Audio {voice}", audio_hash, content[:180], full_audio))
            cursor.execute("UPDATE chapter_audios SET status = 'ready', audio_id = %s WHERE id = %s", (audio_id, cache_id))
            connection.commit()
            cursor.close()
            connection.close()
            persist_seconds = time.perf_counter() - persist_started_at

            with CHUNK_JOBS_LOCK:
                CHUNK_JOBS[job_id].update({"status": "completed", "finalUrl": f"/api/audio/{audio_id}"})
            total_seconds = time.perf_counter() - job_started_at
            print(
                f'[audio {job_id}] HOÀN TẤT chương {chapter_number} "{chapter_label}" ({chapter_id}): '
                f"{len(chunks)} đoạn, {len(full_audio):,} byte audio, "
                f"{total_seconds:.2f}s tổng. Benchmark: chia {split_seconds:.4f}s; "
                f"TTS + ghi chunk {parallel_metrics['parallelStageSeconds']:.2f}s "
                f"(ghi chunk {parallel_metrics['chunkStoreSeconds']:.2f}s); "
                f"đọc chunk {read_chunks_seconds:.2f}s; ghép bytes {join_seconds:.4f}s; "
                f"lưu audio cuối {persist_seconds:.2f}s.",
                flush=True,
            )
        except Exception as error:
            print(
                f'[audio {job_id}] THẤT BẠI chương {chapter_number} "{chapter_label}" ({chapter_id}): {error}',
                flush=True,
            )
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute("UPDATE chapter_audios SET status = 'error', error_message = %s WHERE id = %s", (str(error)[:500], cache_id))
            connection.commit()
            cursor.close()
            connection.close()
            with CHUNK_JOBS_LOCK:
                CHUNK_JOBS[job_id].update({"status": "failed", "message": str(error)})
        finally:
            with CHUNK_JOBS_LOCK:
                AUDIO_JOBS_BY_KEY.pop(job_key, None)
            AUTO_AUDIO_WAKE.set()

    def stream_chunk(self, chunk_id):
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT audio_data FROM audio_chunks WHERE id = %s", (chunk_id,))
        row = cursor.fetchone()
        cursor.close()
        connection.close()
        if not row:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        audio = row[0]
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(audio)

    def list_stories(self):
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, title, description, created_at FROM stories ORDER BY created_at DESC")
        stories = cursor.fetchall()
        for story in stories:
            cursor.execute(
                "SELECT c.id, c.chapter_number, c.title, c.created_at, "
                "(SELECT COUNT(*) FROM chapter_audios ready_ca "
                "WHERE ready_ca.chapter_id = c.id AND ready_ca.status = 'ready') AS audio_count "
                "FROM chapters c "
                "WHERE c.story_id = %s ORDER BY c.chapter_number",
                (story["id"],),
            )
            story["chapters"] = [
                {
                    "id": chapter["id"],
                    "number": chapter["chapter_number"],
                    "title": chapter["title"],
                    "audioCount": chapter["audio_count"],
                    "createdAt": chapter["created_at"].isoformat(),
                }
                for chapter in cursor.fetchall()
            ]
            story["created_at"] = story["created_at"].isoformat()
        cursor.close()
        connection.close()
        return stories

    def create_story(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            title = str(payload.get("title", "")).strip()
            description = str(payload.get("description", "")).strip()
            if not title:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Tên truyện không được để trống."})
                return
            story_id = uuid.uuid4().hex
            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute(
                "INSERT INTO stories (id, title, description) VALUES (%s, %s, %s)",
                (story_id, title, description),
            )
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"id": story_id, "title": title, "description": description, "chapters": []})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def update_story(self, story_id):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Tên truyện không hợp lệ."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Dữ liệu yêu cầu không hợp lệ."})
                return
            title = str(payload.get("title", "")).strip()
            if not title:
                self.send_json(HTTPStatus.BAD_REQUEST, {"message": "Tên truyện không được để trống."})
                return

            connection = get_connection()
            cursor = connection.cursor()
            cursor.execute("SELECT id FROM stories WHERE id = %s", (story_id,))
            if not cursor.fetchone():
                cursor.close()
                connection.close()
                self.send_json(HTTPStatus.NOT_FOUND, {"message": "Không tìm thấy truyện."})
                return
            cursor.execute("UPDATE stories SET title = %s WHERE id = %s", (title, story_id))
            connection.commit()
            cursor.close()
            connection.close()
            self.send_json(HTTPStatus.OK, {"id": story_id, "title": title})
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"message": f"Dữ liệu yêu cầu không hợp lệ: {error}"})
        except mysql.connector.Error as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"message": f"Lỗi MySQL: {error}"})

    def stream_audio(self, audio_id):
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "SELECT a.audio_data, c.chapter_number, c.title "
            "FROM audios a LEFT JOIN chapters c ON c.id = a.chapter_id "
            "WHERE a.id = %s",
            (audio_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        connection.close()
        if not row:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        audio = row[0]
        download = parse_qs(urlsplit(self.path).query).get("download") == ["1"]
        start = 0
        end = len(audio) - 1
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            requested_range = range_header[6:].split(",", 1)[0]
            range_start, _, range_end = requested_range.partition("-")
            if range_start:
                start = int(range_start)
            elif range_end:
                start = max(len(audio) - int(range_end), 0)
            if range_end and range_start:
                end = int(range_end)
            end = min(end, len(audio) - 1)
            if start > end or start >= len(audio):
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return

        partial_audio = audio[start:end + 1]
        status = HTTPStatus.PARTIAL_CONTENT if range_header else HTTPStatus.OK
        self.send_response(status)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("Content-Length", str(len(partial_audio)))
        if range_header:
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(audio)}")
        if download:
            chapter_number = row[1]
            title = row[2] or f"chapter-{chapter_number or audio_id}"
            filename_fallback = re.sub(r"[^A-Za-z0-9._-]+", "_", title).strip("._") or "chapter"
            filename_fallback = f"chapter-{chapter_number}-{filename_fallback[:60]}.mp3" if chapter_number else f"{audio_id}.mp3"
            filename_encoded = quote(f"{title}.mp3", safe="")
            self.send_header(
                "Content-Disposition",
                f"attachment; filename=\"{filename_fallback}\"; filename*=UTF-8''{filename_encoded}",
            )
        else:
            self.send_header("Content-Disposition", 'inline; filename="story.mp3"')
        try:
            self.end_headers()
            self.wfile.write(partial_audio)
        except ConnectionError:
            pass

    async def synthesize(self, text, voice=f"edge:{VOICE}", progress_callback=None):
        return await synthesize_text(text, voice, progress_callback)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        try:
            self.end_headers()
            self.wfile.write(body)
        except ConnectionError:
            pass

    def translate_path(self, path):
        clean_path = path.split("?", 1)[0]
        requested = (FRONTEND_ROOT / clean_path.lstrip("/")).resolve()
        if requested == FRONTEND_ROOT or FRONTEND_ROOT in requested.parents:
            if requested.exists():
                return str(requested)
            return str(FRONTEND_ROOT / "index.html")
        return str(FRONTEND_ROOT)


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], ConnectionAbortedError):
            return
        super().handle_error(request, client_address)


def ensure_playback_tables():
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS playback_settings ("
        "id TINYINT UNSIGNED NOT NULL PRIMARY KEY,"
        "voice VARCHAR(80) NOT NULL DEFAULT 'edge:vi-VN-HoaiMyNeural',"
        "playback_rate DECIMAL(3,2) NOT NULL DEFAULT 1.00,"
        "volume DECIMAL(3,2) NOT NULL DEFAULT 1.00,"
        "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"
    )
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS chapter_progress ("
        "chapter_id CHAR(32) NOT NULL PRIMARY KEY,"
        "chunk_index INT NOT NULL DEFAULT 0,"
        "position_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,"
        "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        "CONSTRAINT fk_chapter_progress_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE)"
    )
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS story_progress ("
        "story_id CHAR(32) NOT NULL PRIMARY KEY,"
        "chapter_id CHAR(32) NOT NULL,"
        "chapter_number INT NOT NULL,"
        "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
        "CONSTRAINT fk_story_progress_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,"
        "CONSTRAINT fk_story_progress_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE)"
    )
    cursor.execute("INSERT IGNORE INTO playback_settings (id) VALUES (1)")
    connection.commit()
    cursor.close()
    connection.close()


if __name__ == "__main__":
    ensure_playback_tables()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "3001"))
    server = QuietThreadingHTTPServer((host, port), AudioHandler)
    threading.Thread(target=auto_generate_missing_audio, daemon=True).start()
    print(f"Audio Story Reader: http://{host}:{port} (edge-tts {edge_tts.__version__})", flush=True)
    server.serve_forever()
