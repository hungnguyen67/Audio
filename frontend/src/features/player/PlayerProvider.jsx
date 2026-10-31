import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { audioApi } from "../../api/audio";
import { progressApi } from "../../api/progress";
import { selectStoryById } from "../../entities/stories/selectors";
import { resolveAudioUrl, waitForAudioUrl } from "./audioJob";
import { IDLE_STATUS } from "./constants";
import { PLAYER_WINDOW_CHANNEL, postPlayerWindowMessage } from "./playerWindow";
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
  const [externalPlayerActive, setExternalPlayerActive] = useState(false);
  const settings = usePlaybackSettings(audio);

  const story = useSelector(selectStoryById(current?.storyId));
  const chapter = story?.chapters.find((item) => item.id === current?.chapterId) ?? null;

  const requestRef = useRef(null);
  const nextTimerRef = useRef(null);
  const loadedChapterIdRef = useRef(null);
  const externalPlayerActiveRef = useRef(false);
  const persistence = usePlaybackPersistence({ audio, loadedChapterIdRef, settings });

  const latest = useRef({});
  latest.current = { story, current, settings };

  useEffect(() => {
    if (window.location.pathname === "/player-window" || !current) return undefined;
    let lastSentAt = 0;
    const sendState = () => {
      const now = Date.now();
      if (now - lastSentAt < 700) return;
      lastSentAt = now;
      postPlayerWindowMessage({
        type: "playback-state",
        current,
        positionSeconds: audio.currentTime || 0,
      });
    };
    audio.addEventListener("timeupdate", sendState);
    sendState();
    return () => audio.removeEventListener("timeupdate", sendState);
  }, [audio, current]);

  const cancelPending = useCallback(() => {
    requestRef.current?.abort();
    clearTimeout(nextTimerRef.current);
  }, []);

  const setExternalPlayer = useCallback((active) => {
    externalPlayerActiveRef.current = active;
    setExternalPlayerActive(active);
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/player-window" || !("BroadcastChannel" in window)) {
      return undefined;
    }
    const channel = new BroadcastChannel(PLAYER_WINDOW_CHANNEL);
    const onMessage = (event) => {
      if (event.data?.type === "player-window-started") {
        audio.pause();
        setExternalPlayer(true);
        setStatus("Đang phát trong cửa sổ nghe riêng.");
      } else if (event.data?.type === "player-window-chapter-changed") {
        const nextCurrent = event.data.current;
        const activeCurrent = latest.current.current;
        if (
          externalPlayerActiveRef.current &&
          nextCurrent?.storyId === activeCurrent?.storyId &&
          nextCurrent?.chapterId
        ) {
          setCurrent(nextCurrent);
        }
      } else if (event.data?.type === "player-window-closed") {
        setExternalPlayer(false);
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [audio, setExternalPlayer]);

  const play = useCallback(
    async (storyId, target, options = {}) => {
      if (externalPlayerActiveRef.current && "BroadcastChannel" in window) {
        const channel = new BroadcastChannel(PLAYER_WINDOW_CHANNEL);
        channel.postMessage({ type: "stop-player-window" });
        channel.close();
        setExternalPlayer(false);
      }
      persistence.flush(); // lưu vị trí chương đang nghe trước khi chuyển
      cancelPending();
      const controller = new AbortController();
      requestRef.current = controller;
      const { signal } = controller;

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
        const requestedPosition = typeof options.positionSeconds === "function"
          ? options.positionSeconds()
          : options.positionSeconds;
        const startAt = Number.isFinite(requestedPosition)
          ? Math.max(0, requestedPosition)
          : saved.positionSeconds || 0;
        if (source.jobId) {
          setStatus("Đang tạo audio, chờ hoàn tất mới phát...");
          const url = await waitForAudioUrl(source.jobId, {
            signal,
            onProgress: (progress) => {
              setStatus(`Chương ${target.number} · ${progress}`);
            },
            onJobNotFound: () => audioApi.createJob(target.id, saved.voice),
          });
          signal.throwIfAborted();
          setStatus("Đã tạo xong audio. Đang phát...");
          const started = await loadAndPlay(audio, url, startAt, signal);
          if (started) loadedChapterIdRef.current = target.id;
          return started;
        } else {
          setStatus("Đang phát toàn bộ tập...");
          const started = await loadAndPlay(audio, source.url, startAt, signal);
          if (started) loadedChapterIdRef.current = target.id;
          return started;
        }
      } catch (error) {
        if (!signal.aborted) setStatus(error.message);
        return false;
      }
    },
    [audio, cancelPending, persistence, setExternalPlayer],
  );

  const stop = useCallback(() => {
    if (externalPlayerActiveRef.current && "BroadcastChannel" in window) {
      const channel = new BroadcastChannel(PLAYER_WINDOW_CHANNEL);
      channel.postMessage({ type: "stop-player-window" });
      channel.close();
      setExternalPlayer(false);
    }
    persistence.flush();
    cancelPending();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    loadedChapterIdRef.current = null;
    setCurrent(null);
    setStatus(IDLE_STATUS);
  }, [audio, cancelPending, persistence, setExternalPlayer]);

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
        setStatus("Không thể phát audio. Hãy tải lại trang và chọn lại chương.");
      }
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [audio, play]);

  const value = useMemo(
    () => ({
      audio,
      current,
      chapter,
      status,
      settings,
      play,
      stop,
      seekBy,
      changeVoice,
      externalPlayerActive,
    }),
    [audio, current, chapter, status, settings, play, stop, seekBy, changeVoice, externalPlayerActive],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
