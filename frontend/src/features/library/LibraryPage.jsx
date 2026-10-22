import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStories } from '../../store';
import { BrandIcon } from '../../components/BrandIcon';
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
    <>
      {/* ── Navbar ─────────────────────────── */}
      <nav className="navbar library-navbar">
        <div className="navbar-inner">
          <div className="brand">
            <div className="brand-icon"><BrandIcon /></div>
            <div className="brand-text">
              <span className="brand-name">Audio Story Reader</span>
              <span className="brand-page">Thư viện</span>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ───────────────────────────── */}
      <main className="library-page">
        <div className="container library-container">
          <header className="library-intro">
            <div className="library-intro-copy">
              <span className="library-eyebrow">Thư viện audio</span>
              <h1>Truyện dành cho bạn</h1>
              <p>Chọn một câu chuyện và tiếp tục lắng nghe theo nhịp của riêng bạn.</p>
            </div>
          </header>

          <div className="section-card">
            <div className="section-head library-section-head">
              <div className="library-section-heading">
                <span className="library-section-icon" aria-hidden="true">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <div>
                  <h2 className="library-section-title">Truyện mới cập nhật</h2>
                  <p className="section-sub">Những câu chuyện có trong thư viện của bạn</p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="lib-tbl">
              <div className="dt-head">
                <span>#</span>
                <span>Truyện mới cập nhật</span>
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

        </div>
      </main>
    </>
  );
}