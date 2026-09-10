import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { createStory, deleteChapter, deleteStory, fetchStories, saveChapter, updateChapter } from '../store';
import { Pagination } from '../shared/Pagination';
import { toast } from '../shared/Toast';

function HeadphonesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

export function Admin() {
  const dispatch = useDispatch();
  const stories = useSelector((state) => state.stories.items);
  const [storyId, setStoryId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ story: '', number: '', title: '', content: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pendingDelete, setPendingDelete] = useState(null);
  const selected = stories.find((s) => s.id === storyId);
  const visibleStories = stories.slice((page - 1) * pageSize, page * pageSize);

  const now = new Date();
  const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

  const open = async (story, chapter = null) => {
    setFormOpen(true);
    setStoryId(story?.id || null);
    setEditing(chapter);
    setForm({ story: story?.title || '', number: chapter?.number || '', title: chapter?.title || '', content: '' });
    setStatus('');
    if (chapter) {
      try {
        const res = await fetch(`/api/chapters/${chapter.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Tải chương thất bại.');
        setForm({ story: story.title, number: chapter.number, title: data.title, content: data.content });
      } catch (err) { setStatus(err.message); }
    }
  };

  const openNew = () => {
    setFormOpen(true);
    setStoryId(null);
    setEditing(null);
    setForm({ story: '', number: '', title: '', content: '' });
    setStatus('');
  };

  const closeForm = () => {
    setFormOpen(false);
    setStoryId(null);
    setEditing(null);
    setForm({ story: '', number: '', title: '', content: '' });
    setStatus('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ story: selected?.title || '', number: '', title: '', content: '' });
    setStatus('');
  };

  const submit = async () => {
    if (!form.story.trim() || !form.content.trim()) { setStatus('Vui lòng điền tên truyện và nội dung chương.'); return; }
    setStatus('Đang lưu...');
    try {
      let id = storyId;
      if (!id) id = (await dispatch(createStory(form.story.trim())).unwrap()).id;
      if (editing) {
        await dispatch(updateChapter({ id: editing.id, chapterNumber: Number(form.number), title: form.title.trim(), content: form.content.trim() })).unwrap();
      } else {
        const nextNumber = (selected?.chapters || []).reduce((max, c) => Math.max(max, c.number), 0) + 1;
        await dispatch(saveChapter({ storyId: id, chapterNumber: Number(form.number) || nextNumber, title: form.title.trim() || 'Chương mới', content: form.content.trim() })).unwrap();
      }
      await dispatch(fetchStories());
      setStoryId(id);
      setEditing(null);
      setForm((v) => ({ ...v, title: '', number: '', content: '' }));
      setStatus('Đã lưu thành công.');
      toast.success('Đã lưu thành công', editing ? 'Nội dung chương đã được cập nhật.' : 'Chương mới đã được thêm vào truyện.');
    } catch (err) {
      setStatus(err.message);
      toast.error('Không thể lưu', err.message);
    }
  };

  const removeStory = async (id) => {
    const story = stories.find((item) => item.id === id);
    try {
      await dispatch(deleteStory(id)).unwrap();
      dispatch(fetchStories());
      setPendingDelete(null);
      if (storyId === id) { setStoryId(null); setEditing(null); }
      toast.success(`Đã xóa truyện${story ? ` "${story.title}"` : ''}`, story
        ? `${story.chapters.length} chương liên quan đã được xóa.`
        : 'Truyện và các chương liên quan đã được xóa.');
    } catch (err) {
      toast.error('Không thể xóa truyện', err.message);
    }
  };

  const removeChapter = async (id) => {
    const chapter = selected?.chapters.find((item) => item.id === id);
    try {
      await dispatch(deleteChapter(id)).unwrap();
      dispatch(fetchStories());
      setPendingDelete(null);
      if (editing?.id === id) setEditing(null);
      toast.success(`Đã xóa chương ${chapter?.number || ''}`.trim(), chapter
        ? `"${chapter.title}" đã được xóa khỏi truyện "${selected?.title || ''}".`
        : 'Chương đã được xóa khỏi truyện.');
    } catch (err) {
      toast.error('Không thể xóa chương', err.message);
    }
  };

  const requestDelete = (type, id) => {
    const key = `${type}:${id}`;
    if (pendingDelete === key) {
      if (type === 'story') removeStory(id);
      else removeChapter(id);
      return;
    }
    setPendingDelete(key);
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <div className="brand-icon"><HeadphonesIcon /></div>
            <div className="brand-text">
              <span className="brand-name">Audio Story Reader</span>
              <span className="brand-page">Quản trị</span>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <div className="container">
          {/* Hero */}
          <div className="page-hero">
            <div>
              <h1 className="hero-title">Thư viện Truyện</h1>
              <p className="hero-sub">Quản lý các đầu truyện và chương âm thanh trong hệ thống thư viện.</p>
            </div>
            <Link to="/" className="btn btn-outline">Trang chủ</Link>
          </div>

          {/* Stories table */}
          <div className="section-card">
            <div className="section-head">
              <div>
                <div className="section-title">Truyện trong hệ thống</div>
                <div className="section-sub">{stories.length} đầu truyện</div>
              </div>
              <button className="btn btn-dark" onClick={openNew}>
                Tạo Truyện
              </button>
            </div>

            <div className="adm-tbl">
              <div className="dt-head">
                <span>#</span>
                <span>Tên truyện</span>
                <span>Số chương</span>
                <span style={{ textAlign: 'right' }}>Thao tác</span>
              </div>

              {visibleStories.map((story, i) => (
                <div key={story.id} className="dt-row" onClick={() => open(story)}>
                  <span className="row-num">{String((page - 1) * pageSize + i + 1).padStart(2, '0')}</span>
                  <span className="row-title">{story.title}</span>
                  <span className="row-meta">{story.chapters.length} chương</span>
                  <span className="row-action">
                    <button
                      className="btn-open"
                      onClick={(e) => { e.stopPropagation(); requestDelete('story', story.id); }}
                    >
                      {pendingDelete === `story:${story.id}` ? 'Tiếp' : 'Xóa'}
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

          {/* Form panel */}
          {formOpen && (
            <div
              className="form-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeForm();
                }
              }}
            >
              <div className={`form-panel${selected ? '' : ' form-panel-single'}`} onMouseDown={(event) => event.stopPropagation()}>
                <div className="form-panel-title">
                  {editing ? `Sửa chương: ${selected?.title}` : storyId ? `Thêm chương: ${selected?.title}` : 'Tạo truyện mới'}
                </div>

                <div className={`form-modal-grid${selected ? '' : ' form-modal-grid-single'}`}>
                  <div className="form-modal-fields">
                    <div className="form-group">
                  <label className="form-label">Tên truyện</label>
                  <input
                    className="form-input"
                    value={form.story}
                    readOnly={Boolean(storyId)}
                    onChange={(e) => setForm({ ...form, story: e.target.value })}
                    placeholder="Nhập tên truyện..."
                  />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                    <label className="form-label">Số chương</label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      placeholder="Tự động"
                    />
                      </div>
                      <div className="form-group">
                    <label className="form-label">Tiêu đề chương</label>
                    <input
                      className="form-input"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Nhập tiêu đề..."
                    />
                      </div>
                    </div>
                    <div className="form-group">
                  <label className="form-label">Nội dung chương</label>
                  <textarea
                    className="form-textarea"
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="Dán nội dung chương vào đây..."
                  />
                    </div>

                    <div className="form-footer">
                  <button className="btn btn-dark" onClick={submit}>Lưu</button>
                    <button className="btn btn-outline" onClick={editing ? cancelEdit : closeForm}>{editing ? 'Hủy' : 'Đóng'}</button>
                  <span className="form-msg">{status}</span>
                    </div>
                </div>

                {selected && selected.chapters.length > 0 && (
                  <div className="ch-sub-list">
                    <div className="ch-sub-head">Các chương hiện có</div>
                    <div className="ch-sub-items">
                      {[...selected.chapters].sort((first, second) => second.number - first.number).map((chapter) => (
                        <div key={chapter.id} className="ch-sub-item">
                          <span style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', minWidth: 28 }}>
                            {String(chapter.number).padStart(2, '0')}
                          </span>
                          <button
                            type="button"
                            className={`ch-sub-edit-title${editing?.id === chapter.id ? ' active' : ''}`}
                            onClick={() => open(selected, chapter)}
                          >
                            {chapter.title}
                          </button>
                          <button className="btn-small-action" onClick={() => requestDelete('chapter', chapter.id)}>
                            {pendingDelete === `chapter:${chapter.id}` ? 'Tiếp' : 'Xóa'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
