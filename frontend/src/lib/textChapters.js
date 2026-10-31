const chapterHeading = /^[ \t]*(?:(?:chương|chuong|chapter|chap\.?|tập|tap|phần|phan|part)\s+(\d+|[ivxlcdm]+)\b[ \t]*(?:[:：.、\-–—][ \t]*|[ \t]+)?|thứ\s+(\d+)\s+chương\b[ \t]*(?:[:：.、\-–—][ \t]*|[ \t]+)?)([^\r\n]*)[ \t]*$/gim;

export const EPISODE_TARGET_MINUTES = 60;
export const ESTIMATED_CHARACTERS_PER_MINUTE = 900;
export const EPISODE_CHARACTER_LIMIT =
  EPISODE_TARGET_MINUTES * ESTIMATED_CHARACTERS_PER_MINUTE;

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

export function formatChapterRangeTitle(from, to) {
  return `Chương ${from} - Chương ${to}`;
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
    const chapterNumber = parseChapterNumber(heading[1] || heading[2], index + 1);
    const title = heading[3].trim().replace(/^[：:.\-–—]\s*/, '');

    return {
      chapterNumber,
      title: title || `Chương ${chapterNumber}`,
      content,
    };
  }).filter((chapter) => chapter.content);
}

function findEpisodeBoundary(text, limit) {
  const preferredMinimum = Math.floor(limit * 0.7);
  const paragraphBoundary = text.lastIndexOf("\n\n", limit);
  if (paragraphBoundary >= preferredMinimum) return paragraphBoundary;

  const section = text.slice(0, limit);
  const sentenceBoundaries = [...section.matchAll(/[.!?…]["'”’)]*\s+/g)];
  const sentenceBoundary = sentenceBoundaries[sentenceBoundaries.length - 1];
  if (sentenceBoundary) {
    const boundary = sentenceBoundary.index + sentenceBoundary[0].trimEnd().length;
    if (boundary >= preferredMinimum) return boundary;
  }

  const wordBoundary = Math.max(
    text.lastIndexOf(" ", limit),
    text.lastIndexOf("\n", limit),
    text.lastIndexOf("\t", limit),
  );
  return wordBoundary >= preferredMinimum ? wordBoundary : limit;
}

export function splitTextIntoEpisodes(
  text,
  charactersPerEpisode = EPISODE_CHARACTER_LIMIT,
) {
  if (!Number.isSafeInteger(charactersPerEpisode) || charactersPerEpisode < 1) {
    throw new RangeError("Số ký tự mỗi tập phải là số nguyên lớn hơn 0.");
  }

  let remaining = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const episodes = [];
  while (remaining.length) {
    if (remaining.length <= charactersPerEpisode) {
      episodes.push(remaining);
      break;
    }

    let boundary = findEpisodeBoundary(remaining, charactersPerEpisode);
    if (
      boundary > 0 &&
      boundary < remaining.length &&
      /[\uD800-\uDBFF]/.test(remaining[boundary - 1]) &&
      /[\uDC00-\uDFFF]/.test(remaining[boundary])
    ) {
      boundary -= 1;
    }

    const episode = remaining.slice(0, boundary).trim();
    if (!episode) {
      throw new Error("Không thể chia nội dung TXT thành các tập.");
    }
    episodes.push(episode);
    remaining = remaining.slice(boundary).trim();
  }

  return episodes.map((content, index) => ({
    chapterNumber: index + 1,
    title: `Tập ${index + 1}`,
    content,
  }));
}

export function groupChapters(chapters, chaptersPerEpisode) {
  if (!Number.isInteger(chaptersPerEpisode) || chaptersPerEpisode < 1) {
    throw new RangeError('Số chương gộp mỗi tập phải là số nguyên lớn hơn 0.');
  }

  const groups = [];
  const firstEpisodeNumber = chapters[0]?.chapterNumber || 1;
  for (let start = 0; start < chapters.length; start += chaptersPerEpisode) {
    const group = chapters.slice(start, start + chaptersPerEpisode);
    const firstChapter = group[0];
    const episodeNumber = firstEpisodeNumber + groups.length;
    const titles = group.map((chapter) => chapter.title || `Chương ${chapter.chapterNumber}`);
    const combinedTitle = group.length === 1
      ? `Chương ${episodeNumber}`
      : formatChapterRangeTitle(firstChapter.chapterNumber, group[group.length - 1].chapterNumber);
    const title = combinedTitle.length > 160
      ? `${combinedTitle.slice(0, 157)}...`
      : combinedTitle;

    groups.push({
      chapterNumber: episodeNumber,
      title,
      content: group.length === 1
        ? firstChapter.content
        : group.map((chapter, index) => {
          const chapterTitle = titles[index];
          return `Chương ${chapter.chapterNumber}: ${chapterTitle}\n\n${chapter.content}`;
        }).join('\n\n'),
    });
  }

  return groups;
}
