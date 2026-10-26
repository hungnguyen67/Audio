import { useCallback, useState } from "react";

export const STORAGE_KEYS = {
  voice: "audio-voice",
  playbackRate: "audio-playback-rate",
  autoNext: "audio-auto-next",
  volume: "audio-volume",
  importUrl: "audio-story:lastChapterImportUrl",
};

// Giữ nguyên định dạng cũ trong localStorage (chuỗi thô) để không mất cài đặt của người dùng.
const codecs = {
  string: (raw) => raw,
  number: (raw) => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  },
  boolean: (raw) => raw === "true",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = codecs[typeof fallback](raw);
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

/** Kiểu dữ liệu suy ra từ giá trị mặc định (string | number | boolean). Chỉ nhận giá trị, không nhận updater. */
export function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  const set = useCallback(
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        /* bỏ qua: private mode / hết dung lượng */
      }
    },
    [key],
  );
  return [value, set];
}
