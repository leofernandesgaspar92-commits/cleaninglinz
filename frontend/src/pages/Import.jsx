import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const ENTITIES = {
  customers: { label: 'Kunden', cols: 'name, adresse, plz, bezirk, typ, flaeche, kontakt, email, telefon, eigentuemer' },
  employees: { label: 'Mitarbeiter', cols: 'vorname, nachname, rolle, email, telefon, eintritt, stundenlohn, qualifikationen' },
};

export default function Import() {
  const [params] = useSearchParams();
  const [entity, setEntity] = useState(params.get('entity') || 'customers');
  const [companyId, setCompanyId] = useState(params.get('company') || '');
  const [companies, setCompanies] = useState([]);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { api.get('/companies').then(setCompanies).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (companyId) fd.append('company_id', companyId);
      setResult(await api.upload(`/import/${entity}`, fd));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const cfg = ENTITIES[entity];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Daten-Import</h1>
          <div className="muted">Leco-Integration-Tool: CSV der übernommenen Firma mit einem Klick einspielen.</div>
        </div>
      </div>

      <form className="card" onSubmit={submit} style={{ maxWidth: 620 }}>
        <div className="grid" style={{ gap: '1rem' }}>
          <label>
            <div className="muted" style={{ marginBottom: '.3rem' }}>Datentyp</div>
            <select value={entity} onChange={(e) => { setEntity(e.target.value); setResult(null); }}>
              {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>

          <label>
            <div className="muted" style={{ marginBottom: '.3rem' }}>Zuordnen zu Unternehmen (Herkunft der Übernahme)</div>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">– keine Zuordnung –</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <label>
            <div className="muted" style={{ marginBottom: '.3rem' }}>CSV-Datei</div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0])} />
          </label>

          <div className="pill" style={{ lineHeight: 1.5 }}>
            Erkannte Spalten (DE/EN, Trennzeichen , oder ;):<br /><code>{cfg.cols}</code>
          </div>

          <button className="primary" disabled={busy || !file}>{busy ? 'Importiere …' : '📥 Import starten'}</button>
        </div>
      </form>

      {err && <div className="card" style={{ borderColor: 'var(--danger)', marginTop: '1rem' }}>{err}</div>}

      {result && (
        <div className="card" style={{ marginTop: '1rem', maxWidth: 620 }}>
          <h3>Ergebnis</h3>
          <div className="row">
            <span className="badge ok">✓ {result.inserted} importiert</span>
            {result.duplicates > 0 && <span className="badge laeuft_aus">⚠ {result.duplicates} Duplikate übersprungen</span>}
            {result.skipped > 0 && <span className="badge gekuendigt">✗ {result.skipped} fehlerhaft</span>}
          </div>
          {result.errors?.length > 0 && (
            <ul className="muted" style={{ fontSize: '.8rem', marginTop: '.6rem' }}>
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
