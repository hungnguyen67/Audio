import { metruyenchu } from "./metruyenchu";
import { truyenH } from "./truyenH";

// Thêm nguồn mới = thêm một file và đưa vào mảng này.
const SOURCES = [metruyenchu, truyenH];

const UNSUPPORTED_URL =
  "Hãy dùng link HTTPS metruyenchu.co/.../chuong-1 hoặc truyen-h.com/reader?story=...&chapter=1.";

/** Thuần, không phụ thuộc React. Trả về { ok:false, error } hoặc { ok:true, source, urlForChapter(n) }. */
export function parseSourceUrl(raw) {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Hãy nhập link chương." };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "Link chương không hợp lệ." };
  }

  const source = SOURCES.find((candidate) => candidate.matches(url));
  const unsafe =
    url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password;
  if (!source || unsafe) return { ok: false, error: UNSUPPORTED_URL };

  return {
    ok: true,
    source,
    urlForChapter: (chapterNumber) => source.buildUrl(url, chapterNumber),
  };
}

export function parseChapterRange(fromRaw, toRaw) {
  const from = Number(fromRaw);
  const to = Number(toRaw);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return {
      ok: false,
      error: "Khoảng chương không hợp lệ. Hãy nhập số chương bắt đầu và kết thúc hợp lệ.",
    };
  }
  return { ok: true, from, to };
}
