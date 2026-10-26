import { Select } from "../../components/Select";
import { AudioControls, SeekButtons } from "./AudioControls";
import { SPEEDS, VOICES } from "./constants";
import { usePlayer } from "./usePlayer";

/** Bản đầy đủ, hiển thị trong trang truyện. Mọi state lấy từ context. */
export function PlayerCard() {
  const { chapter, status, settings, changeVoice } = usePlayer();

  return (
    <div className="player-card">
      <div className="player-label">Đang phát</div>
      <div className="player-title">{chapter?.title || "Chưa chọn chương"}</div>
      <div className="player-status">{status}</div>

      <div className="ctrl-row">
        <div className="ctrl-col">
          <label className="ctrl-label">Giọng đọc</label>
          <Select value={settings.voice} options={VOICES} onChange={changeVoice} />
        </div>
        <div className="ctrl-col">
          <label className="ctrl-label">Tốc độ</label>
          <Select
            value={settings.speed}
            options={SPEEDS}
            onChange={(value) => settings.setSpeed(Number(value))}
          />
        </div>
      </div>

      <AudioControls showVolume />
      <div className="audio-actions-row">
        <label className="auto-label">
          <input
            type="checkbox"
            checked={settings.autoNext}
            onChange={(event) => settings.setAutoNext(event.target.checked)}
          />
          <span className="check-box" aria-hidden="true" />
          <span className="auto-label-text">Tự động phát chương</span>
        </label>
        <SeekButtons />
      </div>
    </div>
  );
}
