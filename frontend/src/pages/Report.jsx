import { useEffect, useState } from 'react';
import { api, euro } from '../lib/api.js';

// Executive Summary / Geschäftsbericht – bündelt die Kern-Analytik auf einer
// druckbaren Seite (Board-tauglich). Nutzt vorhandene Endpunkte, kein neues Backend.
export default function Report() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/finance'),
      api.get('/dashboard/mrr-trend?months=18'),
      api.get('/dashboard/merger-roi'),
      api.get('/dashboard/customer-concentration'),
      api.get('/dashboard/workload'),
    ]).then(([finance, mrr, roi, conc, work]) => setD({ finance, mrr, roi, conc, work }))
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="card" style={{ borderColor: 'var(--danger)' }}>{err}</div>;
  if (!d) return <div className="muted">Lade Bericht …</div>;

  const t = d.finance.totals;
  const rec = d.roi.targets.find((x) => x.recommended) || d.roi.targets[0];
  const yoy = d.mrr.yoy_growth_pct;
  const today = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="report">
      <div className="page-head no-print" style={{ justifyContent: 'space-between' }}>
        <div><h1>Geschäftsbericht</h1><div className="muted">Executive Summary · Stand {today}</div></div>
        <button className="primary" onClick={() => window.print()}>🖨 Drucken / PDF</button>
      </div>

      <div className="report-sheet">
        <div className="report-title print-only">
          <h1>Leco – Geschäftsbericht</h1>
          <div className="muted">Reinigungs-Imperium Linz · Stand {today}</div>
        </div>

        {/* Kennzahlen */}
        <h3>Kennzahlen</h3>
        <div className="cards" style={{ marginBottom: '1rem' }}>
          <Kpi label="Unternehmen im Imperium" value={t.companies_owned} sub={`${t.pipeline} in Pipeline`} />
          <Kpi label="Jahresumsatz (konsolidiert)" value={euro(t.revenue)} />
          <Kpi label="EBITDA" value={euro(t.ebitda)}
            sub={t.revenue > 0 ? `${Math.round((t.ebitda / t.revenue) * 100)}% Marge` : ''} />
          <Kpi label="MRR (aktuell)" value={euro(d.mrr.current_mrr)}
            sub={yoy != null ? `${yoy >= 0 ? '▲' : '▼'} ${Math.abs(yoy)}% ggü. Vorjahr` : ''} />
        </div>

        <div className="row" style={{ gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Übernahme-Empfehlung */}
          <div style={{ flex: '1 1 320px' }}>
            <h3>🎯 Übernahme-Empfehlung</h3>
            {rec ? (
              <div className="card">
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{rec.name}</div>
                <div className="muted" style={{ marginBottom: '.5rem' }}>Score {rec.score} · Status {rec.status}</div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
                  <li>ROI inkl. Synergien: <b>{rec.roi_with_synergy_pct}%</b> (Amortisation {rec.payback_with_synergy_years} J.)</li>
                  <li>Kaufpreis: {euro(rec.price)}{rec.price_estimated ? ' (geschätzt)' : ''}</li>
                  <li>Due-Diligence: {rec.dd_total ? `${rec.dd_ready_pct}% reif${rec.dd_risiko ? `, ${rec.dd_risiko} Risiko` : ''}` : 'noch nicht geprüft'}</li>
                </ul>
              </div>
            ) : <div className="muted">Keine Ziele in der Pipeline.</div>}
          </div>

          {/* Risiko & Team */}
          <div style={{ flex: '1 1 320px' }}>
            <h3>⚠ Risiken & Betrieb</h3>
            <div className="card" style={{ lineHeight: 1.9 }}>
              <div>Umsatzkonzentration: <b>{d.conc.risk}</b>
                {d.conc.top_customer && <> — größter Kunde {d.conc.top_customer} ({d.conc.top_share_pct}%)</>}</div>
              <div>Auslaufende Verträge werden proaktiv überwacht (Vertrags-Watch).</div>
              <div>Team: {d.work.totals.active_employees} aktive Mitarbeiter · Ø {d.work.totals.avg_open_per_employee} offene Einsätze/Person
                {d.work.unassigned_open > 0 && <> · <b>{d.work.unassigned_open} unbesetzt</b></>}</div>
            </div>
          </div>
        </div>

        <div className="muted print-only" style={{ marginTop: '1.5rem', fontSize: '.72rem' }}>
          Automatisch erzeugt von Leco Enterprise · vertraulich
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
