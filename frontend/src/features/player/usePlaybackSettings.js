import { useCallback, useEffect, useMemo } from "react";
import { STORAGE_KEYS, usePersistentState } from "../../lib/storage";
import { DEFAULT_VOICE } from "./constants";

/** voice / speed / volume / autoNext: lưu localStorage và đồng bộ lên <audio> ở một nơi duy nhất. */
export function usePlaybackSettings(audio) {
  const [voice, setVoice] = usePersistentState(STORAGE_KEYS.voice, DEFAULT_VOICE);
  const [speed, setSpeed] = usePersistentState(STORAGE_KEYS.playbackRate, 1);
  const [volume, setVolume] = usePersistentState(STORAGE_KEYS.volume, 1);
  const [autoNext, setAutoNext] = usePersistentState(STORAGE_KEYS.autoNext, false);

  useEffect(() => {
    // defaultPlaybackRate: đổi `src` sẽ reset playbackRate về giá trị này.
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
  }, [audio, speed]);

  useEffect(() => {
    audio.volume = volume;
  }, [audio, volume]);

  /** Áp trạng thái đã lưu trên server của một chương. */
  const apply = useCallback(
    (saved) => {
      if (saved.voice) setVoice(saved.voice);
      if (Number.isFinite(saved.playbackRate)) setSpeed(saved.playbackRate);
      if (Number.isFinite(saved.volume)) setVolume(saved.volume);
    },
    [setVoice, setSpeed, setVolume],
  );

  return useMemo(
    () => ({ voice, speed, volume, autoNext, setVoice, setSpeed, setVolume, setAutoNext, apply }),
    [voice, speed, volume, autoNext, setVoice, setSpeed, setVolume, setAutoNext, apply],
  );
}
