import { Router } from 'express';
import { query, one } from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/security.js';
import { notify, notifyStatus, recentNotifications } from '../lib/notify.js';

const router = Router();
// Alle Admin-Endpunkte erfordern Authentifizierung + Admin-Rolle.
router.use(requireAuth, requireRole('admin'));

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

export default router;
