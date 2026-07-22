// ============================================================================
//  Sicherheits-Middleware: Authentifizierung, rollenbasierte Berechtigung (RBAC),
//  Audit-, Fehler- und Analytics-Protokollierung.
// ============================================================================
import { verifyToken } from './auth.js';
import { query } from './db.js';

// Rollen-Hierarchie: admin ⊃ manager ⊃ mitarbeiter.
const ROLE_RANK = { admin: 3, manager: 2, mitarbeiter: 1 };
export function roleAtLeast(role, min) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 99);
}

// --- Audit / Fehler / Analytics --------------------------------------------
export async function audit(req, { action, entity, entityId, detail } = {}) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, actor_email, action, entity, entity_id, detail, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req?.user?.sub ?? null, req?.user?.email ?? null, action, entity ?? null,
       entityId ?? null, detail ? JSON.stringify(detail) : null,
       req?.ip ?? null, req?.headers?.['user-agent'] ?? null]
    );
  } catch (e) { console.error('audit failed:', e.message); }
}

export async function logError({ level = 'error', message, stack, method, path, status }) {
  try {
    await query(
      `INSERT INTO error_log (level, message, stack, method, path, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [level, message, stack ?? null, method ?? null, path ?? null, status ?? null]
    );
  } catch (e) { console.error('error_log failed:', e.message); }
}

export async function trackEvent({ userId, feature, action, meta }) {
  try {
    await query(
      `INSERT INTO analytics_events (user_id, feature, action, meta) VALUES ($1,$2,$3,$4)`,
      [userId ?? null, feature, action ?? null, meta ? JSON.stringify(meta) : null]
    );
  } catch (e) { console.error('analytics failed:', e.message); }
}

// --- Auth-Middleware -------------------------------------------------------
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token && verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'Nicht authentifiziert' });
  req.user = claims; // { sub, email, role, ... }
  next();
}

// Rollen-Gate: requireRole('admin') oder requireRole('manager').
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    if (!roleAtLeast(req.user.role, minRole))
      return res.status(403).json({ error: `Rolle "${minRole}" erforderlich` });
    next();
  };
}
