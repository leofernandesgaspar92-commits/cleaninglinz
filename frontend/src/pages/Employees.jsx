import { useEffect, useState } from 'react';
import { api, euro } from '../lib/api.js';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => { api.get('/employees').then(setEmployees).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { api.get('/dashboard/workload').then(setWorkload).catch(() => {}); }, []);

  const asArr = (v) => (Array.isArray(v) ? v : []);
  const filtered = employees.filter((e) =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Mitarbeiter</h1>
          <div className="muted">{employees.length} Personen · inkl. Linz-Skill-Matrix (welche Gebäude wer kennt).</div>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Suche …" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)' }}>{err}</div>}

      {workload && (
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📊 Team-Auslastung</span>
            <span style={{ display: 'flex', gap: '.4rem' }}>
              <span className="pill">Ø {workload.totals.avg_open_per_employee} offen/Person</span>
              {workload.unassigned_open > 0 && (
                <span className="badge geplant" title="Offene Jobs ohne zugewiesene Person">
                  ⚠ {workload.unassigned_open} unbesetzt
                </span>)}
              {workload.totals.underutilized > 0 && (
                <span className="badge ziel" title="Aktive Mitarbeiter ohne offene Jobs">
                  {workload.totals.underutilized} unterausgelastet
                </span>)}
            </span>
          </h3>
          <div className="cards">
            {workload.employees.map((e) => (
              <div key={e.id} className="card"
                style={{ borderColor: e.underutilized ? 'var(--warn)' : undefined }}>
                <div style={{ fontWeight: 600 }}>{e.first_name} {e.last_name}</div>
                <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.4rem' }}>{e.role}</div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div><b style={{ fontSize: '1.3rem' }}>{e.open_jobs}</b><br /><span className="muted" style={{ fontSize: '.72rem' }}>offen</span></div>
                  <div><b style={{ fontSize: '1.3rem' }}>{e.done_jobs}</b><br /><span className="muted" style={{ fontSize: '.72rem' }}>erledigt</span></div>
                </div>
                {e.underutilized && <div className="muted" style={{ fontSize: '.72rem', marginTop: '.3rem' }}>frei für neue Aufträge</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '.2rem' }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Rolle</th><th>Status</th><th>Qualifikationen</th><th>Kennt Gebäude</th><th>Stundenlohn</th></tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td><b>{e.first_name} {e.last_name}</b><br /><span className="muted" style={{ fontSize: '.75rem' }}>{e.phone}</span></td>
                <td>{e.role}</td>
                <td><span className={`badge ${e.status}`}>{e.status}</span></td>
                <td>{asArr(e.qualifications).map((q) => <span key={q} className="pill" style={{ marginRight: 4 }}>{q}</span>)}</td>
                <td>{asArr(e.known_buildings).map((b) => <span key={b} className="pill" style={{ marginRight: 4 }}>🏢 {b}</span>)}</td>
                <td>{euro(e.hourly_wage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
