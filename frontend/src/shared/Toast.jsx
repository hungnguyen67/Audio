import { X } from 'lucide-react';
import { toast as hotToast } from 'react-hot-toast';

export function Toast({ id, title, message, description, type = 'success', visible = true }) {
  const isSuccess = type === 'success';
  const displayTitle = title || message || '';

  return (
    <div className={`app-toast${visible ? ' is-visible' : ' is-hidden'}`}>
      <div className={`toast-status-icon ${isSuccess ? 'is-success' : 'is-error'}`} aria-hidden="true">
        {isSuccess ? '✓' : '×'}
      </div>
      <div className="toast-content">
        <p className="toast-title">{displayTitle}</p>
        {description && <p className="toast-description">{description}</p>}
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label="Đóng thông báo"
        onClick={() => id && hotToast.dismiss(id)}
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

export const toast = {
  success: (title, description) => hotToast.custom(
    (item) => <Toast id={item.id} title={title} description={description} type="success" visible={item.visible} />,
    { duration: 1000 },
  ),
  error: (title, description) => hotToast.custom(
    (item) => <Toast id={item.id} title={title} description={description} type="error" visible={item.visible} />,
    { duration: 1000 },
  ),
};
