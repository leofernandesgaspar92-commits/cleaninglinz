// API-Client mit Auth-Token und Offline-Warteschlange.
// Ist das Backend nicht erreichbar (Funkloch), werden Aktionen lokal
// gepuffert und beim nächsten flush() synchronisiert (wie Wowflow).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authHeaders, parseLogin } from './authcore';

// Beim Gerät: IP des Backends statt localhost eintragen.
export const BASE = 'http://10.0.2.2:4000/api'; // 10.0.2.2 = localhost im Android-Emulator

const QUEUE_KEY = 'leco_offline_queue';
const TOKEN_KEY = 'leco_token';

// Token im Speicher cachen, damit Header synchron gebaut werden können.
let token = null;
export async function initAuth() { token = await AsyncStorage.getItem(TOKEN_KEY); return !!token; }
export function isLoggedIn() { return !!token; }
async function setToken(t) { token = t; await AsyncStorage.setItem(TOKEN_KEY, t); }
export async function logout() { token = null; await AsyncStorage.removeItem(TOKEN_KEY); }

// Anmeldung: Token holen und speichern. Liefert {ok} | {mfaRequired} | {error}.
export async function login(email, password, totp) {
  try {
    const res = await fetch(BASE + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totp }),
    });
    const body = await res.json().catch(() => ({}));
    const r = parseLogin(res.status, body);
    if (r.token) { await setToken(r.token); return { ok: true, user: r.user }; }
    return r; // { mfaRequired } oder { error }
  } catch (e) {
    return { error: 'Backend nicht erreichbar' };
  }
}

async function loadQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveQueue(q) { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

export async function apiGet(path) {
  const res = await fetch(BASE + path, { headers: authHeaders(token) });
  if (res.status === 401) { await logout(); throw new Error('Sitzung abgelaufen'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Schreibaktion: versuchen zu senden, sonst in die Offline-Queue.
export async function apiSend(method, path, body) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { await logout(); return { ok: false, error: 'Sitzung abgelaufen' }; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { ok: true, offline: false, data: await res.json() };
  } catch (e) {
    const q = await loadQueue();
    q.push({ method, path, body, ts: Date.now() });
    await saveQueue(q);
    return { ok: true, offline: true };
  }
}

// Gepufferte Aktionen nachträglich synchronisieren (mit aktuellem Token).
export async function flushQueue() {
  const q = await loadQueue();
  const remaining = [];
  for (const item of q) {
    try {
      const res = await fetch(BASE + item.path, {
        method: item.method,
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch {
      remaining.push(item);
    }
  }
  await saveQueue(remaining);
  return { synced: q.length - remaining.length, pending: remaining.length };
}

export async function queueSize() {
  return (await loadQueue()).length;
}
