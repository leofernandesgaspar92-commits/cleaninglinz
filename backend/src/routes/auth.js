import { Router } from 'express';
import { query, one } from '../lib/db.js';
import {
  hashPassword, verifyPassword, signToken,
  generateTotpSecret, otpauthURL, verifyTotp,
} from '../lib/auth.js';
import { audit, requireAuth, requireRole } from '../lib/security.js';
import { notify } from '../lib/notify.js';

const router = Router();
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const publicUser = (u) => ({
  id: u.id, email: u.email, full_name: u.full_name, role: u.role,
  mfa_enabled: u.mfa_enabled, provider: u.provider, last_login_at: u.last_login_at,
});

// --- Registrierung ---------------------------------------------------------
// Erster Nutzer (kein Bestand) darf sich selbst als admin anlegen (Bootstrap);
// danach dürfen nur Admins weitere Nutzer anlegen.
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, full_name, role = 'mitarbeiter' } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort nötig' });

    // Bootstrap ist offen, solange noch kein Nutzer mit Passwort existiert
    // (Seed-Nutzer ohne Passwort blockieren die Erstanlage nicht).
    const [{ count }] = await query('SELECT COUNT(*)::int AS count FROM users WHERE password_hash IS NOT NULL');
    let assignedRole = role;
    if (count > 0) {
      // Bestehendes System: Admin-Token erforderlich.
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      const { verifyToken } = await import('../lib/auth.js');
      const claims = token && verifyToken(token);
      if (!claims || claims.role !== 'admin')
        return res.status(403).json({ error: 'Nur Admins dürfen Nutzer anlegen' });
    } else {
      assignedRole = 'admin'; // Bootstrap: erster Nutzer wird Admin
    }

    const exists = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (exists) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

    const user = await one(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [email, full_name ?? null, assignedRole, hashPassword(password)]
    );
    await audit(req, { action: 'user_registered', entity: 'users', entityId: user.id, detail: { email, role: assignedRole } });
    notify({ level: 'success', title: 'Neuer Benutzer', message: `${email} wurde als ${assignedRole} angelegt.` });
    res.status(201).json(publicUser(user));
  } catch (e) { next(e); }
});

// --- Login (Passwort + optional MFA) ---------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, totp } = req.body;
    const user = await one('SELECT * FROM users WHERE email = $1', [email]);

    const fail = async (reason) => {
      await audit(req, { action: 'login_failed', detail: { email, reason } });
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
    };
    if (!user) return fail('unknown_user');
    if (user.locked_until && new Date(user.locked_until) > new Date())
      return res.status(423).json({ error: 'Konto vorübergehend gesperrt. Bitte später erneut versuchen.' });

    if (!verifyPassword(password, user.password_hash)) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? `now() + interval '${LOCK_MINUTES} minutes'` : 'locked_until';
      await query(`UPDATE users SET failed_logins=$2, locked_until=${lock} WHERE id=$1`, [user.id, failed]);
      return fail('bad_password');
    }

    // MFA erzwingen, falls aktiviert.
    if (user.mfa_enabled) {
      if (!totp) return res.status(206).json({ mfa_required: true });
      if (!verifyTotp(user.mfa_secret, totp)) return fail('bad_totp');
    }

    await query('UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [user.id]);
    await audit({ ...req, user: { sub: user.id, email: user.email } }, { action: 'login_success' });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token, user: publicUser(user) });
  } catch (e) { next(e); }
});

// --- Aktueller Nutzer ------------------------------------------------------
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.sub]);
    if (!user) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

// --- MFA einrichten (Secret + QR-URL erzeugen) -----------------------------
router.post('/mfa/setup', requireAuth, async (req, res, next) => {
  try {
    const secret = generateTotpSecret();
    await query('UPDATE users SET mfa_secret=$2 WHERE id=$1', [req.user.sub, secret]);
    res.json({ secret, otpauth_url: otpauthURL(secret, { label: req.user.email }) });
  } catch (e) { next(e); }
});

// --- MFA aktivieren (Code aus Authenticator prüfen) ------------------------
router.post('/mfa/enable', requireAuth, async (req, res, next) => {
  try {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.sub]);
    if (!user?.mfa_secret) return res.status(400).json({ error: 'Zuerst /mfa/setup aufrufen' });
    if (!verifyTotp(user.mfa_secret, req.body.code)) return res.status(400).json({ error: 'Code ungültig' });
    await query('UPDATE users SET mfa_enabled=TRUE WHERE id=$1', [req.user.sub]);
    await audit(req, { action: 'mfa_enabled' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- MFA deaktivieren ------------------------------------------------------
router.post('/mfa/disable', requireAuth, async (req, res, next) => {
  try {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.sub]);
    if (!verifyTotp(user.mfa_secret, req.body.code)) return res.status(400).json({ error: 'Code ungültig' });
    await query('UPDATE users SET mfa_enabled=FALSE, mfa_secret=NULL WHERE id=$1', [req.user.sub]);
    await audit(req, { action: 'mfa_disabled' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
