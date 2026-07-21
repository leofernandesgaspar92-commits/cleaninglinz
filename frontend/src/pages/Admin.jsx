import { useEffect, useState, useCallback } from 'react';
import { authApi, track } from '../lib/auth.js';

export default function Admin() {
  const [data, setData] = useState({ overview: null, audit: [], errors: [], users: [], heatmap: null });
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [overview, audit, errors, users, heatmap] = await Promise.all([
        authApi.get('/admin/overview'),
        authApi.get('/admin/audit?limit=25'),
        authApi.get('/admin/errors'),
        authApi.get('/admin/users'),
        authApi.get('/analytics/heatmap?days=30'),
      ]);
      setData({ overview, audit, errors, users, heatmap }); setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { track('admin.view'); load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function setRole(id, role) { await authApi.patch(`/admin/users/${id}/role`, { role }); load(); }

  if (err) return <div className="card" style={{ borderColor: 'var(--danger)' }}>Kein Zugriff ({err}). Admin-Rolle erforderlich.</div>;
  const s = data.overview?.stats;

  return (
    <div>
      <div className="page-head"><h1>Admin · Systemüberwachung</h1></div>

      <div className="cards" style={{ marginBottom: '1.2rem' }}>
        <Kpi label="Nutzer" value={s?.users} sub={`${s?.users_mfa ?? 0} mit MFA`} />
        <Kpi label="Logins (24h)" value={s?.logins_24h} />
        <Kpi label="Fehl-Logins (24h)" value={s?.login_fails_24h} color={s?.login_fails_24h > 0 ? '#f85149' : undefined} />
        <Kpi label="Fehler (24h)" value={s?.errors_24h} color={s?.errors_24h > 0 ? '#f85149' : undefined} />
        <Kpi label="Events (24h)" value={s?.events_24h} />
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px' }}>
          <h3>🔐 Login-Protokoll</h3>
          <div className="card" style={{ padding: '.2rem' }}>
            <table><thead><tr><th>Nutzer</th><th>Ereignis</th><th>IP</th><th>Zeit</th></tr></thead>
              <tbody>
                {data.overview?.recentLogins?.map((l, i) => (
                  <tr key={i}>
                    <td>{l.actor_email || '–'}</td>
                    <td><span className={`badge ${l.action === 'login_success' ? 'ok' : 'gekuendigt'}`}>{l.action === 'login_success' ? 'Erfolg' : 'Fehlschlag'}</span></td>
                    <td className="muted">{l.ip || '–'}</td>
                    <td className="muted" style={{ fontSize: '.75rem' }}>{l.created_at?.slice(11, 19)}</td>
                  </tr>
                ))}
              </tbody></table>
          </div>

          <h3 style={{ marginTop: '1rem' }}>👥 Benutzer & Rollen</h3>
          <div className="card" style={{ padding: '.2rem' }}>
            <table><thead><tr><th>E-Mail</th><th>MFA</th><th>Rolle</th></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.mfa_enabled ? '✅' : '—'}</td>
                    <td>
                      <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} style={{ width: 'auto' }}>
                        <option value="mitarbeiter">mitarbeiter</option>
                        <option value="manager">manager</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody></table>
          </div>
        </div>

        <div style={{ flex: '1 1 380px' }}>
          <h3>🔥 Funktions-Heatmap (30 Tage)</h3>
          <div className="card">
            {(data.heatmap?.byFeature || []).length === 0
              ? <div className="muted">Noch keine Nutzungsdaten.</div>
              : <HeatBars items={data.heatmap.byFeature} />}
          </div>

          <h3 style={{ marginTop: '1rem' }}>⚠ Fehler-Log</h3>
          <div className="card" style={{ padding: '.2rem', maxHeight: 240, overflow: 'auto' }}>
            <table><thead><tr><th>Meldung</th><th>Pfad</th><th>Zeit</th></tr></thead>
              <tbody>
                {data.errors.length === 0 && <tr><td colSpan="3" className="muted">Keine Fehler.</td></tr>}
                {data.errors.map((e) => (
                  <tr key={e.id}><td style={{ fontSize: '.8rem' }}>{e.message}</td>
                    <td className="muted" style={{ fontSize: '.75rem' }}>{e.method} {e.path}</td>
                    <td className="muted" style={{ fontSize: '.72rem' }}>{e.created_at?.slice(11, 19)}</td></tr>
                ))}
              </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value" style={color ? { color } : undefined}>{value ?? '–'}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// Horizontale Balken – ein Maß (Nutzungshäufigkeit), einfarbig, mit Direktlabels.
function HeatBars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.uses));
  return (
    <div>
      {items.slice(0, 12).map((i) => (
        <div key={i.feature} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', margin: '.35rem 0' }}>
          <div style={{ width: 150, fontSize: '.8rem' }} className="muted">{i.feature}</div>
          <div style={{ flex: 1, background: 'var(--bg-elev2)', borderRadius: 4, height: 16 }}>
            <div style={{ width: `${(i.uses / max) * 100}%`, background: '#2f81f7', height: '100%', borderRadius: 4 }} />
          </div>
          <div style={{ width: 34, textAlign: 'right', fontSize: '.8rem' }}>{i.uses}</div>
        </div>
      ))}
    </div>
  );
}
