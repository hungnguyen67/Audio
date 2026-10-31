import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowRight, BookOpen, Headphones } from "lucide-react";
import { fetchStories } from "../../entities/stories/storiesSlice";
import { Pagination } from "../../components/Pagination";
import { usePlayer } from "../player/usePlayer";

export function LibraryPage() {
  const dispatch = useDispatch();
  const {
    items: stories,
    status,
    error,
  } = useSelector((state) => state.stories);
  const { current } = usePlayer();
  const [page, setPage] = useState(1);
  const pageSize = 3;
  const orderedStories = current
    ? [
        ...stories.filter((story) => story.id === current.storyId),
        ...stories.filter((story) => story.id !== current.storyId),
      ]
    : stories;
  const visibleStories = orderedStories.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [current?.storyId]);

  useEffect(() => {
    if (status === "idle") dispatch(fetchStories());
  }, [status, dispatch]);

  return (
    <section className="library-page">
      <div className="page-hero library-page-hero">
        <div>
          <h1 className="hero-title">Khám phá truyện</h1>
          <p className="hero-sub">
            Tìm câu chuyện bạn yêu thích và bắt đầu lắng nghe.
          </p>
        </div>
      </div>

      <section className="library-catalog" aria-label="Thư viện truyện audio">
        <div className="library-catalog-head dy-library-toolbar">
          <div className="library-catalog-heading">
            <div className="section-title">Thư viện truyện</div>
            <div className="section-sub">{stories.length} truyện audio</div>
          </div>
        </div>

        {visibleStories.length ? (
          <div className="library-story-grid">
            {visibleStories.map((story, index) => {
              const isCurrentStory = story.id === current?.storyId;
              return (
                <Link
                  key={story.id}
                  to={`/story/${story.id}`}
                  className={`library-story-card${isCurrentStory ? " is-current" : ""}`}
                >
                  <div className={`library-story-art art-${index % 4}`}>
                    <Headphones size={24} strokeWidth={1.7} aria-hidden="true" />
                    <span>{String((page - 1) * pageSize + index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="library-story-info">
                    <span className="library-story-label">
                      {isCurrentStory ? "NGHE GẦN ĐÂY" : "TRUYỆN AUDIO"}
                    </span>
                    <h2>{story.title}</h2>
                    <span className="library-story-chapters">
                      <BookOpen size={14} aria-hidden="true" />
                      {story.chapters.length} chương
                    </span>
                  </div>
                  <span className="library-story-open">
                    {isCurrentStory ? "Nghe tiếp" : "Mở truyện"}
                    <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div
            className={`dy-library-empty${error ? " library-empty has-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error ? (
              error
            ) : status === "loading" || status === "idle" ? (
              "Đang tải thư viện truyện..."
            ) : (
              "Chưa có truyện nào."
            )}
          </div>
        )}

        {stories.length > 0 && (
          <Pagination
            total={stories.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            summaryOnLeft
          />
        )}
      </section>
    </section>
  );
}
