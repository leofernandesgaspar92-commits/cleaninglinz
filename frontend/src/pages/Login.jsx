import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setToken, track } from '../lib/auth.js';
import { toast } from '../components/Toast.jsx';

export default function Login({ onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState({ google: false, azure: false });
  const nav = useNavigate();

  useEffect(() => {
    // SSO-Rückleitung: Token kommt im URL-Fragment (#token=...).
    const m = window.location.hash.match(/token=([^&]+)/);
    if (m) { setToken(decodeURIComponent(m[1])); onAuth?.(); nav('/'); }
    fetch('/api/sso/status').then((r) => r.json()).then(setSso).catch(() => {});
    track('login.view');
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await login(email, password, mfaStep ? totp : undefined);
      if (r.mfaRequired) {
        setMfaStep(true); setBusy(false);
        toast.info('Zwei-Faktor nötig', 'Bitte den Code aus deiner Authenticator-App eingeben.');
        return;
      }
      toast.success('Angemeldet', `Willkommen zurück, ${r.user.email}.`);
      onAuth?.(); nav('/');
    } catch (e) {
      setErr(e.message);
      toast.error('Anmeldung fehlgeschlagen', e.message,
        mfaStep ? 'Prüfe, ob der 6-stellige Code noch gültig ist (30 s Fenster).' : 'E-Mail und Passwort prüfen. Nach 5 Fehlversuchen wird das Konto 15 Min gesperrt.');
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 380, margin: '8vh auto' }}>
      <div className="brand" style={{ fontSize: '2rem', textAlign: 'center' }}>Le<span style={{ color: 'var(--accent)' }}>co</span></div>
      <div className="muted" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Enterprise · Sichere Anmeldung</div>
      <form className="card" onSubmit={submit}>
        {!mfaStep ? (
          <>
            <label>E-Mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label style={{ marginTop: '.8rem', display: 'block' }}>Passwort
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <label>Authenticator-Code (6-stellig)
            <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric"
              maxLength={6} autoFocus placeholder="123456" />
            <div className="muted" style={{ fontSize: '.8rem', marginTop: '.3rem' }}>
              Code aus Google/Microsoft Authenticator eingeben.
            </div>
          </label>
        )}
        {err && <div className="badge gekuendigt" style={{ display: 'block', marginTop: '.8rem', padding: '.5rem' }}>{err}</div>}
        <button className="primary" disabled={busy} style={{ width: '100%', marginTop: '1rem' }}>
          {busy ? '…' : mfaStep ? 'Code bestätigen' : 'Anmelden'}
        </button>
      </form>

      {(sso.google || sso.azure) && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.5rem' }}>oder Single Sign-On</div>
          {sso.google && <a href="/api/sso/google/login"><button style={{ marginRight: '.5rem' }}>Google</button></a>}
          {sso.azure && <a href="/api/sso/azure/login"><button>Microsoft / Azure AD</button></a>}
        </div>
      )}
      <div className="muted" style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '.78rem' }}>
        Noch kein Konto? Der erste Nutzer wird per <code>POST /api/auth/register</code> als Admin angelegt.
      </div>
    </div>
  );
}
