// ============================================================================
//  Single Sign-On (OAuth2 Authorization-Code-Flow) – Google & Azure AD.
//  Vollständiger Flow; aktiv, sobald die Zugangsdaten per Umgebung gesetzt sind.
//  Nicht konfigurierte Provider antworten mit 501 + klarer Meldung.
// ============================================================================
import { Router } from 'express';
import { one, query } from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { audit } from '../lib/security.js';

const router = Router();
const REDIRECT_BASE = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const PROVIDERS = {
  google: {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  azure: {
    id: process.env.AZURE_CLIENT_ID,
    secret: process.env.AZURE_CLIENT_SECRET,
    tenant: process.env.AZURE_TENANT || 'common',
    get authUrl() { return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`; },
    get tokenUrl() { return `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`; },
    userUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile',
  },
};

const redirectUri = (p) => `${REDIRECT_BASE}/api/sso/${p}/callback`;

// 1) Login starten: zum Provider umleiten.
router.get('/:provider/login', (req, res) => {
  const p = PROVIDERS[req.params.provider];
  if (!p) return res.status(404).json({ error: 'Unbekannter Provider' });
  if (!p.id || !p.secret)
    return res.status(501).json({ error: `${req.params.provider} SSO nicht konfiguriert (Client-ID/Secret fehlen)` });

  const params = new URLSearchParams({
    client_id: p.id,
    redirect_uri: redirectUri(req.params.provider),
    response_type: 'code',
    scope: p.scope,
    state: req.params.provider,
  });
  res.redirect(`${p.authUrl}?${params}`);
});

// 2) Callback: Code gegen Token tauschen, Nutzer holen, JWT ausstellen.
router.get('/:provider/callback', async (req, res, next) => {
  try {
    const provider = req.params.provider;
    const p = PROVIDERS[provider];
    if (!p?.id) return res.status(501).send('SSO nicht konfiguriert');
    const { code } = req.query;
    if (!code) return res.status(400).send('Kein Autorisierungscode');

    // Token-Austausch
    const tokenRes = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: p.id, client_secret: p.secret, code,
        grant_type: 'authorization_code', redirect_uri: redirectUri(provider),
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.status(401).send('Token-Austausch fehlgeschlagen');

    // Nutzerprofil
    const profRes = await fetch(p.userUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const prof = await profRes.json();
    const email = prof.email;
    const sub = prof.sub || prof.oid;
    if (!email) return res.status(400).send('Keine E-Mail vom Provider erhalten');

    // Nutzer anlegen/aktualisieren (Just-in-Time-Provisioning)
    let user = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      user = await one(
        `INSERT INTO users (email, full_name, role, provider, provider_sub)
         VALUES ($1,$2,'mitarbeiter',$3,$4) RETURNING *`,
        [email, prof.name ?? null, provider, sub ?? null]);
    } else {
      await query('UPDATE users SET provider=$2, provider_sub=$3, last_login_at=now() WHERE id=$1',
        [user.id, provider, sub ?? null]);
    }
    await audit({ ...req, user: { sub: user.id, email } }, { action: 'login_success', detail: { provider } });

    const token = signToken({ sub: user.id, email, role: user.role });
    // Token an das Frontend übergeben (Fragment, damit es nicht im Server-Log landet).
    res.redirect(`${FRONTEND_URL}/login#token=${token}`);
  } catch (e) { next(e); }
});

// Status: welche Provider sind konfiguriert?
router.get('/status', (req, res) => {
  res.json({
    google: !!(PROVIDERS.google.id && PROVIDERS.google.secret),
    azure: !!(PROVIDERS.azure.id && PROVIDERS.azure.secret),
  });
});

export default router;
