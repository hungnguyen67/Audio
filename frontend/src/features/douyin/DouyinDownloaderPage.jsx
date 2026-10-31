import { useRef, useState } from "react";
import {
  Check,
  Play,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { douyinApi } from "../../api/douyin";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalFooter, ModalHeader } from "../../components/ModalChrome";
import { toast } from "../../components/Toast";
import { useDouyinDownloader } from "./useDouyinDownloader";

const STEP_LABELS = [
  "Đang đọc liên kết Douyin...",
  "Đang tìm video...",
  "Đang chuẩn bị luồng MP4...",
];

function formatDuration(seconds) {
  const total = Number(seconds) || 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes) return "MP4";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DouyinDownloaderPage() {
  const {
    input,
    setInput,
    status,
    videos,
    selectedIds,
    step,
    batchProgress,
    loadingLibrary,
    extract,
    toggleSelected,
    selectOnly,
    selectAll,
    deleteVideo,
    deleteSelected,
  } = useDouyinDownloader();
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [pendingBulkAction, setPendingBulkAction] = useState(null);
  const [isBulkActionBusy, setIsBulkActionBusy] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const inputRef = useRef(null);
  const isBusy = status === "loading" || status === "saving";
  const visibleVideos = videos;
  const visibleVideoIds = visibleVideos.map((video) => video.id);

  const handleSubmit = (event) => {
    event.preventDefault();
    extract(input);
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    try {
      await deleteSelected();
      toast.success(
        "Đã xóa video",
        `Đã xóa ${selectedIds.length} video khỏi thư viện.`,
        5000,
      );
    } catch (deleteError) {
      toast.error(
        "Không thể xóa video",
        deleteError.message || "Vui lòng thử lại.",
        5000,
      );
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
      toast.success("Đã xóa video", "Video đã được xóa khỏi thư viện.", 5000);
    } catch (deleteError) {
      toast.error(
        "Không thể xóa video",
        deleteError.message || "Vui lòng thử lại.",
        5000,
      );
    } finally {
      setIsDeletingVideo(false);
      setVideoToDelete(null);
    }
  };

  const confirmBulkAction = async () => {
    if (!pendingBulkAction || isBulkActionBusy) return;
    setIsBulkActionBusy(true);
    try {
      await handleDeleteSelected();
      setPendingBulkAction(null);
    } finally {
      setIsBulkActionBusy(false);
    }
  };

  const openVideo = (video) => {
    setActiveVideo(video);
  };

  return (
    <>
      <div className="admin-stories-page">
        <div className="page-hero">
          <div>
            <h1 className="hero-title">Thư viện video</h1>
            <p className="hero-sub">
              Lưu MP4 vào cơ sở dữ liệu và xem trực tiếp trong ứng dụng.
            </p>
          </div>
        </div>

        <section
          className="dy-library section-card"
          aria-label="Thư viện video Douyin"
        >
          <div className="section-head dy-library-toolbar">
            <div>
              <div className="section-title">Danh sách video</div>
              <div className="section-sub">{videos.length} video đã lưu</div>
            </div>

            <div className="dy-library-actions">
              <button
                type="button"
                className="btn btn-outline dy-delete-selected"
                onClick={() => setPendingBulkAction({ type: "delete" })}
                disabled={!selectedIds.length}
              >
                <Trash2 size={15} aria-hidden="true" />
                Xóa đã chọn
                {selectedIds.length ? ` (${selectedIds.length})` : ""}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setIsPasteModalOpen(true);
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <Plus size={15} aria-hidden="true" />
                Dán link
              </button>
            </div>
          </div>

          <div className="dy-library-content">
            {visibleVideos.length > 0 && (
              <div className="dy-selection-toolbar">
                <button
                  type="button"
                  className="dy-select-all"
                  onClick={() => selectAll(visibleVideoIds)}
                >
                  <span
                    className={`dy-checkbox${visibleVideoIds.every((id) => selectedIds.includes(id)) ? " is-checked" : ""}`}
                  >
                    {visibleVideoIds.every((id) =>
                      selectedIds.includes(id),
                    ) && <Check size={12} aria-hidden="true" />}
                  </span>
                  {visibleVideoIds.every((id) => selectedIds.includes(id))
                    ? "Bỏ chọn tất cả"
                    : "Chọn tất cả"}
                </button>
                <span>Chạm một lần để chọn · nhấp đúp để xem</span>
              </div>
            )}

            {loadingLibrary ? (
              <div className="dy-library-empty">Đang tải thư viện...</div>
            ) : (
              <>
                {visibleVideos.length > 0 ? (
                  <div className="dy-video-grid">
                    {visibleVideos.map((video) => {
                      const selected = selectedIds.includes(video.id);
                      return (
                        <article
                          key={video.id}
                          className={`dy-video-item${selected ? " is-selected" : ""}`}
                        >
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
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <Video size={32} aria-hidden="true" />
                              )}
                              <span className="dy-video-play">
                                <Play
                                  size={18}
                                  fill="currentColor"
                                  aria-hidden="true"
                                />
                              </span>
                              <span
                                className={`dy-checkbox dy-video-checkbox${selected ? " is-checked" : ""}`}
                              >
                                {selected && (
                                  <Check size={12} aria-hidden="true" />
                                )}
                              </span>
                              <span className="dy-video-duration">
                                {formatDuration(video.duration)}
                              </span>
                            </span>
                            <span className="dy-video-meta">
                              <strong className="dy-video-title">
                                {video.title || "Video Douyin"}
                              </strong>
                              <span className="dy-video-subtitle">
                                <span>
                                  {video.author ? `@${video.author}` : "Douyin"}
                                </span>
                                <span>{formatSize(video.fileSize)}</span>
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="dy-video-delete"
                            onClick={(event) => handleDeleteVideo(event, video)}
                            aria-label={`Xóa ${video.title || "video"}`}
                            title="Xóa video"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
                {!loadingLibrary && visibleVideos.length === 0 && (
                  <div className="dy-library-empty">Chưa có video đã lưu.</div>
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
            if (event.target === event.currentTarget && !isBusy)
              setIsPasteModalOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isBusy) setIsPasteModalOpen(false);
          }}
        >
          <form
            className="form-panel form-panel-single"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dy-paste-title"
            onSubmit={handleSubmit}
          >
            <ModalHeader
              title="Dán link Douyin"
              titleId="dy-paste-title"
              onClose={() => setIsPasteModalOpen(false)}
              closeDisabled={isBusy}
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <label className="dy-paste-label" htmlFor="douyin-link-input">
                Link hoặc nội dung chia sẻ Douyin
              </label>
              <textarea
                ref={inputRef}
                id="douyin-link-input"
                className="form-textarea"
                rows={5}
                placeholder={
                  "Dán một hoặc nhiều link Douyin, mỗi link một dòng...\nhttps://www.douyin.com/video/..."
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isBusy}
              />
              {isBusy && (
                <div className="dy-loading-card">
                  <div className="dy-loading-title">
                    {batchProgress
                      ? `Đang xử lý liên kết ${batchProgress.current}/${batchProgress.total} · đã lưu ${batchProgress.saved}, lỗi ${batchProgress.failed}`
                      : status === "saving"
                        ? "Đang tải MP4 và lưu vào cơ sở dữ liệu..."
                        : "Đang xử lý liên kết..."}
                  </div>
                  {batchProgress?.link && (
                    <div className="dy-batch-current-link">
                      {batchProgress.link}
                    </div>
                  )}
                  {status === "loading" && (
                    <div className="dy-loading-steps">
                      {STEP_LABELS.map((label, index) => {
                        const stepNumber = index + 1;
                        const className =
                          step > stepNumber
                            ? "dy-step done"
                            : step === stepNumber
                              ? "dy-step active"
                              : "dy-step";
                        return (
                          <div key={label} className={className}>
                            <span className="dy-step-dot" />
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {status === "saving" && (
                    <div
                      className="dy-save-progress"
                      aria-label="Đang lưu video"
                    />
                  )}
                </div>
              )}
            </div>
            <ModalFooter
              secondaryLabel="Đóng"
              onSecondary={() => setIsPasteModalOpen(false)}
              secondaryDisabled={isBusy}
              primaryLabel={
                status === "saving"
                  ? "Đang lưu..."
                  : status === "loading"
                    ? "Đang trích xuất..."
                    : "Trích xuất và lưu"
              }
              primaryDisabled={isBusy || !input.trim()}
              primaryType="submit"
            />
          </form>
        </div>
      )}

      {pendingBulkAction && (
        <ConfirmDialog
          title="Xóa video đã chọn?"
          description={`Xóa ${selectedIds.length} video khỏi thư viện? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa đã chọn"
          busyLabel="Đang xóa..."
          confirmClassName="confirm-dialog-delete"
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
          description={`Xóa video “${videoToDelete.title || "Video Douyin"}” khỏi thư viện? Thao tác này không thể hoàn tác.`}
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
            if (event.key === "Escape") setActiveVideo(null);
          }}
        >
          <section
            className="dy-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={activeVideo.title || "Xem video"}
          >
            <header className="dy-viewer-header">
              <div>
                <strong>{activeVideo.title || "Video Douyin"}</strong>
                <span>
                  {activeVideo.author
                    ? `@${activeVideo.author}`
                    : "Video đã lưu trong cơ sở dữ liệu"}
                </span>
              </div>
              <button
                type="button"
                className="dy-viewer-close"
                onClick={() => setActiveVideo(null)}
                aria-label="Đóng video"
              >
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
