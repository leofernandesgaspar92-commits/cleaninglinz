import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, euro } from '../lib/api.js';

const DD_STATUS = ['offen', 'ok', 'risiko', 'n_a'];

export default function Merger() {
  const { companyId } = useParams();
  const nav = useNavigate();
  const [targets, setTargets] = useState([]);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(1);
  const [err, setErr] = useState(null);

  // Ohne companyId: Zielauswahl anzeigen
  useEffect(() => {
    if (!companyId) {
      api.get('/companies')
        .then((cs) => setTargets(cs.filter((c) => !c.is_own && c.status !== 'integriert')))
        .catch((e) => setErr(e.message));
    }
  }, [companyId]);

  const load = () => api.get(`/acquisitions/by-company/${companyId}`)
    .then((d) => { setData(d); setActive(d.acquisition.current_step); })
    .catch((e) => setErr(e.message));

  useEffect(() => { if (companyId) load(); }, [companyId]);

  async function setStep(step, status) {
    await api.patch(`/acquisitions/steps/${step.id}`, { status });
    load();
  }
  async function setDD(item, status) {
    await api.patch(`/acquisitions/dd/${item.id}`, { status });
    load();
  }

  if (!companyId) {
    return (
      <div>
        <div className="page-head"><h1>Neue Übernahme starten</h1></div>
        <div className="muted" style={{ marginBottom: '1rem' }}>Ziel-Unternehmen auswählen:</div>
        <div className="cards">
          {targets.map((c) => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/uebernahme/${c.id}`)}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{c.name}</div>
              <div className="muted">{c.district || c.city} · {c.employee_count ?? '?'} MA</div>
              <div style={{ marginTop: '.5rem' }}><span className={`badge ${c.status}`}>{c.status}</span></div>
              <div className="muted" style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                Umsatz {euro(c.annual_revenue)} · EBITDA {euro(c.ebitda)}
              </div>
            </div>
          ))}
        </div>
        {err && <div className="card" style={{ borderColor: 'var(--danger)', marginTop: '1rem' }}>{err}</div>}
      </div>
    );
  }

  if (!data) return <div className="muted">Lädt …{err && ` – ${err}`}</div>;

  const { company, steps, dueDiligence } = data;
  const done = steps.filter((s) => s.status === 'erledigt').length;
  const pct = Math.round((done / steps.length) * 100);
  const current = steps.find((s) => s.step_number === active);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Übernahme: {company.name}</h1>
          <div className="muted">{company.district || company.city} · {company.employee_count ?? '?'} Mitarbeiter · {euro(company.annual_revenue)} Umsatz</div>
        </div>
        <button onClick={() => nav('/unternehmen')}>← Zurück zum Tracker</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="muted" style={{ marginTop: '.3rem' }}>{done}/{steps.length} Schritte · {pct}% integriert</div>
      </div>

      {/* Stepper */}
      <div className="stepper">
        {steps.map((s) => (
          <div key={s.id}
            className={`step ${s.status === 'erledigt' ? 'done' : ''} ${s.step_number === active ? 'current' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setActive(s.step_number)}>
            <div className="n">Schritt {s.step_number} {s.status === 'erledigt' ? '✓' : ''}</div>
            <div className="t">{s.title}</div>
          </div>
        ))}
      </div>

      {/* Aktiver Schritt */}
      <div className="card">
        <div className="page-head" style={{ marginBottom: '.8rem' }}>
          <h2 style={{ fontSize: '1.15rem' }}>{current.title}</h2>
          <div className="row">
            <button onClick={() => setStep(current, 'in_arbeit')}>In Arbeit</button>
            <button className="primary" onClick={() => setStep(current, 'erledigt')}>✓ Erledigt</button>
          </div>
        </div>

        <StepBody stepKey={current.step_key} data={data} onDD={setDD} nav={nav} />
      </div>
    </div>
  );
}

function StepBody({ stepKey, data, onDD, nav }) {
  const { company, dueDiligence } = data;

  if (stepKey === 'due_diligence') {
    const linz = dueDiligence.filter((d) => d.is_linz_specific);
    const rest = dueDiligence.filter((d) => !d.is_linz_specific);
    return (
      <div>
        <p className="muted">Prüfe die Übernahme systematisch. Linz-spezifische Punkte sind hervorgehoben.</p>
        <DDGroup title="🟣 Linz-spezifisch" items={linz} onDD={onDD} />
        <DDGroup title="Allgemein" items={rest} onDD={onDD} />
      </div>
    );
  }

  if (stepKey === 'mitarbeiter' || stepKey === 'kunden') {
    const entity = stepKey === 'mitarbeiter' ? 'employees' : 'customers';
    return (
      <div>
        <p className="muted">
          Importiere {stepKey === 'mitarbeiter' ? 'die Mitarbeiterliste' : 'die Kundenverträge'} aus
          Excel/CSV der übernommenen Firma. Sie werden automatisch {company.name} zugeordnet.
        </p>
        <button className="primary" onClick={() => nav(`/import?entity=${entity}&company=${company.id}`)}>
          📥 {stepKey === 'mitarbeiter' ? 'Mitarbeiter' : 'Kunden'} importieren
        </button>
      </div>
    );
  }

  if (stepKey === 'finanzen') {
    return (
      <div>
        <p className="muted">Konsolidiere die Buchhaltung. Kennzahlen aus der Due Diligence:</p>
        <div className="cards">
          <div className="card kpi"><div className="label">Jahresumsatz</div><div className="value">{euro(company.annual_revenue)}</div></div>
          <div className="card kpi"><div className="label">EBITDA</div><div className="value">{euro(company.ebitda)}</div></div>
          <div className="card kpi"><div className="label">Kaufpreis</div><div className="value">{euro(company.purchase_price)}</div></div>
          <div className="card kpi">
            <div className="label">Multiple</div>
            <div className="value">{company.ebitda > 0 ? (company.purchase_price / company.ebitda).toFixed(1) + 'x' : '–'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (stepKey === 'marke') {
    return (
      <div>
        <p className="muted">Strategische Entscheidung: Marke {company.name} behalten oder ins Leco-Imperium umbenennen?</p>
        <div className="row">
          <button onClick={() => api.patch(`/companies/${company.id}`, { brand_decision: 'behalten' }).then(() => location.reload())}>Marke behalten</button>
          <button onClick={() => api.patch(`/companies/${company.id}`, { brand_decision: 'umbenennen', status: 'integriert' }).then(() => location.reload())} className="primary">In Leco umbenennen & integrieren</button>
        </div>
        <div className="muted" style={{ marginTop: '.6rem' }}>Aktuell: {company.brand_decision}</div>
      </div>
    );
  }

  // ziel
  return (
    <div>
      <p className="muted">Ziel identifiziert. Stammdaten:</p>
      <table>
        <tbody>
          <tr><th>Firma</th><td>{company.legal_name || company.name}</td></tr>
          <tr><th>Inhaber</th><td>{company.owner_name || '–'}</td></tr>
          <tr><th>Kontakt</th><td>{company.contact_email || '–'} {company.contact_phone || ''}</td></tr>
          <tr><th>Standort</th><td>{company.address}, {company.postal_code} {company.city}</td></tr>
          <tr><th>Notizen</th><td>{company.notes || '–'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function DDGroup({ title, items, onDD }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: '1rem' }}>
      <h3 style={{ fontSize: '.9rem' }}>{title}</h3>
      <table>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td>{d.label}</td>
              <td style={{ width: 160 }}>
                <select value={d.status} onChange={(e) => onDD(d, e.target.value)}>
                  {DD_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
