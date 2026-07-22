import { useState } from 'react';
import { authApi } from '../lib/auth.js';
import { toast } from '../components/Toast.jsx';

// Selbstverwaltung der Zwei-Faktor-Authentifizierung (TOTP).
// Macht das vorhandene, RFC-6238-konforme MFA-Backend im UI nutzbar.
export default function Security({ user, onChange }) {
  const [setup, setSetup] = useState(null); // { secret, otpauth_url }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = !!user?.mfa_enabled;

  async function startSetup() {
    setBusy(true);
    try {
      const r = await authApi.post('/auth/mfa/setup', {});
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Setup fehlgeschlagen');
      setSetup(body);
    } catch (e) { toast.error('Fehler', e.message); }
    finally { setBusy(false); }
  }

  async function enable() {
    setBusy(true);
    try {
      const r = await authApi.post('/auth/mfa/enable', { code: code.trim() });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Aktivierung fehlgeschlagen');
      toast.success('MFA aktiviert', 'Ab jetzt beim Login zusätzlich der 6-stellige Code.');
      setSetup(null); setCode(''); onChange?.();
    } catch (e) { toast.error('Code ungültig', e.message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    try {
      const r = await authApi.post('/auth/mfa/disable', { code: code.trim() });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Deaktivierung fehlgeschlagen');
      toast.info('MFA deaktiviert', 'Zwei-Faktor-Schutz ist aus.');
      setCode(''); onChange?.();
    } catch (e) { toast.error('Code ungültig', e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sicherheit</h1>
          <div className="muted">Zwei-Faktor-Authentifizierung (TOTP) für dein Konto {user?.email}.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <h3 style={{ marginTop: 0 }}>
          🔐 Zwei-Faktor-Authentifizierung {enabled
            ? <span className="badge ok" style={{ marginLeft: '.4rem' }}>aktiv</span>
            : <span className="badge geplant" style={{ marginLeft: '.4rem' }}>inaktiv</span>}
        </h3>

        {!enabled && !setup && (
          <>
            <p className="muted">Schütze dein Konto zusätzlich mit einer Authenticator-App
              (Google/Microsoft Authenticator, 1Password …).</p>
            <button className="primary" onClick={startSetup} disabled={busy}>MFA einrichten</button>
          </>
        )}

        {!enabled && setup && (
          <>
            <p className="muted">1) In der Authenticator-App „Konto hinzufügen → Schlüssel manuell eingeben"
              und diesen Schlüssel eintragen:</p>
            <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '2px',
              background: 'var(--bg-elev, #161b22)', padding: '.6rem .8rem', borderRadius: 8,
              border: '1px solid var(--border)', wordBreak: 'break-all', marginBottom: '.6rem' }}>
              {setup.secret}
            </div>
            <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.8rem', wordBreak: 'break-all' }}>
              oder per otpauth-Link: <code>{setup.otpauth_url}</code>
            </div>
            <p className="muted">2) 6-stelligen Code aus der App eingeben:</p>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
                maxLength={6} placeholder="123456" style={{ maxWidth: 160 }} autoFocus />
              <button className="primary" onClick={enable} disabled={busy || code.trim().length !== 6}>Aktivieren</button>
            </div>
          </>
        )}

        {enabled && (
          <>
            <p className="muted">Dein Konto ist per Zwei-Faktor-Authentifizierung geschützt.
              Zum Deaktivieren einen aktuellen Code eingeben:</p>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
                maxLength={6} placeholder="123456" style={{ maxWidth: 160 }} />
              <button onClick={disable} disabled={busy || code.trim().length !== 6}>MFA deaktivieren</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
