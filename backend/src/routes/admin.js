import { Router } from 'express';
import { query, one } from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/security.js';
import { notify, notifyStatus, recentNotifications } from '../lib/notify.js';
import { runContractWatch, upcomingExpiries } from '../lib/contractWatch.js';

const router = Router();
// Alle Admin-Endpunkte erfordern Authentifizierung + Admin-Rolle.
router.use(requireAuth, requireRole('admin'));

// Optionale Richtlinie: privilegierte Admin-Aktionen (Schreibzugriffe) nur mit
// aktiver MFA. Lesen (GET) bleibt erlaubt, damit betroffene Admins die Warnung
// sehen und MFA über /sicherheit aktivieren können. Aktiv via REQUIRE_ADMIN_MFA.
const REQUIRE_ADMIN_MFA = /^(1|true|yes|on)$/i.test(process.env.REQUIRE_ADMIN_MFA || '');
router.use(async (req, res, next) => {
  if (!REQUIRE_ADMIN_MFA || req.method === 'GET' || req.method === 'HEAD') return next();
  try {
    const u = await one('SELECT mfa_enabled FROM users WHERE id = $1', [req.user.sub]);
    if (!u?.mfa_enabled)
      return res.status(403).json({ error: 'MFA für Admin-Aktionen erforderlich – bitte unter „Sicherheit" aktivieren.', code: 'admin_mfa_required' });
    next();
  } catch (e) { next(e); }
});

// Benachrichtigungen: Feed, Konfigurationsstatus, Test-Versand
router.get('/notifications', async (req, res, next) => {
  try { res.json({ status: notifyStatus(), items: await recentNotifications() }); } catch (e) { next(e); }
});
router.post('/notify/test', async (req, res, next) => {
  try {
    const n = await notify({ level: 'info', title: 'Testbenachrichtigung',
      message: `Ausgelöst von ${req.user.email}. Slack/Teams greift, sobald ein Webhook gesetzt ist.` });
    res.json(n);
  } catch (e) { next(e); }
});

// Audit-Log (Logins, Datenänderungen, MFA-Ereignisse)
router.get('/audit', async (req, res, next) => {
  try {
    const { action, limit = 100 } = req.query;
    const rows = action
      ? await query('SELECT * FROM audit_log WHERE action = $1 ORDER BY created_at DESC LIMIT $2', [action, limit])
      : await query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1', [limit]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Fehler-Log
router.get('/errors', async (req, res, next) => {
  try {
    res.json(await query('SELECT * FROM error_log ORDER BY created_at DESC LIMIT 100'));
  } catch (e) { next(e); }
});

// System-Überblick (Echtzeit-Kennzahlen)
router.get('/overview', async (req, res, next) => {
  try {
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE mfa_enabled) AS users_mfa,
        (SELECT COUNT(*) FROM audit_log WHERE action='login_success' AND created_at > now()-interval '24 hours') AS logins_24h,
        (SELECT COUNT(*) FROM audit_log WHERE action='login_failed' AND created_at > now()-interval '24 hours') AS login_fails_24h,
        (SELECT COUNT(*) FROM error_log WHERE created_at > now()-interval '24 hours') AS errors_24h,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at > now()-interval '24 hours') AS events_24h
    `);
    const recentLogins = await query(
      `SELECT actor_email, action, ip, created_at FROM audit_log
       WHERE action IN ('login_success','login_failed') ORDER BY created_at DESC LIMIT 10`);
    res.json({ stats, recentLogins });
  } catch (e) { next(e); }
});

// Benutzerverwaltung (Liste + Rolle ändern)
router.get('/users', async (req, res, next) => {
  try {
    res.json(await query(
      `SELECT id, email, full_name, role, mfa_enabled, provider, last_login_at, failed_logins, locked_until
       FROM users ORDER BY created_at`));
  } catch (e) { next(e); }
});
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'manager', 'mitarbeiter'].includes(role))
      return res.status(400).json({ error: 'ungültige Rolle' });
    const u = await one('UPDATE users SET role=$2 WHERE id=$1 RETURNING id, email, role', [req.params.id, role]);
    res.json(u || { error: 'nicht gefunden' });
  } catch (e) { next(e); }
});

// Vertragsauslauf-Wächter: Vorschau (ohne Benachrichtigung) …
router.get('/contract-watch/preview', async (req, res, next) => {
  try {
    const withinDays = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    res.json({ within_days: withinDays, items: await upcomingExpiries(withinDays) });
  } catch (e) { next(e); }
});
// … und Ausführung (benachrichtigt je neuen Auslauf einmal).
router.post('/contract-watch', async (req, res, next) => {
  try {
    const withinDays = Math.min(Math.max(parseInt(req.body?.days, 10) || 30, 1), 365);
    res.json(await runContractWatch({ withinDays }));
  } catch (e) { next(e); }
});

export default router;
