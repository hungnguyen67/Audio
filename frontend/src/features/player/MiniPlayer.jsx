import { Link, useMatch } from "react-router-dom";
import { X } from "lucide-react";
import { AudioControls } from "./AudioControls";
import { usePlayer } from "./usePlayer";

/** Hiện ở mọi trang trừ trang truyện (nơi đã có PlayerCard). */
export function MiniPlayer() {
  const { current, chapter, stop } = usePlayer();
  const onStoryPage = useMatch("/story/:storyId");
  if (!current || !chapter || onStoryPage) return null;

  return (
    <section className="mini-player" aria-label="Trình phát mini">
      <Link
        to={`/story/${current.storyId}`}
        className="mini-player-title"
        aria-label="Mở trang truyện và trình phát"
        title="Mở trang truyện"
      >
        {chapter.title}
      </Link>
      <button
        type="button"
        className="mini-player-close"
        onClick={stop}
        aria-label="Ẩn trình phát mini"
        title="Ẩn trình phát"
      >
        <X size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <AudioControls />
    </section>
  );
}
