// ============================================================================
//  KI-Vertragsanalyse – extrahiert strukturierte Felder aus Vertragstext.
//   - LIVE (ANTHROPIC_API_KEY): Claude (claude-opus-4-8) mit Structured Output.
//   - SIM  (ohne Key): deterministische Heuristik/Regex – läuft sofort.
//  Felder: Vertragspartner, Laufzeit, Kündigungsfrist, Auto-Verlängerung,
//          Frequenz, Monats-/Jahreswert, Preis/m², besondere Klauseln.
// ============================================================================

export function isLive() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vertragspartner: { type: 'string' },
    laufzeit_start: { type: 'string' },
    laufzeit_ende: { type: 'string' },
    kuendigungsfrist: { type: 'string' },
    auto_verlaengerung: { type: 'boolean' },
    frequenz: { type: 'string' },
    monatswert_eur: { type: 'number' },
    preis_pro_qm_eur: { type: 'number' },
    besondere_klauseln: { type: 'array', items: { type: 'string' } },
    zusammenfassung: { type: 'string' },
  },
  required: ['kuendigungsfrist', 'auto_verlaengerung', 'frequenz', 'zusammenfassung'],
};

export async function analyzeContract(text) {
  return isLive() ? analyzeLive(text) : analyzeSim(text);
}

// ---------------------------------------------------------------------------
async function analyzeLive(text) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system: 'Du bist Vertragsanalyst für Reinigungsverträge. Extrahiere die Felder exakt '
      + 'aus dem Text. Unbekannte Zahlenfelder als 0, unbekannte Texte als "". Antworte nur im Schema.',
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text.slice(0, 20000) }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return { mode: 'live', ...JSON.parse(block.text) };
}

// ---------------------------------------------------------------------------
function analyzeSim(text) {
  const t = text.replace(/\s+/g, ' ');
  const num = (s) => s ? Number(s.replace(/\./g, '').replace(',', '.')) : 0;
  // Umlaut-tolerant: akzeptiert Umlaut, ASCII-Vokal und Digraph (ä|ae|a etc.).
  const AE = '(?:ä|ae|a)', OE = '(?:ö|oe|o)', UE = '(?:ü|ue|u)';
  const rx = (src, flags = 'i') => new RegExp(src, flags);

  // Kündigungsfrist
  const kf = t.match(rx(`K${UE}ndigungsfrist[^.\\n]{0,40}?(\\d+\\s*(?:Monate?|Wochen?|Tage?))`))
    || t.match(/(\d+\s*(?:Monate?|Wochen?))\s*(?:zum|vor|zur)/i);
  // Auto-Verlängerung
  const auto = rx(`verl${AE}ngert sich[^.]*?(automatisch|stillschweigend)`).test(t)
    || rx(`automatische?\\s+Verl${AE}ngerung`).test(t);
  // Frequenz – priorisiert (spezifisch vor allgemein)
  const freqRules = [
    [rx(`2x\\s*w${OE}chentlich`), '2x wöchentlich'],
    [rx(`w${OE}chentlich`), 'wöchentlich'],
    [rx(`14-?t${AE}gig`), '14-tägig'],
    [rx(`t${AE}glich`), 'täglich'],
    [/monatlich/i, 'monatlich'],
  ];
  const freq = (freqRules.find(([re]) => re.test(t)) || [null, 'unbekannt'])[1];
  // Monatswert
  const mw = t.match(/(?:€|EUR)\s*([\d.]+,\d{2}|\d[\d.]*)\s*(?:pro Monat|monatlich|\/\s*Monat|mtl)/i)
    || t.match(/(?:monatlich|pro Monat|mtl\.?)[^\d€]{0,15}(?:€|EUR)?\s*([\d.]+,\d{2}|\d[\d.]*)/i);
  // Preis pro m²
  const qm = t.match(/([\d.]+,\d{2}|\d[\d.,]*)\s*(?:€|EUR)\s*(?:\/|pro)\s*m²/i);
  // Datumsangaben (erste zwei)
  const dates = t.match(/\d{1,2}\.\d{1,2}\.\d{2,4}/g) || [];
  // Vertragspartner (nach "zwischen ... und" grob)
  const partner = (t.match(/zwischen\s+(.+?)\s+und\s+/i) || [])[1] || '';

  // Besondere Klauseln (Schlagwörter)
  const klauseln = [];
  if (rx(`Schl${UE}ssel`).test(t)) klauseln.push('Schlüsselverwaltung geregelt');
  if (/Haftung/i.test(t)) klauseln.push('Haftungsklausel vorhanden');
  if (/Sonderreinigung|Grundreinigung/i.test(t)) klauseln.push('Sonder-/Grundreinigung erwähnt');
  if (/Preisanpassung|Indexierung|Wertsicherung/i.test(t)) klauseln.push('Preisanpassung/Wertsicherung');

  return {
    mode: 'sim',
    vertragspartner: partner.slice(0, 120),
    laufzeit_start: dates[0] || '',
    laufzeit_ende: dates[1] || '',
    kuendigungsfrist: kf ? kf[1].replace(/\s+/g, ' ') : 'nicht gefunden',
    auto_verlaengerung: auto,
    frequenz: freq,
    monatswert_eur: mw ? num(mw[1]) : 0,
    preis_pro_qm_eur: qm ? num(qm[1]) : 0,
    besondere_klauseln: klauseln,
    zusammenfassung: `Automatisch extrahiert (Simulation): Frequenz ${freq}, `
      + `Kündigungsfrist ${kf ? kf[1] : 'unklar'}${auto ? ', automatische Verlängerung' : ''}. `
      + `Für tiefere KI-Analyse ANTHROPIC_API_KEY setzen.`,
  };
}
