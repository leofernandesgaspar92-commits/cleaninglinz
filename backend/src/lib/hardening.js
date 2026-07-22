// ============================================================================
//  Sicherheits-Härtung: HTTP-Sicherheits-Header, Rate-Limiting (Brute-Force-
//  Schutz) und Readiness-Probe. Ohne Zusatzabhängigkeiten.
// ============================================================================
import { query } from './db.js';

// --- Sicherheits-Header (helmet-artig) -------------------------------------
export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-DNS-Prefetch-Control', 'off');
  res.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set('Cross-Origin-Resource-Policy', 'same-site');
  // HSTS nur sinnvoll hinter HTTPS – schadet über HTTP nicht.
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// --- Rate-Limiting (In-Memory, gleitendes Fenster je IP) -------------------
export function rateLimit({ windowMs = 60000, max = 300, name = 'global' } = {}) {
  const hits = new Map(); // key -> [timestamps]
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - arr.length)));
    if (arr.length > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte kurz warten.' });
    }
    next();
  };
}

// --- Readiness/Liveness ----------------------------------------------------
export async function readiness(req, res) {
  try {
    await query('SELECT 1');
    res.json({ status: 'ready', db: 'ok', uptime_s: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ status: 'not_ready', db: 'down', error: e.message });
  }
}
