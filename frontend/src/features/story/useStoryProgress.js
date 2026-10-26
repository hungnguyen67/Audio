import { useEffect, useState } from "react";
import { progressApi } from "../../api/progress";

/** Số chương đã nghe gần nhất của truyện (lấy từ server một lần khi vào trang). */
export function useStoryProgress(storyId) {
  const [chapterNumber, setChapterNumber] = useState(null);
  useEffect(() => {
    setChapterNumber(null);
    if (!storyId) return undefined;
    let active = true;
    progressApi
      .getStoryProgress(storyId)
      .then((progress) => {
        if (active && progress.chapterNumber) setChapterNumber(progress.chapterNumber);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [storyId]);
  return chapterNumber;
}
