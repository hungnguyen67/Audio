import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ModalFooter, ModalHeader } from './ModalChrome';

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
      className="form-modal-backdrop confirm-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="form-panel form-panel-single confirm-dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <ModalHeader
          title={title}
          titleId={titleId}
          onClose={onCancel}
          closeDisabled={busy}
        />
        <div className="confirm-dialog-body">
          <p id={descriptionId} className="confirm-dialog-description">{description}</p>
        </div>
        <ModalFooter
          secondaryLabel={cancelLabel}
          onSecondary={onCancel}
          secondaryDisabled={busy}
          secondaryButtonRef={cancelButtonRef}
          primaryLabel={busy ? busyLabel : confirmLabel}
          onPrimary={onConfirm}
          primaryDisabled={busy}
          primaryClassName={confirmClassName}
        />
      </section>
    </div>,
    document.body,
  );
}
