import { useEffect, useState } from 'react';
import { api, euro } from '../lib/api.js';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => { api.get('/employees').then(setEmployees).catch((e) => setErr(e.message)); }, []);

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
