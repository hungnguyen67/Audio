import { useEffect, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { usePlayer } from "./usePlayer";

function useAudioTime(audio) {
  const [time, setTime] = useState({ currentTime: 0, duration: 0, paused: true });
  useEffect(() => {
    const sync = () =>
      setTime({
        currentTime: audio.currentTime || 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        paused: audio.paused,
      });
    const events = ["timeupdate", "durationchange", "loadedmetadata", "play", "pause", "emptied", "seeked"];
    events.forEach((name) => audio.addEventListener(name, sync));
    sync();
    return () => events.forEach((name) => audio.removeEventListener(name, sync));
  }, [audio]);
  return time;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function AudioControls() {
  const { audio } = usePlayer();
  const { currentTime, duration, paused } = useAudioTime(audio);
  const ready = duration > 0;

  const togglePlay = () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  return (
    <div className="audio-controls-wrap">
      <div className="audio-controls">
        <button
          type="button"
          className="audio-play-btn"
          onClick={togglePlay}
          disabled={!ready}
          aria-label={paused ? "Phát" : "Tạm dừng"}
        >
          {paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
        </button>
        <input
          className="audio-range"
          type="range"
          min="0"
          max={duration || 0}
          step="1"
          value={Math.min(currentTime, duration || 0)}
          style={{
            "--range-progress": `${duration ? (currentTime / duration) * 100 : 0}%`,
          }}
          disabled={!ready}
          aria-label="Thanh tua"
          onChange={(event) => {
            audio.currentTime = Number(event.target.value);
          }}
        />
        <span className="audio-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

export function AudioVolume() {
  const { settings } = usePlayer();
  return (
    <div className="audio-volume">
      <Volume2 size={15} aria-hidden="true" />
      <input
        className="audio-range"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={settings.volume}
        style={{ "--range-progress": `${settings.volume * 100}%` }}
        aria-label="Âm lượng"
        onChange={(event) => settings.setVolume(Number(event.target.value))}
      />
    </div>
  );
}

export function SeekButtons() {
  const { seekBy } = usePlayer();
  return (
    <div className="audio-seek-controls" aria-label="Điều khiển tua audio">
      <button type="button" onClick={() => seekBy(-10)} aria-label="Lùi 10 giây" title="Lùi 10 giây">
        −10s
      </button>
      <button type="button" onClick={() => seekBy(10)} aria-label="Tiến 10 giây" title="Tiến 10 giây">
        +10s
      </button>
    </div>
  );
}
