import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { audioApi } from "../../api/audio";
import { progressApi } from "../../api/progress";
import { selectStoryById } from "../../entities/stories/selectors";
import { resolveAudioUrl, startProgressiveAudio } from "./audioJob";
import { IDLE_STATUS } from "./constants";
import { usePlaybackPersistence } from "./usePlaybackPersistence";
import { usePlaybackSettings } from "./usePlaybackSettings";

export const PlayerContext = createContext(null);

const AUTO_NEXT_DELAY_MS = 700;

async function loadAndPlay(audio, url, startAt, signal) {
  audio.src = `${url}?t=${Date.now()}`;
  if (startAt > 0) {
    audio.addEventListener(
      "loadedmetadata",
      () => {
        audio.currentTime = startAt;
      },
      { once: true },
    );
  }
  try {
    await audio.play();
  } catch (error) {
    if (signal.aborted || error.name === "AbortError") return false;
    throw error;
  }
  return !signal.aborted;
}

export function PlayerProvider({ children }) {
  // Một <audio> duy nhất cho cả app, không gắn vào DOM → không bị unmount khi đổi route.
  const audio = useMemo(() => new Audio(), []);
  const [current, setCurrent] = useState(null); // { storyId, chapterId }
  const [status, setStatus] = useState(IDLE_STATUS);
  const settings = usePlaybackSettings(audio);

  const story = useSelector(selectStoryById(current?.storyId));
  const chapter = story?.chapters.find((item) => item.id === current?.chapterId) ?? null;

  const requestRef = useRef(null);
  const nextTimerRef = useRef(null);
  const loadedChapterIdRef = useRef(null);
  const streamingJobRef = useRef(null);
  const playbackStartedRef = useRef(false);
  const playbackErrorRef = useRef(false);
  const generationStatusRef = useRef(null);
  const persistence = usePlaybackPersistence({ audio, loadedChapterIdRef, settings });

  const latest = useRef({});
  latest.current = { story, current, settings };

  const cancelPending = useCallback(() => {
    requestRef.current?.abort();
    clearTimeout(nextTimerRef.current);
  }, []);

  const play = useCallback(
    async (storyId, target) => {
      persistence.flush(); // lưu vị trí chương đang nghe trước khi chuyển
      cancelPending();
      const controller = new AbortController();
      requestRef.current = controller;
      const { signal } = controller;

      streamingJobRef.current = null;
      playbackStartedRef.current = false;
      playbackErrorRef.current = false;
      generationStatusRef.current = null;
      audio.pause();
      loadedChapterIdRef.current = null;
      setCurrent({ storyId, chapterId: target.id });
      progressApi.saveStoryProgress(storyId, target).catch(() => {});
      setStatus("Đang kiểm tra audio...");

      try {
        const saved = await progressApi.getPlaybackState(target.id);
        signal.throwIfAborted();
        latest.current.settings.apply(saved);
        const source = await resolveAudioUrl(target.id, saved.voice, { signal });
        if (source.jobId) {
          streamingJobRef.current = source.jobId;
          setStatus("Đang chuẩn bị audio để phát liền mạch...");
          const { feedPromise } = await startProgressiveAudio(audio, source.jobId, {
            signal,
            startAt: saved.positionSeconds || 0,
            onProgress: (progress) => {
              generationStatusRef.current = `Chương ${target.number} · ${progress}`;
              setStatus(
                playbackStartedRef.current
                  ? `Đang phát · ${generationStatusRef.current}`
                  : generationStatusRef.current,
              );
            },
            onJobNotFound: () => audioApi.createJob(target.id, saved.voice),
            onError: (streamError) => {
              playbackErrorRef.current = true;
              setStatus(`Audio đã tạo một phần; không thể tiếp tục tạo: ${streamError.message}`);
            },
          });
          feedPromise
            .then(() => {
              if (!signal.aborted && !playbackErrorRef.current) {
                streamingJobRef.current = null;
                generationStatusRef.current = `Đã tạo xong audio chương ${target.number}`;
                setStatus(`Đang phát · ${generationStatusRef.current}`);
              }
            })
            .catch((streamError) => {
              if (!signal.aborted && !playbackErrorRef.current) {
                playbackErrorRef.current = true;
                setStatus(`Không thể tiếp tục tải audio: ${streamError.message}`);
              }
            });
          loadedChapterIdRef.current = target.id;
          playbackStartedRef.current = true;
        } else {
          setStatus("Đang phát toàn bộ tập...");
          const started = await loadAndPlay(audio, source.url, saved.positionSeconds || 0, signal);
          if (started) loadedChapterIdRef.current = target.id;
        }
      } catch (error) {
        if (!signal.aborted) setStatus(error.message);
      }
    },
    [audio, cancelPending, persistence],
  );

  const stop = useCallback(() => {
    persistence.flush();
    cancelPending();
    streamingJobRef.current = null;
    playbackStartedRef.current = false;
    playbackErrorRef.current = false;
    generationStatusRef.current = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    loadedChapterIdRef.current = null;
    setCurrent(null);
    setStatus(IDLE_STATUS);
  }, [audio, cancelPending, persistence]);

  const seekBy = useCallback(
    (seconds) => {
      const progressive = audio.src.startsWith("blob:");
      let seekStart = 0;
      let seekEnd = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (progressive && audio.buffered.length) {
        seekStart = audio.buffered.start(0);
        seekEnd = audio.buffered.end(audio.buffered.length - 1);
      } else if (!seekEnd && audio.seekable.length) {
        seekEnd = audio.seekable.end(audio.seekable.length - 1);
      }
      if (seekEnd <= 0) return;
      audio.currentTime = Math.min(seekEnd, Math.max(seekStart, audio.currentTime + seconds));
    },
    [audio],
  );

  const changeVoice = useCallback((value) => {
    latest.current.settings.setVoice(value);
    if (latest.current.current) setStatus("Giọng thay đổi. Nhấn vào chương để nghe lại.");
  }, []);

  useEffect(() => {
    const onEnded = () => {
      const { story: currentStory, current: now } = latest.current;
      if (!currentStory || !now) return;
      const index = currentStory.chapters.findIndex((item) => item.id === now.chapterId);
      const next = index >= 0 ? currentStory.chapters[index + 1] : null;
      if (!next) {
        setStatus("Đã nghe hết truyện");
        return;
      }
      setStatus("Đã xong, đang chuyển chương tiếp...");
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = setTimeout(() => play(now.storyId, next), AUTO_NEXT_DELAY_MS);
    };
    const onError = () => {
      if (audio.getAttribute("src")) {
        playbackErrorRef.current = true;
        setStatus("Không thể phát audio. Hãy tải lại trang và chọn lại chương.");
      }
    };
    const onPlaying = () => {
      playbackStartedRef.current = true;
      if (streamingJobRef.current) {
        setStatus(
          generationStatusRef.current
            ? `Đang phát · ${generationStatusRef.current}`
            : "Đang phát audio · đang chờ tiến độ tạo",
        );
      }
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("playing", onPlaying);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("playing", onPlaying);
    };
  }, [audio, play]);

  const value = useMemo(
    () => ({ audio, current, chapter, status, settings, play, stop, seekBy, changeVoice }),
    [audio, current, chapter, status, settings, play, stop, seekBy, changeVoice],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
