// API-Client mit Offline-Warteschlange.
// Ist das Backend nicht erreichbar (Funkloch), werden Aktionen lokal
// gepuffert und beim nächsten flush() synchronisiert (wie Wowflow).
import AsyncStorage from '@react-native-async-storage/async-storage';

// Beim Gerät: IP des Backends statt localhost eintragen.
export const BASE = 'http://10.0.2.2:4000/api'; // 10.0.2.2 = localhost im Android-Emulator

const QUEUE_KEY = 'leco_offline_queue';

async function loadQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveQueue(q) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function apiGet(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Schreibaktion: versuchen zu senden, sonst in die Offline-Queue.
export async function apiSend(method, path, body) {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { ok: true, offline: false, data: await res.json() };
  } catch (e) {
    const q = await loadQueue();
    q.push({ method, path, body, ts: Date.now() });
    await saveQueue(q);
    return { ok: true, offline: true };
  }
}

// Gepufferte Aktionen nachträglich synchronisieren.
export async function flushQueue() {
  const q = await loadQueue();
  const remaining = [];
  for (const item of q) {
    try {
      await fetch(BASE + item.path, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
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
