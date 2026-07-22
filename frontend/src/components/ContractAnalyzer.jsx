import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { toast } from './Toast.jsx';

// KI-Vertragsanalyse für die Merger-Integration: Text einfügen → Felder extrahieren
// → als Vertrag beim Kunden übernehmen.
export default function ContractAnalyzer({ companyId }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    api.get('/customers').then((all) =>
      setCustomers(all.filter((c) => c.company_id === companyId || c.source_company_id === companyId)))
      .catch(() => {});
  }, [companyId]);

  async function analyze() {
    setBusy(true); setResult(null);
    try {
      const r = await api.post('/contract-ai/analyze', { text });
      setResult(r);
      toast.success('Analyse fertig', `Vertrag extrahiert (${r.mode === 'live' ? 'KI' : 'Heuristik'}).`);
    } catch (e) {
      toast.error('Analyse fehlgeschlagen', e.message, 'Mindestens 20 Zeichen Vertragstext einfügen.');
    }
    setBusy(false);
  }

  async function createContract() {
    if (!customerId) return toast.info('Kunde wählen', 'Bitte einen Kunden für den Vertrag auswählen.');
    try {
      const c = await api.post('/contract-ai/create-contract', {
        customer_id: customerId, fields: result,
        title: `KI: ${result.vertragspartner || 'Vertrag'}`,
      });
      const body = await c.json?.() ?? c;
      toast.success('Vertrag angelegt', `${body.title || 'Vertrag'} beim Kunden gespeichert.`);
    } catch (e) { toast.error('Anlegen fehlgeschlagen', e.message); }
  }

  const F = ({ label, value }) => (
    <div><div className="muted" style={{ fontSize: '.72rem' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value ?? '–'}</div></div>
  );

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>🔍 KI-Vertragsanalyse</h3>
      <div className="muted" style={{ marginBottom: '.6rem', fontSize: '.85rem' }}>
        Vertragstext der übernommenen Firma einfügen – Kündigungsfrist, Preise, Laufzeit & Klauseln werden automatisch extrahiert.
      </div>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Vertragstext hier einfügen …" style={{ resize: 'vertical' }} />
      <div className="row" style={{ marginTop: '.6rem' }}>
        <button className="primary" onClick={analyze} disabled={busy || text.length < 20}>
          {busy ? 'Analysiere …' : 'Analysieren'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))' }}>
            <F label="Vertragspartner" value={result.vertragspartner} />
            <F label="Laufzeit" value={`${result.laufzeit_start || '?'} – ${result.laufzeit_ende || '?'}`} />
            <F label="Kündigungsfrist" value={result.kuendigungsfrist} />
            <F label="Auto-Verlängerung" value={result.auto_verlaengerung ? 'ja' : 'nein'} />
            <F label="Frequenz" value={result.frequenz} />
            <F label="Monatswert" value={result.monatswert_eur ? `${result.monatswert_eur} €` : '–'} />
            <F label="Preis / m²" value={result.preis_pro_qm_eur ? `${result.preis_pro_qm_eur} €` : '–'} />
          </div>
          {result.besondere_klauseln?.length > 0 && (
            <div style={{ marginTop: '.6rem' }}>
              {result.besondere_klauseln.map((k) => <span key={k} className="pill" style={{ marginRight: 5 }}>{k}</span>)}
            </div>
          )}
          <div className="muted" style={{ fontSize: '.82rem', marginTop: '.6rem' }}>{result.zusammenfassung}</div>

          <div className="row" style={{ marginTop: '.8rem', alignItems: 'center' }}>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">– Kunde für Vertrag wählen –</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={createContract} disabled={!result}>Als Vertrag übernehmen</button>
          </div>
        </div>
      )}
    </div>
  );
}
