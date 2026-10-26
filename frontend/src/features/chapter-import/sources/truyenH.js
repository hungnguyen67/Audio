const MISSING_DATA = "Không tìm thấy dữ liệu chương trên trang Truyện H.";

export const truyenH = {
  id: "truyen-h",
  matches: (url) =>
    url.hostname === "truyen-h.com" &&
    url.pathname === "/reader" &&
    /^[A-Za-z0-9_-]{1,200}$/.test(url.searchParams.get("story") || "") &&
    /^\d+$/.test(url.searchParams.get("chapter") || ""),
  buildUrl(url, chapterNumber) {
    const next = new URL(url);
    next.searchParams.set("chapter", String(chapterNumber));
    return next.toString();
  },
  explainError(message) {
    return message === MISSING_DATA
      ? "Truyện H không gửi nội dung chương; nguồn đang yêu cầu xác minh chống bot hoặc đăng nhập. Hãy mở chương trên trang nguồn rồi dán nội dung vào form."
      : message;
  },
};
