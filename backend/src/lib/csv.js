// Excel-taugliche CSV-Erzeugung: UTF-8-BOM, CRLF, Semikolon-getrennt (DE-Excel).
export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
