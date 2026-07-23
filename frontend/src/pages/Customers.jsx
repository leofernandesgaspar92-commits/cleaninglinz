import { Fragment, useEffect, useState } from 'react';
import { api, euro, downloadAuthed } from '../lib/api.js';
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
  const [conc, setConc] = useState(null);

  useEffect(() => { api.get('/customers').then(setCustomers).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { api.get('/dashboard/customer-concentration').then(setConc).catch(() => {}); }, []);

  // Asynchroner Export als Hintergrund-Job (blockiert die UI nicht).
  async function exportBackground() {
    setExporting(true);
    try {
      const job = await api.post('/queue/export_customers', {}); // authentifiziert (Bearer-Token)
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

      {conc && conc.customers.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📊 Umsatzkonzentration <span className="muted" style={{ fontSize: '.8rem' }}>· Klumpenrisiko</span></span>
            <span style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <span className={`badge ${conc.risk === 'hoch' ? 'geplant' : conc.risk === 'mittel' ? '' : 'ok'}`}
                title={`Größter Kunde ${conc.top_share_pct}% · HHI ${conc.hhi}`}>
                Risiko: {conc.risk} ({conc.top_share_pct}% Top-Kunde)
              </span>
              <button style={{ fontSize: '.75rem', padding: '.2rem .5rem' }}
                onClick={() => downloadAuthed('/dashboard/customer-concentration.csv', 'kundenkonzentration.csv')}>⬇ CSV</button>
            </span>
          </h3>
          <div className="card" style={{ padding: '.6rem .8rem' }}>
            {conc.customers.slice(0, 6).map((c) => (
              <div key={c.id} style={{ marginBottom: '.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
                  <span>{c.name} <span className="muted">· {euro(c.monthly_value)}/Mon</span></span>
                  <b>{c.share_pct}%</b>
                </div>
                <div style={{ height: 8, background: 'rgba(122,162,255,.15)', borderRadius: 4 }}>
                  <div style={{ width: `${c.share_pct}%`, height: '100%', borderRadius: 4,
                    background: c.share_pct > 40 ? 'var(--warning)' : 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                                  <td>
                                    {ct.end_date?.slice(0, 10) || '–'}
                                    {ct.end_date && <a href={`/api/calendar/contract/${ct.id}.ics`} title="Frist in Kalender" style={{ marginLeft: 6 }}>📅</a>}
                                  </td>
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
