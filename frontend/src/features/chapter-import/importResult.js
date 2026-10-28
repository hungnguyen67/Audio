import { formatChapterRangeTitle } from "../../lib/textChapters";

/** Gộp nhiều chương nguồn thành một tập. Dùng chung cho nhánh thành công lẫn lỗi giữa chừng. */
export function mergeChapters(chapters, fromNumber) {
  const lastChapter = chapters[chapters.length - 1];
  return {
    ...chapters[0],
    chapterNumber: fromNumber,
    title: formatChapterRangeTitle(fromNumber, lastChapter.chapterNumber || fromNumber + chapters.length - 1),
    content: chapters.map((chapter) => chapter.content).join("\n\n"),
  };
}

/**
 * Biến kết quả tải theo link thành { message, pending?, patch? } để reducer áp dụng.
 * `fetched`: các chương đã tải được; `failure`: lỗi (nếu dừng giữa chừng).
 */
export function buildUrlImportResult({ fetched, from, to, failure, source, form, storyId }) {
  const explain = (message) => source.explainError?.(message) ?? message;

  if (!fetched.length) {
    return { message: `${explain(failure.message)} (lỗi tại chương ${from})` };
  }

  const storyPatch =
    !storyId && !form.story.trim() && fetched[0].storyTitle ? { story: fetched[0].storyTitle } : {};

  if (from !== to) {
    const merged = mergeChapters(fetched, from);
    return {
      pending: { chapters: [merged], mergedFrom: fetched.length },
      patch: { ...storyPatch, number: String(from), title: merged.title, content: merged.content },
      message: failure
        ? `Đã gộp ${fetched.length} chương thành 1 tập; dừng tại chương ${from + fetched.length}: ${failure.message}`
        : `Đã gộp ${fetched.length} chương thành 1 tập (số ${from}).`,
    };
  }

  const chapter = fetched[0];
  return {
    patch: {
      ...storyPatch,
      number: String(chapter.chapterNumber),
      title: chapter.title,
      content: chapter.content,
    },
    message: `Đã lấy ${chapter.content.length.toLocaleString("vi-VN")} ký tự. Hãy kiểm tra rồi bấm Lưu.`,
  };
}
