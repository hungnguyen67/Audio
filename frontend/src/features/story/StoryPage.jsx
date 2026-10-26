import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectStoriesStatus, selectStoryById } from "../../entities/stories/selectors";
import { PlayerCard } from "../player/PlayerCard";
import { usePlayer } from "../player/usePlayer";
import { StoryChapterList } from "./StoryChapterList";
import { useStoryProgress } from "./useStoryProgress";

export function StoryPage() {
  const { storyId } = useParams();
  const story = useSelector(selectStoryById(storyId));
  const storiesStatus = useSelector(selectStoriesStatus);
  const player = usePlayer();
  const savedChapterNumber = useStoryProgress(storyId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const playingHere = player.current?.storyId === storyId ? player.chapter : null;
  const lastListened = playingHere?.number ?? savedChapterNumber;

  useEffect(() => setPage(1), [storyId]);

  // Nhảy tới trang chứa chương đang nghe / đã nghe gần nhất.
  useEffect(() => {
    if (!story || !lastListened) return;
    const index = story.chapters.findIndex((chapter) => chapter.number === lastListened);
    if (index >= 0) setPage(Math.floor(index / pageSize) + 1);
  }, [story, lastListened, pageSize]);

  if (!story) {
    return (
      <div style={{ padding: "48px 24px", color: "#64748b", textAlign: "center" }}>
        {storiesStatus === "idle" || storiesStatus === "loading" ? (
          "Đang tải truyện..."
        ) : (
          <>
            Không tìm thấy truyện.{" "}
            <Link to="/library" style={{ color: "#2563eb" }}>
              Quay lại thư viện
            </Link>
          </>
        )}
      </div>
    );
  }

  const visibleChapters = story.chapters.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="page-hero">
        <div>
          <h1 className="hero-title">{story.title}</h1>
          <p className="hero-sub">
            {lastListened ? `Đã nghe đến tập ${lastListened}` : "Chưa nghe tập nào"}
          </p>
        </div>
      </div>

      <div className="story-wrap">
        <StoryChapterList
          chapters={visibleChapters}
          totalChapters={story.chapters.length}
          selectedChapterId={playingHere?.id}
          lastListenedChapter={lastListened}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onSelectChapter={(chapter) => player.play(storyId, chapter)}
        />
        <div className="story-player-col">
          <PlayerCard />
        </div>
      </div>
    </>
  );
}
