import { useCallback, useEffect, useMemo, useRef } from "react";
import { progressApi } from "../../api/progress";

const SAVE_INTERVAL_MS = 5000;
const SETTINGS_DEBOUNCE_MS = 500;

/**
 * Lưu vị trí nghe + cài đặt lên server:
 * - throttle 5s khi đang phát, ngay lập tức khi pause/seek,
 * - debounce khi đổi voice/speed/volume,
 * - keepalive khi rời trang.
 * Chỉ lưu khi <audio> thật sự đã nạp chương hiện tại (loadedChapterIdRef).
 */
export function usePlaybackPersistence({ audio, loadedChapterIdRef, settings }) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastSavedAt = useRef(0);

  const save = useCallback(
    ({ keepalive = false } = {}) => {
      const chapterId = loadedChapterIdRef.current;
      if (!chapterId) return;
      const { voice, speed, volume } = settingsRef.current;
      lastSavedAt.current = Date.now();
      progressApi
        .savePlaybackState(
          chapterId,
          {
            voice,
            playbackRate: speed,
            volume,
            chunkIndex: 0, // backend còn nhận field này; audio hiện là một tệp liền
            positionSeconds: audio.currentTime || 0,
          },
          { keepalive },
        )
        .catch(() => {});
    },
    [audio, loadedChapterIdRef],
  );

  useEffect(() => {
    const onTimeUpdate = () => {
      if (Date.now() - lastSavedAt.current >= SAVE_INTERVAL_MS) save();
    };
    const onImmediate = () => save({ keepalive: true });
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeked", onImmediate);
    audio.addEventListener("pause", onImmediate);
    window.addEventListener("pagehide", onImmediate);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onImmediate);
      audio.removeEventListener("pause", onImmediate);
      window.removeEventListener("pagehide", onImmediate);
    };
  }, [audio, save]);

  const { voice, speed, volume } = settings;
  useEffect(() => {
    const timer = setTimeout(() => save(), SETTINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [voice, speed, volume, save]);

  return useMemo(() => ({ flush: () => save({ keepalive: true }) }), [save]);
}
