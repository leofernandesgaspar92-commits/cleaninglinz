// ============================================================================
//  Caching-Schicht – nutzt Redis (falls REDIS_URL gesetzt), sonst In-Memory.
//  Identische API, damit die App ohne externen Redis lokal läuft und in
//  Produktion nahtlos auf Redis skaliert.
// ============================================================================
let redis = null;
let useRedis = false;
const mem = new Map();            // key -> { value, expires }
const stats = { hits: 0, misses: 0 };

if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await redis.connect();
    useRedis = true;
    console.log('Cache: Redis verbunden.');
  } catch (e) {
    console.warn('Cache: Redis nicht verfügbar, nutze In-Memory:', e.message);
  }
}

export async function get(key) {
  if (useRedis) {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  }
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) { mem.delete(key); return null; }
  return e.value;
}

export async function set(key, value, ttlMs) {
  if (useRedis) return redis.set(key, JSON.stringify(value), 'PX', ttlMs);
  mem.set(key, { value, expires: Date.now() + ttlMs });
}

export async function del(prefix) {
  if (useRedis) {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(keys);
    return;
  }
  for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k);
}

// wrap: liefert aus dem Cache oder berechnet, speichert und liefert.
export async function wrap(key, ttlMs, fn) {
  const cached = await get(key);
  if (cached !== null) { stats.hits++; return cached; }
  stats.misses++;
  const value = await fn();
  await set(key, value, ttlMs);
  return value;
}

export function cacheStats() {
  const total = stats.hits + stats.misses;
  return { backend: useRedis ? 'redis' : 'memory', ...stats,
    hit_rate: total ? +(stats.hits / total).toFixed(3) : 0, keys: useRedis ? undefined : mem.size };
}
