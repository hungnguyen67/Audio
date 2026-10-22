from html.parser import HTMLParser
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

CHAPTER_URL_PATTERN = re.compile(r"^/truyen/[^/]+/chuong-(\d+)/?$", re.IGNORECASE)
TRUYEN_H_HOST = "truyen-h.com"
METRUYENCHU_HOST = "metruyenchu.co"
MAX_CHAPTER_PAGE_BYTES = 5 * 1024 * 1024
CHAPTER_PAGE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class ChapterPageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.article_depth = 0
        self.active_capture = None
        self.capture_parts = []
        self.page_title = ""
        self.heading = ""
        self.paragraphs = []

    def handle_starttag(self, tag, _attrs):
        if tag == "article":
            self.article_depth += 1
        if tag == "title" or tag == "h1" or (tag == "p" and self.article_depth):
            self.active_capture = tag
            self.capture_parts = []
        elif tag == "br" and self.active_capture == "p":
            self.capture_parts.append("\n")

    def handle_data(self, data):
        if self.active_capture:
            self.capture_parts.append(data)

    def handle_endtag(self, tag):
        if self.active_capture == tag:
            text = re.sub(r"\s+", " ", "".join(self.capture_parts)).strip()
            if tag == "title":
                self.page_title = text
            elif tag == "h1":
                self.heading = text
            elif tag == "p" and text:
                self.paragraphs.append(text)
            self.active_capture = None
            self.capture_parts = []
        if tag == "article" and self.article_depth:
            self.article_depth -= 1


class SameHostRedirectHandler(HTTPRedirectHandler):
    def __init__(self, allowed_host):
        super().__init__()
        self.allowed_host = allowed_host

    def redirect_request(self, request, response, code, message, headers, new_url):
        redirected_url = urlsplit(new_url)
        if (
            redirected_url.scheme != "https"
            or redirected_url.hostname != self.allowed_host
            or redirected_url.port not in (None, 443)
            or redirected_url.username
            or redirected_url.password
        ):
            raise ValueError(f"Trang chương chuyển hướng ra ngoài {self.allowed_host}; đã hủy để bảo vệ kết nối.")
        return super().redirect_request(request, response, code, message, headers, new_url)


def extract_truyen_h_reader_data(html):
    marker = "window.SSR_READER"
    marker_index = html.find(marker)
    if marker_index < 0:
        raise RuntimeError(
            "Truyện H không gửi nội dung chương trong phản hồi; nguồn yêu cầu xác minh chống bot "
            "hoặc đăng nhập. Hãy dán nội dung chương vào form nếu importer không truy cập được."
        )

    assignment_index = marker_index + len(marker)
    while assignment_index < len(html) and html[assignment_index].isspace():
        assignment_index += 1
    if assignment_index >= len(html) or html[assignment_index] != "=":
        raise RuntimeError("Dữ liệu chương trên trang Truyện H không hợp lệ.")

    assignment_index += 1
    while assignment_index < len(html) and html[assignment_index].isspace():
        assignment_index += 1
    try:
        reader_data, _ = json.JSONDecoder().raw_decode(html, assignment_index)
    except json.JSONDecodeError as error:
        raise RuntimeError("Không thể đọc dữ liệu chương trên trang Truyện H.") from error
    if not isinstance(reader_data, dict):
        raise RuntimeError("Dữ liệu chương trên trang Truyện H không hợp lệ.")
    return reader_data


def fetch_chapter_from_url(url):
    parsed_url = urlsplit(url)
    if (
        parsed_url.scheme != "https"
        or parsed_url.port not in (None, 443)
        or parsed_url.username
        or parsed_url.password
    ):
        raise ValueError("Link chương phải dùng HTTPS và không được chứa thông tin đăng nhập.")

    if parsed_url.hostname == METRUYENCHU_HOST:
        chapter_match = CHAPTER_URL_PATTERN.fullmatch(parsed_url.path)
        if not chapter_match:
            raise ValueError(
                "Link không hợp lệ. Hãy dùng https://metruyenchu.co/truyen/ten-truyen/chuong-1"
            )
        chapter_number = int(chapter_match.group(1))
    elif parsed_url.hostname == TRUYEN_H_HOST:
        if parsed_url.path != "/reader":
            raise ValueError("Link Truyện H phải có dạng https://truyen-h.com/reader?story=...&chapter=1")
        query = parse_qs(parsed_url.query, keep_blank_values=True)
        story_ids = query.get("story", [])
        chapter_numbers = query.get("chapter", [])
        if (
            len(story_ids) != 1
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", story_ids[0])
            or len(chapter_numbers) != 1
            or not chapter_numbers[0].isdigit()
        ):
            raise ValueError("Link Truyện H cần có mã truyện story và số chương chapter hợp lệ.")
        chapter_number = int(chapter_numbers[0])
    else:
        raise ValueError("Chỉ hỗ trợ link HTTPS từ metruyenchu.co hoặc truyen-h.com.")

    if chapter_number < 1:
        raise ValueError("Số chương trong link phải lớn hơn 0.")

    request = Request(
        url,
        headers={
            "User-Agent": CHAPTER_PAGE_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "vi,en-US;q=0.8,en;q=0.6",
        },
    )
    try:
        with build_opener(SameHostRedirectHandler(parsed_url.hostname)).open(request, timeout=20) as response:
            if response.status != HTTPStatus.OK:
                raise RuntimeError(f"Trang nguồn trả về HTTP {response.status}.")
            if response.headers.get_content_type() != "text/html":
                raise RuntimeError("Link không trả về trang HTML.")
            html = response.read(MAX_CHAPTER_PAGE_BYTES + 1)
            if len(html) > MAX_CHAPTER_PAGE_BYTES:
                raise RuntimeError("Trang chương quá lớn, không thể nhập an toàn.")
            encoding = response.headers.get_content_charset() or "utf-8"
    except HTTPError as error:
        raise RuntimeError(f"Không tải được trang nguồn: HTTP {error.code}.") from error
    except URLError as error:
        raise RuntimeError(f"Không kết nối được trang nguồn: {error.reason}.") from error

    decoded_html = html.decode(encoding, errors="replace")
    if parsed_url.hostname == TRUYEN_H_HOST:
        reader_data = extract_truyen_h_reader_data(decoded_html)
        source_chapter_number = reader_data.get("chapterNum")
        if not isinstance(source_chapter_number, int) or source_chapter_number != chapter_number:
            raise RuntimeError("Số chương trong dữ liệu trang Truyện H không khớp với link.")
        content = reader_data.get("chapterContent")
        if not isinstance(content, str):
            raise RuntimeError("Không tìm thấy nội dung chương trên trang Truyện H.")
        content = re.sub(r"[ \t]+\n", "\n", content.replace("\r\n", "\n").replace("\r", "\n"))
        content = re.sub(r"\n{3,}", "\n\n", content).strip()
        chapter_title = reader_data.get("chapterTitle")
        story_title = reader_data.get("storyTitle")
    else:
        parser = ChapterPageParser()
        parser.feed(decoded_html)
        content = "\n\n".join(parser.paragraphs)
        title_match = re.search(r"[-|–—]\s*(Chương\s+\d+.*)$", parser.page_title, re.IGNORECASE)
        chapter_title = title_match.group(1).strip() if title_match else f"Chương {chapter_number}"
        story_title = parser.heading

    if not isinstance(chapter_title, str) or not chapter_title.strip():
        chapter_title = f"Chương {chapter_number}"
    if not isinstance(story_title, str):
        story_title = ""
    if not isinstance(content, str) or len(content) < 100:
        raise RuntimeError("Không tìm thấy nội dung chương. Trang có thể đã đổi cấu trúc hoặc yêu cầu đăng nhập.")

    return {
        "chapterNumber": chapter_number,
        "title": chapter_title,
        "storyTitle": story_title,
        "content": content,
        "sourceUrl": url,
    }
