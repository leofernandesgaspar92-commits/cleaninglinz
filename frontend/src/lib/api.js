// Schlanker Fetch-Wrapper für die Leco-API.
const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (p) => req(p, { method: 'DELETE' }),
  // Datei-Upload (CSV-Import) – ohne JSON-Header
  upload: async (p, formData) => {
    const res = await fetch(BASE + p, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return res.json();
  },
};

// Anzeige-Helfer
export const euro = (n) =>
  n == null ? '–' : new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const STATUS_LABELS = {
  ziel: 'Ziel', due_diligence: 'Due Diligence', verhandlung: 'Verhandlung',
  vertrag: 'Kaufvertrag', uebernommen: 'Übernommen', integriert: 'Integriert', verworfen: 'Verworfen',
};
