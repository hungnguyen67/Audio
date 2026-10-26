import { useEditorContext } from "./EditorContext";

export function getSaveLabel({ saving, pending }) {
  const count = pending.chapters.length;
  if (saving) return "Đang lưu...";
  if (pending.mergedFrom) return count === 1 ? "Lưu 1 tập đã gộp" : `Lưu ${count} tập đã gộp`;
  return count ? `Lưu ${count} chương` : "Lưu";
}

export function EditorFooter({ onSubmit }) {
  const { state, story, actions, busy } = useEditorContext();
  const { editing, saving, pending, importStatus, status } = state;

  return (
    <div className="form-footer">
      <div className="form-footer-actions">
        <div className="form-footer-buttons">
          <button type="button" className="btn btn-dark" onClick={onSubmit} disabled={busy}>
            {getSaveLabel({ saving, pending })}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={editing ? () => actions.cancelEdit(story) : actions.close}
            disabled={busy}
          >
            {editing ? "Hủy" : "Đóng"}
          </button>
        </div>
        {importStatus && (
          <div className="form-msg" aria-live="polite">
            {importStatus}
          </div>
        )}
        <span className="admin-sr-only" role="status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  );
}
