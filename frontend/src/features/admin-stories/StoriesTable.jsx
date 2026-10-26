import { Pagination } from "../../components/Pagination";

export function StoriesTable({
  stories,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onOpenStory,
  onDeleteStory,
}) {
  const rows = stories.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="section-card">
      <div className="section-head">
        <div>
          <div className="section-title">Danh sách truyện</div>
          <div className="section-sub">{stories.length} đầu truyện</div>
        </div>
      </div>

      <div className="adm-tbl">
        <div className="dt-head">
          <span>#</span>
          <span>Tên truyện</span>
          <span>Số chương</span>
          <span style={{ textAlign: "right" }}>Thao tác</span>
        </div>

        {rows.map((story, index) => (
          <div key={story.id} className="dt-row" onClick={() => onOpenStory(story)}>
            <span className="row-num">{String((page - 1) * pageSize + index + 1).padStart(2, "0")}</span>
            <span className="row-title">{story.title}</span>
            <span className="row-meta">{story.chapters.length} chương</span>
            <span className="row-action">
              <button
                className="btn-open"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteStory(story);
                }}
              >
                Xóa
              </button>
            </span>
          </div>
        ))}
      </div>

      <Pagination
        total={stories.length}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
