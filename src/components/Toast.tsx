import { useStore } from '../store/store';

export default function ToastContainer() {
  const toasts = useStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div id="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type === 'error' ? 'toast--error' : ''}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
