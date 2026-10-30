import { ExternalLink } from "lucide-react";
import { toast } from "../../components/Toast";
import { usePlayer } from "./usePlayer";

export function PopoutPlayerButton({
  className = "btn btn-outline player-popout-button",
}) {
  const { audio, current, chapter } = usePlayer();

  if (window.location.pathname === "/player-window") return null;

  const openPlayerWindow = () => {
    if (!current || !chapter) return;
    const params = new URLSearchParams({
      story: current.storyId,
      chapter: current.chapterId,
      position: String(audio.currentTime || 0),
    });
    const playerWindow = window.open(
      `/player-window?${params}`,
      "audio-story-player-window",
      "popup,width=420,height=480,resizable=yes",
    );
    if (!playerWindow) {
      toast.error(
        "Không thể mở cửa sổ nghe",
        "Hãy cho phép trang web mở cửa sổ bật lên rồi thử lại.",
      );
      return;
    }
    playerWindow.focus();
  };

  return (
    <button
      type="button"
      className={className}
      onClick={openPlayerWindow}
      disabled={!current || !chapter}
      title="Mở trình phát ở cửa sổ riêng để tiếp tục nghe khi đóng tab này"
    >
      <ExternalLink size={15} aria-hidden="true" />
      Mở cửa sổ
    </button>
  );
}
