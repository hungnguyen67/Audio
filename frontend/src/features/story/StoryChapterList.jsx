import { Pagination } from "../../components/Pagination";

export function StoryChapterList({
  chapters,
  totalChapters,
  selectedChapterId,
  lastListenedChapter,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSelectChapter,
}) {
  return (
    <div className="section-card">
      <div className="section-head">
        <div>
          <div className="section-title">Danh sách chương</div>
        </div>
      </div>

      <div className="ch-tbl">
        {chapters.map((chapter) => (
          <div
            key={chapter.id}
            className={`dt-row${selectedChapterId === chapter.id ? " active" : ""}${lastListenedChapter === chapter.number ? " progress" : ""}`}
            onClick={() => onSelectChapter(chapter)}
          >
            <span className="row-num">
              {String(chapter.number).padStart(2, "0")}
            </span>
            <div style={{ overflow: "hidden" }}>
              <div className="ch-title">{chapter.title}</div>
            </div>
          </div>
        ))}
      </div>
      <Pagination
        total={totalChapters}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
