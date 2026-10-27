import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Xóa',
  cancelLabel = 'Hủy',
  busy = false,
  busyLabel = 'Đang xóa...',
  confirmClassName = 'confirm-dialog-delete',
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) onCancelRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">
          <AlertTriangle size={22} strokeWidth={2} />
        </div>
        <div className="confirm-dialog-content">
          <h2 id={titleId} className="confirm-dialog-title">{title}</h2>
          <p id={descriptionId} className="confirm-dialog-description">{description}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button ref={cancelButtonRef} type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${confirmClassName}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
