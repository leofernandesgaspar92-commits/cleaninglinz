import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, euro, STATUS_LABELS, downloadAuthed } from '../lib/api.js';
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
            <span style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: '.75rem' }}>
                Annahmen: Kaufpreis ≈ {roi.assumptions.ask_multiple}× EBITDA (falls offen) ·
                Synergie {Math.round(roi.assumptions.synergy_rate * 100)}% vom Umsatz
              </span>
              <button style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                onClick={() => downloadAuthed('/dashboard/merger-roi.csv', 'uebernahme-roi.csv')}>⬇ CSV</button>
            </span>
          </h3>
          <div className="card" style={{ padding: '.2rem', overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Score</th><th>Ziel</th><th>Status</th><th>EBITDA</th><th>Kaufpreis</th>
                  <th>ROI + Synergie</th><th>Amortisation</th><th>DD-Reife</th>
                </tr>
              </thead>
              <tbody>
                {roi.targets.map((t) => (
                  <tr key={t.id}>
                    <td title={`ROI ${t.score_parts.roi} · DD ${t.score_parts.dd} · Pipeline ${t.score_parts.stage} (Gewichte 50/30/20)`}>
                      <b style={{ fontSize: '1.05rem', color: 'var(--accent)' }}>{t.score}</b>
                      {t.recommended && <span className="badge ok" style={{ marginLeft: '.3rem' }}>🎯 Empfehlung</span>}
                    </td>
                    <td><b>{t.name}</b></td>
                    <td><span className="badge">{STATUS_LABELS[t.status] || t.status}</span></td>
                    <td>{euro(t.ebitda)}</td>
                    <td>{euro(t.price)}{t.price_estimated && <span className="muted" title="geschätzt aus EBITDA-Multiple"> *</span>}</td>
                    <td>{t.roi_with_synergy_pct}%</td>
                    <td>{t.payback_with_synergy_years} J.</td>
                    <td>
                      {t.dd_total === 0 ? <span className="muted">–</span> : (
                        <span title={`${t.dd_ok} ok · ${t.dd_offen} offen · ${t.dd_risiko} Risiko`}>
                          {t.dd_ready_pct}%{' '}
                          {t.dd_risk
                            ? <span className="badge geplant">⚠ {t.dd_risiko} Risiko</span>
                            : (t.dd_offen > 0 ? <span className="badge">{t.dd_offen} offen</span>
                              : <span className="badge ok">bereit</span>)}
                        </span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>
            * Kaufpreis geschätzt (kein Angebot hinterlegt). Sortiert nach Übernahme-Score
            (ROI 50 % · DD-Reife 30 % · Pipeline-Stufe 20 %).
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
