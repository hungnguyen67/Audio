import { X } from "lucide-react";

const buttonClassName =
  "btn !min-h-9 !rounded-md !px-4 !py-1.5 !text-[13px]";

export function ModalHeader({ title, titleId, onClose, closeDisabled = false }) {
  return (
    <header className="form-panel-header">
      <h2 className="form-panel-title !mb-0 !text-lg" id={titleId}>
        {title}
      </h2>
      <button
        type="button"
        className="form-panel-close"
        aria-label="Đóng cửa sổ"
        onClick={onClose}
        disabled={closeDisabled}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </header>
  );
}

export function ModalFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryType = "button",
  primaryClassName = "btn-dark",
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  secondaryButtonRef,
  status,
  liveStatus,
}) {
  return (
    <footer className="form-footer">
      <div className="flex w-full min-w-0 items-center gap-3">
        {status && (
          <div className="min-w-0 flex-1 text-right text-xs text-slate-500" aria-live="polite">
            {status}
          </div>
        )}
        <div className="form-footer-buttons !ml-auto">
          <button
            ref={secondaryButtonRef}
            type="button"
            className={`${buttonClassName} btn-outline`}
            onClick={onSecondary}
            disabled={secondaryDisabled}
          >
            {secondaryLabel}
          </button>
          <button
            type={primaryType}
            className={`${buttonClassName} ${primaryClassName}`}
            onClick={primaryType === "button" ? onPrimary : undefined}
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </button>
        </div>
        {liveStatus && (
          <span className="admin-sr-only" role="status" aria-live="polite">
            {liveStatus}
          </span>
        )}
      </div>
    </footer>
  );
}
