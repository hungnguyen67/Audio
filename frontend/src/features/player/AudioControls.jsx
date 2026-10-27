import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { usePlayer } from "./usePlayer";

function useAudioTime(audio) {
  const [time, setTime] = useState({ currentTime: 0, duration: 0, minTime: 0, paused: true, live: false, ready: false });
  useEffect(() => {
    const sync = () => {
      const progressive = audio.src.startsWith("blob:");
      const live = progressive && audio.duration === Infinity;
      let duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const ranges = progressive ? audio.buffered : audio.seekable;
      let minTime = 0;
      if (progressive && ranges.length) {
        minTime = ranges.start(0);
        duration = ranges.end(ranges.length - 1);
      }
      setTime({
        currentTime: audio.currentTime || 0,
        duration,
        minTime,
        paused: audio.paused,
        live: live && duration > 0,
        ready: audio.readyState >= 2,
      });
    };
    const events = [
      "timeupdate",
      "durationchange",
      "progress",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "playing",
      "waiting",
      "play",
      "pause",
      "emptied",
      "seeked",
    ];
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
  const { currentTime, duration, minTime, paused, live, ready } = useAudioTime(audio);
  const [previewTime, setPreviewTime] = useState(null);
  const seekingRef = useRef(false);
  const seekRange = Math.max(0, duration - minTime);
  const seekProgress = seekRange
    ? ((Math.min(currentTime, duration) - minTime) / seekRange) * 100
    : 0;
  const previewPosition = previewTime === null || !seekRange
    ? 0
    : ((previewTime - minTime) / seekRange) * 100;

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
        <div className={`audio-seek-wrap${previewTime !== null ? " is-previewing" : ""}`}>
          {previewTime !== null && (
            <span
              className="audio-seek-preview"
              style={{ "--seek-preview-position": `${previewPosition}%` }}
              aria-hidden="true"
            >
              {formatTime(previewTime)}
            </span>
          )}
          <input
            className="audio-range"
            type="range"
            min={minTime}
            max={duration || 0}
            step="1"
            value={Math.min(duration || 0, Math.max(minTime, currentTime))}
            style={{
              "--range-progress": `${seekProgress}%`,
            }}
            disabled={!ready || duration <= 0}
            aria-label="Thanh tua"
            onChange={(event) => {
              const time = Number(event.target.value);
              audio.currentTime = time;
              if (seekingRef.current) setPreviewTime(time);
            }}
            onPointerMove={(event) => {
              if (event.pointerType === "mouse" && !seekingRef.current) {
                const bounds = event.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
                setPreviewTime(minTime + ratio * seekRange);
              } else if (seekingRef.current) {
                setPreviewTime(Number(event.currentTarget.value));
              }
            }}
            onPointerLeave={() => {
              if (!seekingRef.current) setPreviewTime(null);
            }}
            onPointerDown={(event) => {
              seekingRef.current = true;
              setPreviewTime(Number(event.currentTarget.value));
            }}
            onPointerUp={() => {
              seekingRef.current = false;
              window.setTimeout(() => setPreviewTime(null), 800);
            }}
            onFocus={() => setPreviewTime(currentTime)}
            onBlur={() => {
              seekingRef.current = false;
              setPreviewTime(null);
            }}
          />
        </div>
        <span className="audio-time">
          {formatTime(currentTime)} / {formatTime(duration)}{live ? " · đang tạo" : ""}
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
  const { audio, seekBy } = usePlayer();
  const { duration } = useAudioTime(audio);
  const canSeek = duration > 0;
  return (
    <div className="audio-seek-controls" aria-label="Điều khiển tua audio">
      <button type="button" onClick={() => seekBy(-10)} disabled={!canSeek} aria-label="Lùi 10 giây" title="Lùi 10 giây">
        <RotateCcw size={17} aria-hidden="true" />
        <span>10s</span>
      </button>
      <button type="button" onClick={() => seekBy(10)} disabled={!canSeek} aria-label="Tiến 10 giây" title="Tiến 10 giây">
        <RotateCw size={17} aria-hidden="true" />
        <span>10s</span>
      </button>
    </div>
  );
}
