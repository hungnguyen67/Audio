import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStories } from '../../entities/stories/storiesSlice';
import { Pagination } from '../../components/Pagination';

export function LibraryPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { items: stories, status, error } = useSelector((state) => state.stories);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const visibleStories = stories.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (status === 'idle') dispatch(fetchStories());
  }, [status, dispatch]);

  return (
    <section className="library-page">
      <div className="page-hero library-page-hero">
        <div>
          <h1 className="hero-title">Thư viện truyện</h1>
          <p className="hero-sub">Chọn một truyện để xem chương và bắt đầu nghe.</p>
        </div>
      </div>

      <div className="section-card">
        <div className="section-head">
          <div>
            <div className="section-title">Danh sách truyện</div>
            <div className="section-sub">{stories.length} đầu truyện</div>
          </div>
        </div>

        <div className="lib-tbl">
          <div className="dt-head">
            <span>#</span>
            <span>Tên truyện</span>
            <span>Số chương</span>
          </div>

          {visibleStories.map((story, i) => (
            <div
              key={story.id}
              className="dt-row"
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/story/${story.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(`/story/${story.id}`);
                }
              }}
            >
              <span className="row-num">{String((page - 1) * pageSize + i + 1).padStart(2, '0')}</span>
              <div style={{ overflow: 'hidden' }}>
                <div className="row-title">{story.title}</div>
                {story.description && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{story.description}</div>
                )}
              </div>
              <span className="row-meta">{story.chapters.length} chương</span>
            </div>
          ))}

          {!visibleStories.length && (
            <div className={`library-empty${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'}>
              {error
                ? error
                : status === 'loading'
                  ? 'Đang tải thư viện truyện...'
                  : 'Thư viện chưa có truyện nào.'}
            </div>
          )}
        </div>
        <Pagination
          total={stories.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>
    </section>
  );
}