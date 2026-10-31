import { Trash2 } from "lucide-react";
import { Pagination } from "../../components/Pagination";

export function StoriesTable({
  stories,
  page,
  pageSize,
  onPageChange,
  onOpenStory,
  onDeleteStory,
}) {
  const rows = stories.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="section-card">
      <div className="section-head dy-library-toolbar">
        <div>
          <div className="section-title">Danh sách truyện</div>
          <div className="section-sub">{stories.length} đầu truyện</div>
        </div>
      </div>

      <div className="adm-tbl">
        {stories.length > 0 && (
          <div className="dt-head">
            <span>#</span>
            <span>Tên truyện</span>
            <span>Số chương</span>
            <span className="story-actions-heading">Thao tác</span>
          </div>
        )}

        {stories.length === 0 ? (
          <div className="dy-library-empty">Chưa có truyện nào.</div>
        ) : (
          rows.map((story, index) => (
            <div key={story.id} className="dt-row" onClick={() => onOpenStory(story)}>
              <span className="row-num">{String((page - 1) * pageSize + index + 1).padStart(2, "0")}</span>
              <span className="row-title">{story.title}</span>
              <span className="row-meta">{story.chapters.length} chương</span>
              <span className="row-action">
                <button
                  type="button"
                  className="story-delete-button"
                  aria-label={`Xóa truyện ${story.title}`}
                  title="Xóa truyện"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteStory(story);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {stories.length > 0 && (
        <Pagination
          total={stories.length}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          summaryOnLeft
        />
      )}
    </div>
  );
}
