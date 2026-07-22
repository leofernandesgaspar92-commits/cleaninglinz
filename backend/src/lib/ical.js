// ============================================================================
//  iCalendar-Erzeugung (RFC 5545) – kompatibel mit Outlook/Exchange, Google, Apple.
//  Erzeugt abonnierbare Feeds (VCALENDAR/VEVENT) inkl. Erinnerungen (VALARM).
// ============================================================================

// TEXT-Werte escapen (Backslash, Semikolon, Komma, Zeilenumbruch).
const esc = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Zeitstempel UTC: 20260131T090000Z
const dtUTC = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Nur Datum (Ganztags): 20261231
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

// Zeilenfaltung auf 75 Oktette (RFC 5545, mit führendem Leerzeichen in Folgezeilen).
function fold(line) {
  if (line.length <= 75) return line;
  const out = [];
  let s = line;
  out.push(s.slice(0, 75)); s = s.slice(75);
  while (s.length) { out.push(' ' + s.slice(0, 74)); s = s.slice(74); }
  return out.join('\r\n');
}

// event: { uid, start, end?, allDay?, summary, description?, location?, alarms?: [{ trigger, description }] }
function vevent(e) {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${dtUTC(Date.now())}`];
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(e.end || e.start)}`);
  } else {
    lines.push(`DTSTART:${dtUTC(e.start)}`);
    lines.push(`DTEND:${dtUTC(e.end || new Date(new Date(e.start).getTime() + 3600000))}`);
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  for (const a of e.alarms || []) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(a.description || e.summary)}`,
      `TRIGGER:${a.trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendar(name, events) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Leco//Reinigungs-Imperium//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Vienna',
  ];
  for (const e of events) lines.push(...vevent(e));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
