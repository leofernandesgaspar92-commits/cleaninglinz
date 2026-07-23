import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { canWrite } from '../lib/auth.js';
import { toast } from '../components/Toast.jsx';

const STATUS = ['geplant', 'unterwegs', 'in_arbeit', 'erledigt', 'abgebrochen'];
const STATUS_LABEL = {
  geplant: 'geplant', unterwegs: 'unterwegs', in_arbeit: 'in Arbeit',
  erledigt: 'erledigt', abgebrochen: 'abgebrochen',
};

const fmt = (ts) => {
  if (!ts) return '–';
  const d = new Date(ts);
  return d.toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [err, setErr] = useState(null);
  const writable = canWrite();

  const load = useCallback(() => {
    api.get('/dashboard/jobs').then(setJobs).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api.get('/employees').then((e) => setEmployees(e.filter((x) => x.status === 'aktiv'))).catch(() => {});
  }, [load]);

  async function patch(id, body, okMsg) {
    // optimistisch aktualisieren
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...body } : j)));
    try { await api.patch(`/jobs/${id}`, body); if (okMsg) toast.success('Aktualisiert', okMsg); load(); }
    catch (e) { toast.error('Nicht gespeichert', e.message); load(); }
  }

  const open = jobs.filter((j) => j.status !== 'erledigt');
  const done = jobs.filter((j) => j.status === 'erledigt');
  const unassigned = open.filter((j) => !j.employee_id).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Einsatzplanung</h1>
          <div className="muted">
            {open.length} offen · {done.length} erledigt
            {unassigned > 0 && <> · <b style={{ color: 'var(--warning)' }}>{unassigned} unbesetzt</b></>}
            {!writable && ' · Nur-Lese-Ansicht (Zuweisung ab Rolle „Manager")'}
          </div>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)' }}>{err}</div>}

      <div className="card" style={{ padding: '.2rem' }}>
        <table>
          <thead>
            <tr><th>Termin</th><th>Kunde</th><th>Auftrag</th><th>Mitarbeiter</th><th>Status</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} style={{ opacity: j.status === 'erledigt' ? 0.6 : 1 }}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmt(j.scheduled_at)}</td>
                <td><b>{j.customer_name}</b><br /><span className="muted" style={{ fontSize: '.75rem' }}>{j.district || ''}</span></td>
                <td>{j.title || '–'}</td>
                <td>
                  {writable ? (
                    <select value={j.employee_id || ''} onChange={(e) => patch(j.id, { employee_id: e.target.value || null }, 'Zuweisung gespeichert')}
                      style={{ maxWidth: 180, borderColor: j.employee_id ? undefined : 'var(--warning)' }}>
                      <option value="">— unbesetzt —</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                    </select>
                  ) : (j.employee_name || <span className="badge geplant">unbesetzt</span>)}
                </td>
                <td>
                  {writable ? (
                    <select value={j.status} onChange={(e) => patch(j.id, { status: e.target.value }, 'Status gespeichert')} style={{ maxWidth: 150 }}>
                      {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  ) : <span className={`badge ${j.status}`}>{STATUS_LABEL[j.status]}</span>}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan="5" className="muted">Keine Einsätze.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
