// Schlanker Fetch-Wrapper für die Leco-API.
import { getToken, clearToken } from './auth.js';

const BASE = '/api';

// Bei abgelaufenem/fehlendem Login: Token verwerfen und zur Anmeldung.
function onUnauthorized() {
  clearToken();
  if (window.location.pathname !== '/login') window.location.assign('/login');
}

function authHeaders(extra = {}) {
  const token = getToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
  });
  if (res.status === 401) { onUnauthorized(); throw new Error('Nicht authentifiziert'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error || `HTTP ${res.status}`;
    if (res.status === 403) window.dispatchEvent(new CustomEvent('leco:forbidden', { detail: { message: msg } }));
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (p) => req(p, { method: 'DELETE' }),
  // Datei-Upload (CSV-Import) – ohne JSON-Header, aber mit Bearer-Token
  upload: async (p, formData) => {
    const res = await fetch(BASE + p, { method: 'POST', headers: authHeaders(), body: formData });
    if (res.status === 401) { onUnauthorized(); throw new Error('Nicht authentifiziert'); }
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`;
      if (res.status === 403) window.dispatchEvent(new CustomEvent('leco:forbidden', { detail: { message: msg } }));
      throw new Error(msg);
    }
    return res.json();
  },
};

// Authentifizierter Datei-Download: ein simpler <a href> sendet keinen Bearer-Token,
// darum per fetch laden und als Blob speichern.
export async function downloadAuthed(path, filename) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (res.status === 401) { onUnauthorized(); throw new Error('Nicht authentifiziert'); }
  if (res.status === 403) { window.dispatchEvent(new CustomEvent('leco:forbidden', { detail: { message: 'Keine Berechtigung' } })); throw new Error('Keine Berechtigung'); }
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'export';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Anzeige-Helfer
export const euro = (n) =>
  n == null ? '–' : new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const STATUS_LABELS = {
  ziel: 'Ziel', due_diligence: 'Due Diligence', verhandlung: 'Verhandlung',
  vertrag: 'Kaufvertrag', uebernommen: 'Übernommen', integriert: 'Integriert', verworfen: 'Verworfen',
};
