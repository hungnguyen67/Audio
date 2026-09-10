import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStories } from '../store';
import { Pagination } from '../shared/Pagination';

function HeadphonesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

export function Library() {
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
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <div className="brand-icon"><HeadphonesIcon /></div>
            <div className="brand-text">
              <span className="brand-name">Audio Story Reader</span>
              <span className="brand-page">Thư viện</span>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ───────────────────────────── */}
      <main>
        <div className="container">

          {/* Hero */}
          <div className="page-hero">
            <div>
              <h1 className="hero-title">Thư Viện Truyện</h1>
              <p className="hero-sub">Khám phá kho tàng truyện nói và các chương âm thanh trong hệ thống.</p>
            </div>
            <Link to="/admin" className="btn btn-outline">Chế độ Admin</Link>
          </div>

          {/* Stories section */}
          <div className="section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Danh sách truyện</div>
                <div className="section-sub">
                  {error
                    ? <span style={{ color: '#dc2626' }}>{error}</span>
                    : status === 'loading'
                      ? 'Đang tải...'
                      : `Hiển thị ${stories.length} tác phẩm hiện có`}
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>

            {/* Table */}
            <div className="lib-tbl">
              <div className="dt-head">
                <span>#</span>
                <span>Tiêu đề</span>
                <span>Số chương</span>
                <span style={{ textAlign: 'right' }}>Hành động</span>
              </div>

              {visibleStories.map((story, i) => (
                <div key={story.id} className="dt-row" onClick={() => navigate(`/story/${story.id}`)}>
                  <span className="row-num">{String((page - 1) * pageSize + i + 1).padStart(2, '0')}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div className="row-title">{story.title}</div>
                    {story.description && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{story.description}</div>
                    )}
                  </div>
                  <span className="row-meta">{story.chapters.length} chương</span>
                  <span style={{ textAlign: 'right' }}>
                    <button
                      className="btn-open"
                      onClick={(e) => { e.stopPropagation(); navigate(`/story/${story.id}`); }}
                    >
                      Mở nghe
                    </button>
                  </span>
                </div>
              ))}
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