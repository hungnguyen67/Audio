import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Folder, FolderOpen, FolderPlus, Play, Plus, Trash2, Video, X } from 'lucide-react';
import { douyinApi } from '../../api/douyin';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Select } from '../../components/Select';
import { toast } from '../../components/Toast';
import { useDouyinDownloader } from './useDouyinDownloader';

const STEP_LABELS = [
  'Đang đọc liên kết Douyin...',
  'Đang tìm video...',
  'Đang chuẩn bị luồng MP4...',
];

function formatDuration(seconds) {
  const total = Number(seconds) || 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return 'MP4';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DouyinDownloaderPage() {
  const {
    input,
    setInput,
    status,
    videos,
    folders,
    selectedIds,
    step,
    batchProgress,
    loadingLibrary,
    extract,
    toggleSelected,
    selectOnly,
    clearSelection,
    selectAll,
    deleteVideo,
    deleteSelected,
    createFolder,
    deleteFolder,
    moveSelected,
  } = useDouyinDownloader();
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState(null);
  const [isBulkActionBusy, setIsBulkActionBusy] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const inputRef = useRef(null);
  const folderNameRef = useRef(null);
  const isBusy = status === 'loading' || status === 'saving';
  const currentFolder = folders.find((folder) => folder.id === currentFolderId);
  const visibleVideos = videos.filter((video) => video.folderId === currentFolderId);
  const visibleVideoIds = visibleVideos.map((video) => video.id);

  useEffect(() => {
    if (!isCreateFolderOpen) return undefined;
    folderNameRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isCreatingFolder) setIsCreateFolderOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateFolderOpen, isCreatingFolder]);

  useEffect(() => {
    if (!isPasteModalOpen) return;
    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(folders[0]?.id || '');
    }
  }, [isPasteModalOpen, folders, selectedFolderId]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedFolderId) {
      toast.error('Chưa có thư mục', 'Hãy tạo thư mục trong tab “Video đã lưu” trước khi lưu video.', 5000);
      return;
    }
    extract(input, selectedFolderId || null);
  };

  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name || isCreatingFolder) return;
    setIsCreatingFolder(true);
    try {
      const folder = await createFolder(name);
      setFolderName('');
      setSelectedFolderId(folder.id);
      setIsCreateFolderOpen(false);
      toast.success('Đã tạo thư mục', `Đã tạo thư mục “${folder.name}”.`, 5000);
    } catch (createError) {
      toast.error('Không thể tạo thư mục', createError.message || 'Vui lòng thử lại.', 5000);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    try {
      await deleteSelected();
      toast.success('Đã xóa video', `Đã xóa ${selectedIds.length} video khỏi thư viện.`, 5000);
    } catch (deleteError) {
      toast.error('Không thể xóa video', deleteError.message || 'Vui lòng thử lại.', 5000);
    }
  };

  const handleDeleteVideo = async (event, video) => {
    event.stopPropagation();
    setVideoToDelete(video);
  };

  const confirmDeleteVideo = async () => {
    if (!videoToDelete || isDeletingVideo) return;
    setIsDeletingVideo(true);
    try {
      await deleteVideo(videoToDelete.id);
      if (activeVideo?.id === videoToDelete.id) setActiveVideo(null);
      toast.success('Đã xóa video', 'Video đã được xóa khỏi thư viện.', 5000);
    } catch (deleteError) {
      toast.error('Không thể xóa video', deleteError.message || 'Vui lòng thử lại.', 5000);
    } finally {
      setIsDeletingVideo(false);
      setVideoToDelete(null);
    }
  };

  const handleMoveSelected = async (destination) => {
    if (!selectedIds.length) return;
    const destinationName = folders.find((folder) => folder.id === destination)?.name || 'Thư mục gốc';
    try {
      await moveSelected(destination);
      toast.success('Đã di chuyển video', `Đã chuyển video vào “${destinationName}”.`, 5000);
    } catch (moveError) {
      toast.error('Không thể di chuyển video', moveError.message || 'Vui lòng thử lại.', 5000);
    }
  };

  const confirmBulkAction = async () => {
    if (!pendingBulkAction || isBulkActionBusy) return;
    setIsBulkActionBusy(true);
    try {
      if (pendingBulkAction.type === 'delete') {
        await handleDeleteSelected();
      } else {
        await handleMoveSelected(pendingBulkAction.destination);
      }
      setPendingBulkAction(null);
    } finally {
      setIsBulkActionBusy(false);
    }
  };

  const handleDeleteFolder = async (event, folder) => {
    event.stopPropagation();
    const count = folder.videoCount || 0;
    if (!window.confirm(`Xóa thư mục “${folder.name}”? ${count ? `${count} video bên trong sẽ chuyển về thư mục gốc.` : ''}`)) return;
    try {
      await deleteFolder(folder.id);
      if (currentFolderId === folder.id) {
        setCurrentFolderId(null);
        clearSelection();
      }
      toast.success('Đã xóa thư mục', `Đã xóa thư mục “${folder.name}”.`, 5000);
    } catch (deleteError) {
      toast.error('Không thể xóa thư mục', deleteError.message || 'Vui lòng thử lại.', 5000);
    }
  };

  const openVideo = (video) => {
    setActiveVideo(video);
  };

  const openFolder = (folderId) => {
    setCurrentFolderId(folderId);
    clearSelection();
    setMoveFolderId('');
  };

  return (
    <>
      <div className="admin-stories-page">
        <div className="page-hero">
          <div>
            <h1 className="hero-title">Thư viện video</h1>
            <p className="hero-sub">Lưu MP4 vào cơ sở dữ liệu và xem trực tiếp trong ứng dụng.</p>
          </div>
        </div>

        <section className="dy-library section-card" aria-label="Thư viện video Douyin">
          <div className="section-head dy-library-toolbar">
            <div>
              <div className="section-title">Danh sách video</div>
              <div className="section-sub">{videos.length} video đã lưu</div>
            </div>

            <div className="dy-library-actions">
              {selectedIds.length > 0 && (
                <div className="dy-move-actions">
                  <Select
                    className="dy-move-folder-select"
                    aria-label="Thư mục đích"
                    value={moveFolderId || ''}
                    options={[
                      { value: '', label: 'Thư mục gốc' },
                      ...folders
                        .filter((folder) => folder.id !== currentFolderId)
                        .map((folder) => ({ value: folder.id, label: folder.name })),
                    ]}
                    onChange={setMoveFolderId}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setPendingBulkAction({ type: 'move', destination: moveFolderId || null })}
                  >
                    Di chuyển ({selectedIds.length})
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn btn-outline dy-delete-selected"
                onClick={() => setPendingBulkAction({ type: 'delete' })}
                disabled={!selectedIds.length}
              >
                <Trash2 size={15} aria-hidden="true" />
                Xóa đã chọn{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setFolderName('');
                  setIsCreateFolderOpen(true);
                }}
              >
                <FolderPlus size={15} aria-hidden="true" />
                Tạo thư mục
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setIsPasteModalOpen(true);
                  const currentFolderExists = folders.some((folder) => folder.id === currentFolderId);
                  const preferredFolderId = currentFolderExists ? currentFolderId : selectedFolderId;
                  setSelectedFolderId(folders.some((folder) => folder.id === preferredFolderId) ? preferredFolderId : '');
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <Plus size={15} aria-hidden="true" />
                Dán link
              </button>
            </div>
          </div>

          <div className="dy-library-content">
            {currentFolder && (
              <div className="dy-folder-breadcrumb">
                <FolderOpen size={17} aria-hidden="true" />
                <button type="button" onClick={() => openFolder(null)}>Tất cả thư mục</button>
                <ChevronRight size={14} aria-hidden="true" />
                <strong>{currentFolder.name}</strong>
                <span>{currentFolder.videoCount} video</span>
              </div>
            )}
            {visibleVideos.length > 0 && (
              <div className="dy-selection-toolbar">
                <button type="button" className="dy-select-all" onClick={() => selectAll(visibleVideoIds)}>
                  <span className={`dy-checkbox${visibleVideoIds.every((id) => selectedIds.includes(id)) ? ' is-checked' : ''}`}>
                    {visibleVideoIds.every((id) => selectedIds.includes(id)) && <Check size={12} aria-hidden="true" />}
                  </span>
                  {visibleVideoIds.every((id) => selectedIds.includes(id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
                <span>Chạm một lần để chọn · nhấp đúp để xem</span>
              </div>
            )}

            {loadingLibrary ? (
              <div className="dy-library-empty">Đang tải thư viện...</div>
            ) : (
              <>
                {!currentFolderId && folders.length > 0 && (
                  <div className="dy-folder-grid">
                    {folders.map((folder) => (
                      <article key={folder.id} className="dy-folder-item">
                        <button type="button" className="dy-folder-tile" onClick={() => openFolder(folder.id)}>
                          <span className="dy-folder-icon"><Folder size={28} strokeWidth={2.5} aria-hidden="true" /></span>
                          <span className="dy-folder-info">
                            <strong>{folder.name}</strong>
                            <span>{folder.videoCount} video</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="dy-folder-delete"
                          onClick={(event) => handleDeleteFolder(event, folder)}
                          aria-label={`Xóa thư mục ${folder.name}`}
                          title="Xóa thư mục"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                {visibleVideos.length > 0 ? (
                  <div className="dy-video-grid">
                    {visibleVideos.map((video) => {
                  const selected = selectedIds.includes(video.id);
                  return (
                    <article key={video.id} className={`dy-video-item${selected ? ' is-selected' : ''}`}>
                      <button
                        type="button"
                        className="dy-video-tile"
                        aria-pressed={selected}
                        onClick={() => toggleSelected(video.id)}
                        onDoubleClick={() => {
                          selectOnly(video.id);
                          openVideo(video);
                        }}
                        title={`${video.title} · nhấp đúp để xem`}
                      >
                        <span className="dy-video-thumb">
                          {video.cover ? (
                            <img
                              src={video.cover}
                              alt=""
                              loading="lazy"
                              onError={(event) => { event.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Video size={32} aria-hidden="true" />
                          )}
                          <span className="dy-video-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
                          <span className={`dy-checkbox dy-video-checkbox${selected ? ' is-checked' : ''}`}>
                            {selected && <Check size={12} aria-hidden="true" />}
                          </span>
                          <span className="dy-video-duration">{formatDuration(video.duration)}</span>
                        </span>
                        <span className="dy-video-meta">
                          <strong className="dy-video-title">{video.title || 'Video Douyin'}</strong>
                          <span className="dy-video-subtitle">
                            <span>{video.author ? `@${video.author}` : 'Douyin'}</span>
                            <span>{formatSize(video.fileSize)}</span>
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="dy-video-delete"
                        onClick={(event) => handleDeleteVideo(event, video)}
                        aria-label={`Xóa ${video.title || 'video'}`}
                        title="Xóa video"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </article>
                  );
                })}
                  </div>
                ) : null}
                {!loadingLibrary && currentFolder && visibleVideos.length === 0 && (
                  <div className="dy-library-empty">Thư mục này chưa có video.</div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {isPasteModalOpen && (
        <div
          className="form-modal-backdrop dy-paste-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isBusy) setIsPasteModalOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isBusy) setIsPasteModalOpen(false);
          }}
        >
          <form
            className="form-panel form-panel-single"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dy-paste-title"
            onSubmit={handleSubmit}
          >
            <h2 id="dy-paste-title" className="form-panel-title">Dán link Douyin</h2>
            <div className="dy-paste-heading">
              <label className="dy-paste-label" htmlFor="douyin-link-input">Link hoặc nội dung chia sẻ Douyin</label>
              <Select
                id="douyin-save-folder"
                className="dy-save-folder-select"
                ariaLabel="Lưu MP4 vào thư mục"
                value={selectedFolderId}
                options={folders.map((folder) => ({ value: folder.id, label: folder.name }))}
                onChange={setSelectedFolderId}
                disabled={isBusy}
                placeholder="Chưa có thư mục"
              />
            </div>
            <textarea
              ref={inputRef}
              id="douyin-link-input"
              className="form-textarea"
              rows={5}
              placeholder={'Dán một hoặc nhiều link Douyin, mỗi link một dòng...\nhttps://www.douyin.com/video/...'}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isBusy}
            />
            {isBusy && (
              <div className="dy-loading-card">
                <div className="dy-loading-title">
                  {batchProgress
                    ? `Đang xử lý liên kết ${batchProgress.current}/${batchProgress.total} · đã lưu ${batchProgress.saved}, lỗi ${batchProgress.failed}`
                    : status === 'saving' ? 'Đang tải MP4 và lưu vào cơ sở dữ liệu...' : 'Đang xử lý liên kết...'}
                </div>
                {batchProgress?.link && <div className="dy-batch-current-link">{batchProgress.link}</div>}
                {status === 'loading' && (
                  <div className="dy-loading-steps">
                    {STEP_LABELS.map((label, index) => {
                      const stepNumber = index + 1;
                      const className = step > stepNumber ? 'dy-step done' : step === stepNumber ? 'dy-step active' : 'dy-step';
                      return (
                        <div key={label} className={className}>
                          <span className="dy-step-dot" />
                          <span>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {status === 'saving' && <div className="dy-save-progress" aria-label="Đang lưu video" />}
              </div>
            )}
            <div className="dy-folder-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsPasteModalOpen(false)}
                disabled={isBusy}
              >
                Đóng
              </button>
              <button type="submit" className="btn btn-dark" disabled={isBusy || !input.trim() || !selectedFolderId}>
                {status === 'saving' ? 'Đang lưu...' : status === 'loading' ? 'Đang trích xuất...' : 'Trích xuất và lưu MP4'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isCreateFolderOpen && (
        <div
          className="form-modal-backdrop dy-folder-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isCreatingFolder) setIsCreateFolderOpen(false);
          }}
        >
          <form
            className="form-panel form-panel-single"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dy-create-folder-title"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateFolder();
            }}
          >
            <h2 id="dy-create-folder-title" className="form-panel-title">Tạo thư mục mới</h2>
            <label className="form-label" htmlFor="douyin-folder-name">Tên thư mục</label>
            <input
              ref={folderNameRef}
              id="douyin-folder-name"
              className="form-input"
              type="text"
              maxLength={100}
              placeholder="Ví dụ: Video du lịch"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              disabled={isCreatingFolder}
            />
            <div className="dy-folder-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsCreateFolderOpen(false)}
                disabled={isCreatingFolder}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-dark" disabled={!folderName.trim() || isCreatingFolder}>
                {isCreatingFolder ? 'Đang tạo...' : 'Tạo thư mục'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingBulkAction && (
        <ConfirmDialog
          title={pendingBulkAction.type === 'delete' ? 'Xóa video đã chọn?' : 'Di chuyển video đã chọn?'}
          description={pendingBulkAction.type === 'delete'
            ? `Xóa ${selectedIds.length} video khỏi thư viện? Thao tác này không thể hoàn tác.`
            : `Di chuyển ${selectedIds.length} video vào “${folders.find((folder) => folder.id === pendingBulkAction.destination)?.name || 'Thư mục gốc'}”?`}
          confirmLabel={pendingBulkAction.type === 'delete' ? 'Xóa đã chọn' : 'Di chuyển'}
          busyLabel={pendingBulkAction.type === 'delete' ? 'Đang xóa...' : 'Đang di chuyển...'}
          confirmClassName={pendingBulkAction.type === 'delete' ? 'confirm-dialog-delete' : 'btn-dark'}
          busy={isBulkActionBusy}
          onConfirm={confirmBulkAction}
          onCancel={() => {
            if (!isBulkActionBusy) setPendingBulkAction(null);
          }}
        />
      )}

      {videoToDelete && (
        <ConfirmDialog
          title="Xóa video?"
          description={`Xóa video “${videoToDelete.title || 'Video Douyin'}” khỏi thư viện? Thao tác này không thể hoàn tác.`}
          busy={isDeletingVideo}
          onConfirm={confirmDeleteVideo}
          onCancel={() => {
            if (!isDeletingVideo) setVideoToDelete(null);
          }}
        />
      )}

      {activeVideo && (
        <div
          className="dy-viewer-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveVideo(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setActiveVideo(null);
          }}
        >
          <section className="dy-viewer" role="dialog" aria-modal="true" aria-label={activeVideo.title || 'Xem video'}>
            <header className="dy-viewer-header">
              <div>
                <strong>{activeVideo.title || 'Video Douyin'}</strong>
                <span>{activeVideo.author ? `@${activeVideo.author}` : 'Video đã lưu trong cơ sở dữ liệu'}</span>
              </div>
              <button type="button" className="dy-viewer-close" onClick={() => setActiveVideo(null)} aria-label="Đóng video">
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <video
              className="dy-viewer-video"
              src={douyinApi.savedMediaUrl(activeVideo.id)}
              poster={activeVideo.cover || undefined}
              controls
              autoPlay
              playsInline
            />
          </section>
        </div>
      )}
    </>
  );
}
