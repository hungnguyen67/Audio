import { Select } from "../../components/Select";
import { AudioControls, AudioVolume, SeekButtons } from "./AudioControls";
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

      <AudioControls />

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

      <div className="audio-actions-row">
        <AudioVolume />
        <SeekButtons />
      </div>
    </div>
  );
}
