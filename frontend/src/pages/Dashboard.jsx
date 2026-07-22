import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { api, euro, downloadAuthed } from '../lib/api.js';

const LINZ = [48.30639, 14.28611];

const JOB_COLOR = { geplant: '#d29922', unterwegs: '#2f81f7', in_arbeit: '#3fb950', erledigt: '#8b97a7' };

export default function Dashboard() {
  const [map, setMap] = useState({ jobs: [], companies: [] });
  const [finance, setFinance] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [mrr, setMrr] = useState(null);
  const [err, setErr] = useState(null);
  const [tilesOffline, setTilesOffline] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/map'),
      api.get('/dashboard/finance'),
      api.get('/dashboard/expiring-contracts'),
    ])
      .then(([m, f, e]) => { setMap(m); setFinance(f); setExpiring(e); })
      .catch((e) => setErr(e.message));
    api.get('/dashboard/mrr-trend?months=18').then(setMrr).catch(() => {});
  }, []);

  const t = finance?.totals;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Linz-Dashboard <span className="muted" style={{ fontSize: '.9rem' }}>· Live-Operations</span></h1>
          <div className="muted">Morgan-Modus: dein Imperium auf einen Blick.</div>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--danger)' }}>Backend nicht erreichbar: {err}</div>}

      {/* KPI-Reihe */}
      <div className="cards" style={{ marginBottom: '1.2rem' }}>
        <Kpi label="Unternehmen im Imperium" value={t?.companies_owned ?? '–'} sub={`${t?.pipeline ?? 0} in Pipeline`} />
        <Kpi label="Jahresumsatz (konsolidiert)" value={euro(t?.revenue)} />
        <Kpi label="EBITDA" value={euro(t?.ebitda)}
             sub={t?.revenue > 0 ? `${Math.round((t.ebitda / t.revenue) * 100)}% Marge` : ''} />
        <Kpi label="Aktive Aufträge heute" value={map.jobs.filter((j) => j.status !== 'erledigt').length} />
      </div>

      {mrr && mrr.months.length > 0 && <MrrTrend data={mrr} />}

      <div className="row">
        {/* Karte */}
        <div style={{ flex: '2 1 520px' }}>
          <h3>Karte Linz</h3>
          <div className="map">
            {tilesOffline && (
              <div className="map-offline-note">
                🗺️ Kartenkacheln offline – Marker &amp; Standorte bleiben sichtbar.
              </div>
            )}
            <MapContainer center={LINZ} zoom={13} style={{ height: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                eventHandlers={{
                  tileerror: () => setTilesOffline(true),
                  tileload: () => setTilesOffline(false),
                }}
              />
              {map.jobs.map((j) => (
                <CircleMarker key={j.id} center={[j.lat, j.lng]} radius={9}
                  pathOptions={{ color: JOB_COLOR[j.status] || '#888', fillOpacity: 0.8 }}>
                  <Popup>
                    <b>{j.customer_name}</b><br />
                    {j.title} · {j.status}<br />
                    {j.employee_name || 'unbesetzt'}
                  </Popup>
                </CircleMarker>
              ))}
              {map.companies.filter((c) => !c.is_own).map((c) => (
                <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={7}
                  pathOptions={{ color: '#a371f7', fillOpacity: 0.5 }}>
                  <Popup><b>{c.name}</b><br />Übernahme-Ziel · {c.status}</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <div className="toolbar" style={{ marginTop: '.6rem' }}>
            <span className="pill">🟢 in Arbeit</span>
            <span className="pill">🟡 geplant</span>
            <span className="pill">🟣 Übernahme-Ziel</span>
          </div>
        </div>

        {/* Seitliche Panels */}
        <div style={{ flex: '1 1 300px' }}>
          <h3>📅 Kalender (Outlook/Exchange)</h3>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="muted" style={{ fontSize: '.82rem', marginBottom: '.6rem' }}>
              Reinigungstermine & Vertragsfristen als Kalender abonnieren oder importieren.
            </div>
            <div className="row">
              <a href="/api/calendar/jobs.ics"><button>Termine (.ics)</button></a>
              <a href="/api/calendar/contracts.ics"><button>Vertragsfristen (.ics)</button></a>
            </div>
            <div className="muted" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
              In Outlook: „Kalender hinzufügen → Aus dem Internet" mit der Feed-URL – aktualisiert sich automatisch.
            </div>
          </div>

          <h3>EBITDA-Explorer</h3>
          <div className="card" style={{ padding: '.4rem .2rem', marginBottom: '1rem' }}>
            <table>
              <thead><tr><th>Firma</th><th>EBITDA</th><th>Marge</th></tr></thead>
              <tbody>
                {(finance?.perCompany || []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{euro(c.ebitda)}</td>
                    <td>{c.ebitda_margin_pct != null ? `${c.ebitda_margin_pct}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Verträge laufen aus</h3>
          <div className="card" style={{ padding: '.4rem .2rem' }}>
            <table>
              <thead><tr><th>Kunde</th><th>Ende</th></tr></thead>
              <tbody>
                {expiring.length === 0 && <tr><td colSpan="2" className="muted">Keine in 90 Tagen</td></tr>}
                {expiring.map((c) => (
                  <tr key={c.id}>
                    <td>{c.customer_name}<br /><span className="muted" style={{ fontSize: '.75rem' }}>{c.title}</span></td>
                    <td>{c.end_date?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// MRR-Verlauf als schlichtes, abhängigkeitsfreies SVG-Balkendiagramm.
function MrrTrend({ data }) {
  const months = data.months;
  const max = Math.max(1, ...months.map((m) => m.mrr));
  const W = 900, H = 120, pad = 4;
  const bw = (W - pad * 2) / months.length;
  const yoy = data.yoy_growth_pct;
  const up = yoy != null && yoy >= 0;
  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📈 MRR-Entwicklung <span className="muted" style={{ fontSize: '.8rem' }}>· monatlich wiederkehrender Umsatz</span></span>
        <span style={{ display: 'flex', gap: '.6rem', alignItems: 'baseline' }}>
          <b style={{ fontSize: '1.1rem' }}>{euro(data.current_mrr)}</b>
          {yoy != null && (
            <span className={`badge ${up ? 'ok' : 'geplant'}`} title="Veränderung ggü. Vorjahr">
              {up ? '▲' : '▼'} {Math.abs(yoy)}% YoY
            </span>)}
          <button style={{ fontSize: '.72rem', padding: '.15rem .45rem' }}
            onClick={() => downloadAuthed('/dashboard/mrr-trend.csv?months=18', 'mrr-entwicklung.csv')}>⬇ CSV</button>
        </span>
      </h3>
      <div className="card" style={{ padding: '.8rem' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="120"
             role="img" aria-label="MRR-Verlauf der letzten Monate">
          {months.map((m, i) => {
            const h = (m.mrr / max) * (H - 20);
            const last = i === months.length - 1;
            return (
              <g key={m.month}>
                <rect x={pad + i * bw + 1} y={H - h - 14} width={bw - 2} height={h}
                      fill={last ? 'var(--accent)' : 'rgba(122,162,255,.45)'} rx="2">
                  <title>{m.month}: {euro(m.mrr)}</title>
                </rect>
              </g>
            );
          })}
          <text x={pad} y={H - 2} fontSize="11" fill="#8b97a7">{months[0].month}</text>
          <text x={W - pad} y={H - 2} fontSize="11" fill="#8b97a7" textAnchor="end">{months.at(-1).month}</text>
        </svg>
      </div>
    </div>
  );
}
