// Client-seitige Auth: Token-Verwaltung + authentifizierte Fetches + Analytics.
const KEY = 'leco_token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);
export const isLoggedIn = () => !!getToken();

// Rolle aus dem JWT lesen (nur zur UI-Steuerung; die Autorität bleibt der Server).
const ROLE_RANK = { admin: 3, manager: 2, mitarbeiter: 1 };
export function getRole() {
  const t = getToken();
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role || null;
  } catch { return null; }
}
export const roleAtLeast = (min) => (ROLE_RANK[getRole()] || 0) >= (ROLE_RANK[min] || 99);
export const canWrite = () => roleAtLeast('manager');   // Schreiben ab manager
export const canDelete = () => roleAtLeast('admin');    // Löschen nur admin

async function req(path, options = {}) {
  const token = getToken();
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  if (res.status === 401) { clearToken(); }
  if (res.status === 403) {
    const msg = await res.clone().json().then((b) => b.error).catch(() => 'Keine Berechtigung');
    window.dispatchEvent(new CustomEvent('leco:forbidden', { detail: { message: msg } }));
  }
  return res;
}

export const authApi = {
  get: (p) => req(p).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || r.status); return r.json(); }),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.json()),
};

export async function login(email, password, totp) {
  const res = await authApi.post('/auth/login', { email, password, totp });
  if (res.status === 206) return { mfaRequired: true };
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Login fehlgeschlagen');
  setToken(body.token);
  return { user: body.user };
}

export async function me() {
  if (!isLoggedIn()) return null;
  try { return await authApi.get('/auth/me'); } catch { return null; }
}

// Funktionsnutzung erfassen (Heatmap) – Fehler bewusst still.
export function track(feature, action = 'view', meta) {
  const token = getToken();
  fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ feature, action, meta }),
  }).catch(() => {});
}
