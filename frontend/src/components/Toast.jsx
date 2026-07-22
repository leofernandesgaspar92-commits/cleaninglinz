import { useEffect, useState } from 'react';

// Modul-weiter Emitter – von überall aufrufbar: toast.success('Titel', 'Text').
let listeners = [];
let seq = 0;
function emit(type, title, message, hint) {
  const t = { id: ++seq, type, title, message, hint };
  listeners.forEach((l) => l(t));
}
export const toast = {
  success: (title, message, hint) => emit('success', title, message, hint),
  error: (title, message, hint) => emit('error', title, message, hint),
  info: (title, message, hint) => emit('info', title, message, hint),
};

const ICON = { success: '✓', error: '✕', info: 'ℹ' };

// Container – einmal in der App gemountet.
export function Toasts() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const on = (t) => {
      setItems((cur) => [...cur, t]);
      const ttl = t.type === 'error' ? 8000 : 4000;
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), ttl);
    };
    listeners.push(on);
    return () => { listeners = listeners.filter((l) => l !== on); };
  }, []);

  const dismiss = (id) => setItems((cur) => cur.filter((x) => x.id !== id));

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-ico">{ICON[t.type]}</span>
          <div style={{ flex: 1 }}>
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
            {t.hint && <div className="toast-hint">💡 {t.hint}</div>}
          </div>
          <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="schließen">×</button>
        </div>
      ))}
    </div>
  );
}
