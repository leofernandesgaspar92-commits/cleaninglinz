import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, euro, STATUS_LABELS } from '../lib/api.js';
import { canWrite } from '../lib/auth.js';

const COLUMNS = ['ziel', 'due_diligence', 'verhandlung', 'vertrag', 'uebernommen', 'integriert'];

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [roi, setRoi] = useState(null);
  const [drag, setDrag] = useState(null);
  const [err, setErr] = useState(null);
  const nav = useNavigate();
  const writable = canWrite(); // ab „manager": Pipeline per Drag & Drop änderbar

  const load = () => api.get('/companies').then(setCompanies).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/dashboard/merger-roi').then(setRoi).catch(() => {}); }, []);

  async function drop(status) {
    if (!drag || drag.status === status) return setDrag(null);
    // Optimistisches Update
    setCompanies((cs) => cs.map((c) => (c.id === drag.id ? { ...c, status } : c)));
    try { await api.patch(`/companies/${drag.id}`, { status }); }
    catch (e) { setErr(e.message); load(); }
    setDrag(null);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Unternehmens-Tracker</h1>
          <div className="muted">
            {writable ? 'Rockefeller-Modus: Übernahme-Pipeline per Drag & Drop steuern.'
              : 'Nur-Lese-Ansicht – Pipeline-Änderungen ab Rolle „Manager".'}
          </div>
        </div>
        {writable && <button className="primary" onClick={() => nav('/uebernahme')}>⚡ Neue Übernahme</button>}
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>{err}</div>}

      {roi && roi.targets.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>💰 Übernahme-ROI &amp; Synergien</span>
            <span className="muted" style={{ fontSize: '.75rem' }}>
              Annahmen: Kaufpreis ≈ {roi.assumptions.ask_multiple}× EBITDA (falls offen) ·
              Synergie {Math.round(roi.assumptions.synergy_rate * 100)}% vom Umsatz
            </span>
          </h3>
          <div className="card" style={{ padding: '.2rem', overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Ziel</th><th>Status</th><th>EBITDA</th><th>Kaufpreis</th>
                  <th>Multiple</th><th>ROI</th><th>ROI + Synergie</th><th>Amortisation</th>
                </tr>
              </thead>
              <tbody>
                {roi.targets.map((t, i) => (
                  <tr key={t.id}>
                    <td><b>{i === 0 && '🏆 '}{t.name}</b></td>
                    <td><span className="badge">{STATUS_LABELS[t.status] || t.status}</span></td>
                    <td>{euro(t.ebitda)}</td>
                    <td>{euro(t.price)}{t.price_estimated && <span className="muted" title="geschätzt aus EBITDA-Multiple"> *</span>}</td>
                    <td>{t.ebitda_multiple}×</td>
                    <td>{t.roi_pct}%</td>
                    <td><b style={{ color: 'var(--accent)' }}>{t.roi_with_synergy_pct}%</b></td>
                    <td>{t.payback_with_synergy_years} J.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>
            * Kaufpreis geschätzt (kein Angebot hinterlegt). Sortiert nach ROI inkl. Synergien.
          </div>
        </div>
      )}

      <div className="kanban">
        {COLUMNS.map((status) => {
          const items = companies.filter((c) => c.status === status);
          return (
            <div key={status} className="kanban-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(status)}>
              <h3>{STATUS_LABELS[status]} · {items.length}</h3>
              {items.map((c) => (
                <div key={c.id}
                  className={`kanban-card ${drag?.id === c.id ? 'dragging' : ''}`}
                  draggable={writable}
                  onDragStart={() => writable && setDrag(c)}
                  onDragEnd={() => setDrag(null)}
                  onClick={() => nav(`/uebernahme/${c.id}`)}>
                  <div style={{ fontWeight: 600 }}>{c.name}{c.is_own && ' ⭐'}</div>
                  <div className="muted" style={{ fontSize: '.78rem' }}>{c.district || c.city}</div>
                  <div className="muted" style={{ fontSize: '.78rem', marginTop: '.3rem' }}>
                    {c.employee_count ?? '?'} MA · {euro(c.annual_revenue)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
