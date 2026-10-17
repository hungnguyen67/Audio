const chapterHeading = /^[ \t]*(?:chương|chuong|chapter|chap\.?|tập|tap|phần|phan|part)\s+(\d+|[ivxlcdm]+)\b[ \t]*(?:[:：.、\-–—][ \t]*|[ \t]+)?([^\r\n]*)[ \t]*$/gim;

function parseChapterNumber(value, fallback) {
  if (/^\d+$/.test(value)) return Number(value);

  const romanValues = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const roman = value.toLowerCase();
  let number = 0;
  for (let index = 0; index < roman.length; index += 1) {
    const current = romanValues[roman[index]];
    const next = romanValues[roman[index + 1]] || 0;
    number += current < next ? -current : current;
  }
  return number || fallback;
}

export function splitTextIntoChapters(text) {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const headings = [...normalizedText.matchAll(chapterHeading)];
  if (!headings.length) return [];

  return headings.map((heading, index) => {
    const headingEnd = heading.index + heading[0].length;
    const nextHeadingStart = headings[index + 1]?.index ?? normalizedText.length;
    const prefix = index === 0 ? normalizedText.slice(0, heading.index).trim() : '';
    const body = normalizedText.slice(headingEnd, nextHeadingStart).trim();
    const content = [prefix, body].filter(Boolean).join('\n\n');
    const title = heading[2].trim().replace(/^[：:.\-–—]\s*/, '');

    return {
      chapterNumber: parseChapterNumber(heading[1], index + 1),
      title: title || `Chương ${parseChapterNumber(heading[1], index + 1)}`,
      content,
    };
  }).filter((chapter) => chapter.content);
}
