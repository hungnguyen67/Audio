const CHAPTER_PATH = /\/chuong-\d+\/?$/i;

export const metruyenchu = {
  id: "metruyenchu",
  matches: (url) => url.hostname === "metruyenchu.co" && CHAPTER_PATH.test(url.pathname),
  buildUrl(url, chapterNumber) {
    const next = new URL(url);
    next.pathname = `${url.pathname.replace(CHAPTER_PATH, "")}/chuong-${chapterNumber}`;
    return next.toString();
  },
};
