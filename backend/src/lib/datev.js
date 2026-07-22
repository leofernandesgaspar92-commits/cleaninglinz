// ============================================================================
//  DATEV-Export – Buchungsstapel im EXTF-Format (Kernfelder).
//  Erzeugt: (1) Metadaten-Kopfzeile, (2) Spaltenüberschriften, (3) Buchungen.
//  Nach DATEV importierbar, sobald Berater-/Mandantennummer und Konten
//  (Kontenrahmen SKR03/04) konfiguriert sind.
// ============================================================================

const pad = (n, len) => String(n).padStart(len, '0');
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}${pad(x.getMonth() + 1, 2)}${pad(x.getDate(), 2)}`; };
const ddmm = (d) => { const x = new Date(d); return `${pad(x.getDate(), 2)}${pad(x.getMonth() + 1, 2)}`; };
// Betrag im DATEV-Format: Komma als Dezimaltrenner, 2 Stellen, kein Tausenderpunkt.
const betrag = (n) => Number(n || 0).toFixed(2).replace('.', ',');
const q = (s) => `"${String(s ?? '').replace(/"/g, '""').slice(0, 60)}"`;

// Kernspalten des Buchungsstapels (Reihenfolge = Datenspalten).
const COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Konto',
  'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Buchungstext',
];

// meta: { berater, mandant, wjBeginn, from, to, bezeichnung }
// bookings: [{ umsatz, shKz:'S'|'H', konto, gegenkonto, buSchluessel?, belegdatum, belegfeld1, buchungstext }]
export function buildBuchungsstapel(meta, bookings) {
  const now = new Date();
  const erzeugt = `${ymd(now)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}000`;

  // (1) EXTF-Metadaten-Kopfzeile (Buchungsstapel, Format 700 / Version 13).
  const header = [
    '"EXTF"', 700, 21, '"Buchungsstapel"', 13, erzeugt, '', '"RE"', '"Leco"', '',
    meta.berater, meta.mandant, ymd(meta.wjBeginn), 4, ymd(meta.from), ymd(meta.to),
    q(meta.bezeichnung || 'Leco Buchungen'), '', 1, 0, 0, '"EUR"', '', '', '', '', '', 0, '', '', '',
  ].join(';');

  // (2) Spaltenüberschriften
  const cols = COLUMNS.map((c) => `"${c}"`).join(';');

  // (3) Buchungszeilen
  const rows = bookings.map((b) => [
    betrag(b.umsatz), `"${b.shKz || 'S'}"`, '"EUR"', b.konto, b.gegenkonto,
    b.buSchluessel || '', ddmm(b.belegdatum), q(b.belegfeld1), q(b.buchungstext),
  ].join(';'));

  // DATEV erwartet Windows-Zeilenenden (CRLF).
  return [header, cols, ...rows].join('\r\n') + '\r\n';
}
