import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, euro, STATUS_LABELS } from '../lib/api.js';

const COLUMNS = ['ziel', 'due_diligence', 'verhandlung', 'vertrag', 'uebernommen', 'integriert'];

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [drag, setDrag] = useState(null);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  const load = () => api.get('/companies').then(setCompanies).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

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
          <div className="muted">Rockefeller-Modus: Übernahme-Pipeline per Drag & Drop steuern.</div>
        </div>
        <button className="primary" onClick={() => nav('/uebernahme')}>⚡ Neue Übernahme</button>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>{err}</div>}

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
                  draggable
                  onDragStart={() => setDrag(c)}
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
