import { Fragment, useEffect, useState } from 'react';
import { api, euro } from '../lib/api.js';
import { toast } from '../components/Toast.jsx';

const TYPE_LABEL = {
  buero: 'Büro', wohnhaus: 'Wohnhaus', industrie: 'Industrie',
  handel: 'Handel', oeffentlich: 'Öffentlich', sonstige: 'Sonstige',
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState({});
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { api.get('/customers').then(setCustomers).catch((e) => setErr(e.message)); }, []);

  // Asynchroner Export als Hintergrund-Job (blockiert die UI nicht).
  async function exportBackground() {
    setExporting(true);
    try {
      const res = await fetch('/api/queue/export_customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const job = await res.json();
      toast.info('Export gestartet', 'Läuft im Hintergrund – du kannst weiterarbeiten.');
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const s = await api.get(`/queue/job/${job.id}`);
        if (s.status === 'fertig') { toast.success('Export fertig', `${s.result.count} Kunden exportiert (${s.result.file}).`); break; }
        if (s.status === 'fehler') { toast.error('Export fehlgeschlagen', s.error); break; }
      }
    } catch (e) { toast.error('Export fehlgeschlagen', e.message); }
    setExporting(false);
  }

  async function toggle(id) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!contracts[id]) {
      const rows = await api.get(`/customers/${id}/contracts`);
      setContracts((c) => ({ ...c, [id]: rows }));
    }
  }

  const filtered = customers.filter((c) =>
    `${c.name} ${c.address} ${c.district}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Kunden & Verträge</h1>
          <div className="muted">{customers.length} Objekte · Zeile anklicken für Verträge.</div>
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Suche nach Name, Adresse, Bezirk …" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <button onClick={exportBackground} disabled={exporting} title="Läuft asynchron im Hintergrund">
          {exporting ? 'Exportiere …' : '⬇ Export (Hintergrund)'}
        </button>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)' }}>{err}</div>}

      <div className="card" style={{ padding: '.2rem' }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Typ</th><th>Bezirk</th><th>Fläche</th><th>Eigentümer</th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <Fragment key={c.id}>
                <tr onClick={() => toggle(c.id)} style={{ cursor: 'pointer' }}>
                  <td><b>{c.name}</b><br /><span className="muted" style={{ fontSize: '.75rem' }}>{c.address}</span></td>
                  <td><span className="pill">{TYPE_LABEL[c.building_type]}</span></td>
                  <td>{c.district || '–'}</td>
                  <td>{c.area_sqm ? `${c.area_sqm} m²` : '–'}</td>
                  <td>{c.owner_name || '–'}</td>
                </tr>
                {open === c.id && (
                  <tr>
                    <td colSpan="5" style={{ background: 'var(--bg-elev2)' }}>
                      <b>Verträge</b>
                      {(contracts[c.id] || []).length === 0
                        ? <div className="muted">Keine Verträge erfasst.</div>
                        : (
                          <table>
                            <thead><tr><th>Titel</th><th>Status</th><th>Frequenz</th><th>Monatswert</th><th>€/m²</th><th>Ende</th></tr></thead>
                            <tbody>
                              {contracts[c.id].map((ct) => (
                                <tr key={ct.id}>
                                  <td>{ct.title}</td>
                                  <td><span className={`badge ${ct.status}`}>{ct.status}</span></td>
                                  <td>{ct.frequency || '–'}</td>
                                  <td>{euro(ct.value_monthly)}</td>
                                  <td>{ct.price_per_sqm ?? '–'}</td>
                                  <td>{ct.end_date?.slice(0, 10) || '–'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
