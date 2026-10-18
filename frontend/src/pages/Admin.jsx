import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { createStory, deleteChapter, deleteStory, fetchStories, saveChapter, updateChapter } from '../store';
import { Pagination } from '../shared/Pagination';
import { toast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { requestJson } from '../shared/api';
import { splitTextIntoChapters } from '../shared/textChapters';

function isDuplicateChapterNumberError(error) {
  return /duplicate entry .* for key ['`]?chapters\.unique_story_chapter/i.test(error?.message || '');
}

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
  const [importUrl, setImportUrl] = useState(() => localStorage.getItem('audio-story:lastChapterImportUrl') || '');
  const [importing, setImporting] = useState(false);
  const textFileInput = useRef(null);
  const [importStatus, setImportStatus] = useState('');
  const [importFromChapter, setImportFromChapter] = useState('1');
  const [importToChapter, setImportToChapter] = useState('1');
  const [importedChapters, setImportedChapters] = useState([]);
  const [mergedSourceCount, setMergedSourceCount] = useState(0);
  const [savingImportedChapters, setSavingImportedChapters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [checkedChapterIds, setCheckedChapterIds] = useState([]);
  const [bulkDeletingChapters, setBulkDeletingChapters] = useState(false);
  const chapterSelectionDrag = useRef(null);
  const selected = stories.find((s) => s.id === storyId);
  const visibleStories = stories.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    const stopChapterSelection = () => {
      chapterSelectionDrag.current = null;
    };
    window.addEventListener('pointerup', stopChapterSelection);
    window.addEventListener('pointercancel', stopChapterSelection);
    return () => {
      window.removeEventListener('pointerup', stopChapterSelection);
      window.removeEventListener('pointercancel', stopChapterSelection);
    };
  }, []);

  const now = new Date();
  const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

  const open = async (story, chapter = null) => {
    setFormOpen(true);
    setStoryId(story?.id || null);
    setEditing(chapter);
    setForm({ story: story?.title || '', number: chapter?.number || '', title: chapter?.title || '', content: '' });
    setStatus('');
    setImportStatus('');
    setImportFromChapter('1');
    setImportToChapter('1');
    setImportedChapters([]);
    setMergedSourceCount(0);
    setCheckedChapterIds([]);
    if (chapter) {
      try {
        const data = await requestJson(`/api/chapters/${chapter.id}`);
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
    setImportStatus('');
    setImportFromChapter('1');
    setImportToChapter('1');
    setImportedChapters([]);
    setMergedSourceCount(0);
    setCheckedChapterIds([]);
  };

  const closeForm = () => {
    setFormOpen(false);
    setStoryId(null);
    setEditing(null);
    setForm({ story: '', number: '', title: '', content: '' });
    setStatus('');
    setImportStatus('');
    setImportFromChapter('1');
    setImportToChapter('1');
    setImportedChapters([]);
    setMergedSourceCount(0);
    setCheckedChapterIds([]);
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ story: selected?.title || '', number: '', title: '', content: '' });
    setStatus('');
  };

  const importChapter = async () => {
    if (!importUrl.trim()) {
      setImportStatus('Hãy nhập link chương.');
      return;
    }

    const fromChapter = Number(importFromChapter);
    const toChapter = Number(importToChapter);
    if (!Number.isInteger(fromChapter) || !Number.isInteger(toChapter) || fromChapter < 1 || toChapter < fromChapter) {
      setImportStatus('Khoảng chương không hợp lệ. Hãy nhập số chương bắt đầu và kết thúc hợp lệ.');
      return;
    }

    let chapterUrl;
    try {
      chapterUrl = new URL(importUrl.trim());
    } catch {
      setImportStatus('Link chương không hợp lệ.');
      return;
    }
    const isMetruyenchuUrl =
      chapterUrl.hostname === 'metruyenchu.co' && /\/chuong-\d+\/?$/i.test(chapterUrl.pathname);
    const isTruyenHUrl =
      chapterUrl.hostname === 'truyen-h.com' &&
      chapterUrl.pathname === '/reader' &&
      /^[A-Za-z0-9_-]{1,200}$/.test(chapterUrl.searchParams.get('story') || '') &&
      /^\d+$/.test(chapterUrl.searchParams.get('chapter') || '');
    if (
      chapterUrl.protocol !== 'https:' ||
      (chapterUrl.port && chapterUrl.port !== '443') ||
      chapterUrl.username ||
      chapterUrl.password ||
      (!isMetruyenchuUrl && !isTruyenHUrl)
    ) {
      setImportStatus('Hãy dùng link HTTPS metruyenchu.co/.../chuong-1 hoặc truyen-h.com/reader?story=...&chapter=1.');
      return;
    }
    localStorage.setItem('audio-story:lastChapterImportUrl', importUrl.trim());
    const isTruyenH = chapterUrl.hostname === 'truyen-h.com';
    const chapterPath = isTruyenH ? '' : chapterUrl.pathname.replace(/\/chuong-\d+\/?$/i, '');
    const importingRange = fromChapter !== toChapter;
    if ((form.content.trim() || importedChapters.length) && !window.confirm('Lấy chương mới sẽ thay thế nội dung hoặc danh sách chương đang chờ. Tiếp tục?')) return;

    setImportedChapters([]);
    setMergedSourceCount(0);
    setImporting(true);
    const chapters = [];
    try {
      for (let chapterNumber = fromChapter; chapterNumber <= toChapter; chapterNumber += 1) {
        setImportStatus(`Đang lấy chương ${chapterNumber}/${toChapter}...`);
        if (isTruyenH) {
          chapterUrl.searchParams.set('chapter', String(chapterNumber));
        } else {
          chapterUrl.pathname = `${chapterPath}/chuong-${chapterNumber}`;
        }
        const chapter = await requestJson('/api/import-chapter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: chapterUrl.toString() }),
        });
        chapters.push(chapter);
      }

      if (importingRange) {
        const mergedChapter = {
          ...chapters[0],
          chapterNumber: fromChapter,
          title: chapters[0].title || `Chương ${fromChapter}`,
          content: chapters.map((chapter) => chapter.content).join('\n\n'),
        };

        setImportedChapters([mergedChapter]);
        setMergedSourceCount(chapters.length);
        setForm((previous) => ({
          ...previous,
          story: !storyId && !previous.story.trim() ? chapters[0].storyTitle || previous.story : previous.story,
          number: String(fromChapter),
          title: mergedChapter.title,
          content: mergedChapter.content,
        }));
        setImportStatus(`Đã gộp ${chapters.length} chương thành 1 tập (số ${fromChapter}).`);
      } else {
        const chapter = chapters[0];
        setForm((previous) => ({
          ...previous,
          story: !storyId && !previous.story.trim() ? chapter.storyTitle || previous.story : previous.story,
          number: String(chapter.chapterNumber),
          title: chapter.title,
          content: chapter.content,
        }));
        setImportStatus(`Đã lấy ${chapter.content.length.toLocaleString('vi-VN')} ký tự. Hãy kiểm tra rồi bấm Lưu.`);
      }
    } catch (err) {
      if (chapters.length) {
        const mergedChapter = {
          ...chapters[0],
          chapterNumber: fromChapter,
          title: chapters[0].title || `Chương ${fromChapter}`,
          content: chapters.map((chapter) => chapter.content).join('\n\n'),
        };
        setImportedChapters([mergedChapter]);
        setMergedSourceCount(chapters.length);
        if (!storyId && !form.story.trim()) {
          setForm((previous) => ({ ...previous, story: chapters[0].storyTitle || previous.story }));
        }
        setForm((previous) => ({
          ...previous,
          number: String(fromChapter),
          title: mergedChapter.title,
          content: mergedChapter.content,
        }));
        setImportStatus(`Đã gộp ${chapters.length} chương thành 1 tập; dừng tại chương ${fromChapter + chapters.length}: ${err.message}`);
      } else {
        const chapterNumber = fromChapter + chapters.length;
        const sourceError = err.message === 'Không tìm thấy dữ liệu chương trên trang Truyện H.'
          ? 'Truyện H không gửi nội dung chương; nguồn đang yêu cầu xác minh chống bot hoặc đăng nhập. Hãy mở chương trên trang nguồn rồi dán nội dung vào form.'
          : err.message;
        setImportStatus(`${sourceError} (lỗi tại chương ${chapterNumber})`);
      }
    } finally {
      setImporting(false);
    }
  };

  const importTextFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (form.content.trim() || importedChapters.length) {
      if (!window.confirm('Nhập tệp TXT sẽ thay thế nội dung hoặc danh sách chương đang chờ. Tiếp tục?')) return;
    }

    setImporting(true);
    setImportedChapters([]);
    setMergedSourceCount(0);
    setImportStatus(`Đang đọc ${file.name}...`);
    try {
      const chapters = splitTextIntoChapters(await file.text());
      if (!chapters.length) {
        setImportStatus('Không tìm thấy tiêu đề chương. Hãy dùng các dòng như "Chương 1: Tên chương" trong tệp TXT.');
        return;
      }
      setImportedChapters(chapters);
      setForm((previous) => ({
        ...previous,
        story: previous.story.trim() ? previous.story : file.name.replace(/\.txt$/i, ''),
        number: String(chapters[0].chapterNumber),
        title: chapters[0].title,
        content: '',
      }));
      setImportStatus(`Đã tách ${chapters.length} chương từ tệp TXT. Kiểm tra danh sách rồi bấm Lưu.`);
    } catch (error) {
      setImportStatus(`Không thể đọc tệp TXT: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const saveImportedChapters = async () => {
    if (!form.story.trim()) {
      setStatus('Vui lòng điền tên truyện trước khi lưu chương.');
      return;
    }
    if (mergedSourceCount && (!Number.isInteger(Number(form.number)) || Number(form.number) < 1 || !form.title.trim() || !form.content.trim())) {
      setStatus('Hãy kiểm tra số chương, tiêu đề và nội dung của tập đã gộp trước khi lưu.');
      return;
    }

    setSavingImportedChapters(true);
    setStatus('Đang chuẩn bị lưu chương...');
    let id = storyId;
    let savedCount = 0;
    let skippedCount = 0;
    let pendingChapters = importedChapters;
    const totalCount = importedChapters.length;
    const existingChapterNumbers = new Set((selected?.chapters || []).map((chapter) => chapter.number));
    try {
      if (!id) {
        id = (await dispatch(createStory(form.story.trim())).unwrap()).id;
        setStoryId(id);
      }

      while (pendingChapters.length) {
        const chapter = pendingChapters[0];
        const chapterNumber = mergedSourceCount ? Number(form.number) : chapter.chapterNumber;
        const chapterLabel = mergedSourceCount ? 'tập' : 'chương';
        if (existingChapterNumbers.has(chapterNumber)) {
          skippedCount += 1;
          setStatus(`Bỏ qua ${chapterLabel} ${chapterNumber} vì đã tồn tại (${savedCount + skippedCount}/${totalCount})...`);
        } else {
          setStatus(`Đang lưu ${chapterLabel} ${chapterNumber} (${savedCount + skippedCount + 1}/${totalCount})...`);
          try {
            await dispatch(saveChapter({
              storyId: id,
              chapterNumber,
              title: mergedSourceCount ? form.title.trim() : chapter.title || `Chương ${chapterNumber}`,
              content: mergedSourceCount ? form.content.trim() : chapter.content,
            })).unwrap();
            savedCount += 1;
          } catch (error) {
            if (!isDuplicateChapterNumberError(error)) throw error;
            skippedCount += 1;
            setStatus(`Bỏ qua ${chapterLabel} ${chapterNumber} vì đã tồn tại (${savedCount + skippedCount}/${totalCount})...`);
          }
          existingChapterNumbers.add(chapterNumber);
        }
        pendingChapters = pendingChapters.slice(1);
        setImportedChapters(pendingChapters);
      }

      await dispatch(fetchStories());
      setEditing(null);
      setForm((previous) => ({ ...previous, number: '', title: '', content: '' }));
      const skippedMessage = skippedCount ? ` Bỏ qua ${skippedCount} chương trùng số.` : '';
      setStatus(`Đã lưu ${savedCount} ${mergedSourceCount ? 'tập' : 'chương'} thành công.${skippedMessage}${mergedSourceCount ? ` (gộp từ ${mergedSourceCount} chương nguồn)` : ''}`);
      toast.success(skippedCount ? 'Đã lưu, bỏ qua chương trùng' : 'Đã lưu thành công', mergedSourceCount
        ? `${savedCount} tập gộp từ ${mergedSourceCount} chương nguồn đã được thêm vào truyện.${skippedMessage}`
        : `${savedCount} chương đã được thêm vào truyện.${skippedMessage}`);
      setMergedSourceCount(0);
    } catch (err) {
      setStatus(`Đã lưu ${savedCount}, bỏ qua ${skippedCount}; còn ${pendingChapters.length} mục chưa xử lý. ${err.message}`);
      toast.error('Không thể lưu hết chương', err.message);
    } finally {
      setSavingImportedChapters(false);
    }
  };

  const submit = async () => {
    if (importedChapters.length) {
      await saveImportedChapters();
      return;
    }
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
    setDeleting(true);
    try {
      await dispatch(deleteStory(id)).unwrap();
      await dispatch(fetchStories()).unwrap();
      setConfirmDialog(null);
      if (storyId === id) { setStoryId(null); setEditing(null); }
      toast.success(`Đã xóa truyện${story ? ` "${story.title}"` : ''}`, story
        ? `${story.chapters.length} chương liên quan đã được xóa.`
        : 'Truyện và các chương liên quan đã được xóa.');
    } catch (err) {
      toast.error('Không thể xóa truyện', err.message);
    } finally {
      setConfirmDialog(null);
      setDeleting(false);
    }
  };

  const removeChapter = async (id) => {
    const chapter = selected?.chapters.find((item) => item.id === id);
    setDeleting(true);
    try {
      await dispatch(deleteChapter(id)).unwrap();
      await dispatch(fetchStories()).unwrap();
      setConfirmDialog(null);
      setCheckedChapterIds((ids) => ids.filter((chapterId) => chapterId !== id));
      if (editing?.id === id) setEditing(null);
      toast.success(`Đã xóa chương ${chapter?.number || ''}`.trim(), chapter
        ? `"${chapter.title}" đã được xóa khỏi truyện "${selected?.title || ''}".`
        : 'Chương đã được xóa khỏi truyện.');
    } catch (err) {
      toast.error('Không thể xóa chương', err.message);
    } finally {
      setConfirmDialog(null);
      setDeleting(false);
    }
  };

  const deleteSelectedChapters = async (chapterIds) => {
    const chapters = (selected?.chapters || []).filter((chapter) => chapterIds.includes(chapter.id));
    if (!chapters.length || bulkDeletingChapters || deleting) return;

    setDeleting(true);
    setBulkDeletingChapters(true);
    const deletedIds = [];
    const failures = [];
    try {
      for (const chapter of chapters) {
        try {
          await dispatch(deleteChapter(chapter.id)).unwrap();
          deletedIds.push(chapter.id);
        } catch (error) {
          failures.push({ chapter, error });
        }
      }

      setCheckedChapterIds(failures.map(({ chapter }) => chapter.id));
      if (editing && deletedIds.includes(editing.id)) setEditing(null);
      await dispatch(fetchStories()).unwrap();
      setConfirmDialog(null);
      if (failures.length) {
        const firstFailure = failures[0];
        toast.error(
          `Đã xóa ${deletedIds.length}/${chapters.length} chương`,
          `Không xóa được chương ${firstFailure.chapter.number}: ${firstFailure.error.message}`,
        );
      } else {
        toast.success('Đã xóa hàng loạt', `${deletedIds.length} chương đã được xóa khỏi truyện "${selected.title}".`);
      }
    } catch (error) {
      toast.error(`Đã xóa ${deletedIds.length}/${chapters.length} chương`, `Không thể làm mới danh sách chương: ${error.message}`);
    } finally {
      setConfirmDialog(null);
      setBulkDeletingChapters(false);
      setDeleting(false);
    }
  };

  const toggleChapterSelection = (chapterId) => {
    setCheckedChapterIds((ids) => ids.includes(chapterId)
      ? ids.filter((id) => id !== chapterId)
      : [...ids, chapterId]);
  };

  const setChapterChecked = (chapterId, checked) => {
    setCheckedChapterIds((ids) => {
      if (ids.includes(chapterId) === checked) return ids;
      return checked ? [...ids, chapterId] : ids.filter((id) => id !== chapterId);
    });
  };

  const requestDelete = (type, id) => {
    setConfirmDialog({ type, id });
  };

  const requestDeleteSelectedChapters = () => {
    if (!selected || !checkedChapterIds.length || bulkDeletingChapters) return;
    setConfirmDialog({ type: 'chapters', ids: checkedChapterIds });
  };

  const confirmDelete = () => {
    if (!confirmDialog || deleting) return;
    if (confirmDialog.type === 'story') {
      removeStory(confirmDialog.id);
    } else if (confirmDialog.type === 'chapter') {
      removeChapter(confirmDialog.id);
    } else {
      deleteSelectedChapters(confirmDialog.ids);
    }
  };

  const confirmation = confirmDialog?.type === 'story'
    ? {
      title: 'Xóa truyện?',
      description: `Truyện "${stories.find((story) => story.id === confirmDialog.id)?.title || ''}" cùng toàn bộ chương liên quan sẽ bị xóa vĩnh viễn. Bạn không thể hoàn tác thao tác này.`,
    }
    : confirmDialog?.type === 'chapter'
      ? {
        title: 'Xóa chương?',
        description: (() => {
          const chapter = selected?.chapters.find((item) => item.id === confirmDialog.id);
          return `Chương ${chapter?.number || ''}${chapter?.title ? ` "${chapter.title}"` : ''} sẽ bị xóa vĩnh viễn khỏi truyện "${selected?.title || ''}". Thao tác này không thể hoàn tác.`;
        })(),
      }
      : confirmDialog?.type === 'chapters'
        ? {
          title: `Xóa ${confirmDialog.ids.length} chương?`,
          description: `Các chương đã chọn trong truyện "${selected?.title || ''}" sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác.`,
        }
        : null;

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
                  if (!importing && !savingImportedChapters) closeForm();
                }
              }}
            >
              <div className={`form-panel${selected ? '' : ' form-panel-single'}`} onMouseDown={(event) => event.stopPropagation()}>
                <div className="form-panel-title">
                  {editing ? `Sửa chương: ${selected?.title}` : storyId ? `Thêm chương: ${selected?.title}` : 'Tạo truyện mới'}
                </div>

                <div className={`form-modal-grid${selected ? '' : ' form-modal-grid-single'}`}>
                  <div className="form-modal-fields">
                    {!editing && (
                      <div className="form-group">
                        <div className="admin-import-controls">
                          <div className="admin-import-url">
                            <label className="form-label" htmlFor="chapter-source-url">Lấy chương từ link</label>
                            <input
                              id="chapter-source-url"
                              className="form-input"
                              type="url"
                              value={importUrl}
                              onChange={(event) => {
                                setImportUrl(event.target.value);
                                localStorage.setItem('audio-story:lastChapterImportUrl', event.target.value);
                              }}
                              placeholder="Dán link chương từ metruyenchu.co hoặc truyen-h.com"
                              disabled={importing || savingImportedChapters}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" htmlFor="chapter-range-start">Từ chương</label>
                            <input
                              id="chapter-range-start"
                              className="form-input"
                              type="number"
                              min="1"
                              value={importFromChapter}
                              onChange={(event) => setImportFromChapter(event.target.value)}
                              disabled={importing || savingImportedChapters}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" htmlFor="chapter-range-end">Đến chương</label>
                            <input
                              id="chapter-range-end"
                              className="form-input"
                              type="number"
                              min={importFromChapter}
                              value={importToChapter}
                              onChange={(event) => setImportToChapter(event.target.value)}
                              disabled={importing || savingImportedChapters}
                            />
                          </div>
                          <button className="btn btn-outline" onClick={importChapter} disabled={importing || savingImportedChapters}>
                            {importing ? 'Đang lấy...' : 'Lấy chương'}
                          </button>
                        </div>
                        {importStatus && <div className="form-msg" aria-live="polite">{importStatus}</div>}
                        <input
                          ref={textFileInput}
                          type="file"
                          accept=".txt,text/plain"
                          hidden
                          onChange={importTextFile}
                          disabled={importing || savingImportedChapters}
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ marginTop: 8 }}
                          onClick={() => textFileInput.current?.click()}
                          disabled={importing || savingImportedChapters}
                        >
                          {importing ? 'Đang đọc TXT...' : 'Tách chương từ tệp TXT'}
                        </button>
                      </div>
                    )}
                    {!storyId && (
                      <div className="form-group">
                        <label className="form-label">Tên truyện</label>
                        <input
                          className="form-input"
                          value={form.story}
                          onChange={(e) => setForm({ ...form, story: e.target.value })}
                          placeholder="Nhập tên truyện..."
                        />
                      </div>
                    )}
                    <div className="chapter-number-title-grid">
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
                  <button className="btn btn-dark" onClick={submit} disabled={importing || savingImportedChapters}>
                    {savingImportedChapters
                      ? 'Đang lưu...'
                      : mergedSourceCount
                        ? 'Lưu 1 tập đã gộp'
                        : importedChapters.length
                          ? `Lưu ${importedChapters.length} chương`
                          : 'Lưu'}
                  </button>
                    <button className="btn btn-outline" onClick={editing ? cancelEdit : closeForm} disabled={importing || savingImportedChapters}>{editing ? 'Hủy' : 'Đóng'}</button>
                  <span className="form-msg">{status}</span>
                    </div>
                </div>

                {selected && selected.chapters.length > 0 && (
                  <div className="ch-sub-list">
                    <div className="ch-sub-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>Các chương hiện có</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-small-action"
                          onClick={requestDeleteSelectedChapters}
                          disabled={bulkDeletingChapters || !checkedChapterIds.length}
                        >
                          {bulkDeletingChapters ? 'Đang xóa...' : `Xóa đã chọn (${checkedChapterIds.length})`}
                        </button>
                      </div>
                    </div>
                    <div className="ch-sub-items">
                      {[...selected.chapters].sort((first, second) => second.number - first.number).map((chapter) => (
                        <div
                          key={chapter.id}
                          className="ch-sub-item"
                          onPointerEnter={(event) => {
                            if (chapterSelectionDrag.current !== null && event.buttons === 1) {
                              setChapterChecked(chapter.id, chapterSelectionDrag.current);
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Chọn chương ${chapter.number}: ${chapter.title}`}
                            checked={checkedChapterIds.includes(chapter.id)}
                            onPointerDown={(event) => {
                              if (event.button !== 0 || bulkDeletingChapters) return;
                              event.preventDefault();
                              const shouldSelect = !checkedChapterIds.includes(chapter.id);
                              chapterSelectionDrag.current = shouldSelect;
                              setChapterChecked(chapter.id, shouldSelect);
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              if (event.detail === 0) toggleChapterSelection(chapter.id);
                            }}
                            disabled={bulkDeletingChapters}
                          />
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
                          <button className="btn-small-action" onClick={() => requestDelete('chapter', chapter.id)} disabled={bulkDeletingChapters}>
                            Xóa
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
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (!deleting) setConfirmDialog(null);
          }}
        />
      )}
    </>
  );
}
