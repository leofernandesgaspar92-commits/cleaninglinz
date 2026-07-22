// ============================================================================
//  Kalender-Feeds (.ics) für Outlook/Exchange/Google.
//   - /api/calendar/jobs.ics       Reinigungstermine (abonnierbar)
//   - /api/calendar/contracts.ics  Vertragsenden + Kündigungs-Erinnerungen
//   - /api/calendar/contract/:id.ics  einzelner Vertrag (Download)
//
//  In Outlook/Exchange als "Kalender abonnieren" mit der Feed-URL einbinden
//  (webcal://…) – Termine aktualisieren sich dann automatisch.
// ============================================================================
import { Router } from 'express';
import { query } from '../lib/db.js';
import { buildCalendar } from '../lib/ical.js';

const router = Router();
const ORIGIN = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:4000';

function sendIcs(res, filename, ics) {
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="${filename}"`);
  res.send(ics);
}

// Reinigungstermine als Kalender-Feed.
router.get('/jobs.ics', async (req, res, next) => {
  try {
    const jobs = await query(`
      SELECT j.id, j.title, j.scheduled_at, j.duration_min,
             c.name AS customer, c.address, c.city
      FROM jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.scheduled_at IS NOT NULL AND j.status <> 'abgebrochen'
      ORDER BY j.scheduled_at`);
    const events = jobs.map((j) => ({
      uid: `job-${j.id}@leco`,
      start: j.scheduled_at,
      end: new Date(new Date(j.scheduled_at).getTime() + (j.duration_min || 60) * 60000),
      summary: `Reinigung: ${j.customer}`,
      description: j.title || 'Reinigungstermin',
      location: [j.address, j.city].filter(Boolean).join(', '),
      alarms: [{ trigger: '-PT30M', description: `Bald: Reinigung ${j.customer}` }],
    }));
    sendIcs(res, 'leco-termine.ics', buildCalendar('Leco Reinigungstermine', events));
  } catch (e) { next(e); }
});

// Vertragsenden + Kündigungs-Erinnerungen.
router.get('/contracts.ics', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT ct.id, ct.title, ct.end_date, ct.status, c.name AS customer
      FROM contracts ct JOIN customers c ON c.id = ct.customer_id
      WHERE ct.end_date IS NOT NULL AND ct.status <> 'beendet'
      ORDER BY ct.end_date`);
    sendIcs(res, 'leco-vertraege.ics', buildCalendar('Leco Vertragsfristen', rows.map(contractEvent)));
  } catch (e) { next(e); }
});

// Einzelner Vertrag als Download.
router.get('/contract/:id.ics', async (req, res, next) => {
  try {
    const [row] = await query(`
      SELECT ct.id, ct.title, ct.end_date, ct.status, c.name AS customer
      FROM contracts ct JOIN customers c ON c.id = ct.customer_id WHERE ct.id = $1`, [req.params.id]);
    if (!row || !row.end_date) return res.status(404).json({ error: 'Vertrag ohne Enddatum' });
    sendIcs(res, `vertrag-${row.id}.ics`, buildCalendar('Leco Vertrag', [contractEvent(row)]));
  } catch (e) { next(e); }
});

function contractEvent(ct) {
  return {
    uid: `contract-${ct.id}@leco`,
    start: ct.end_date, allDay: true,
    summary: `Vertragsende: ${ct.customer}`,
    description: `${ct.title || 'Vertrag'} endet. Kündigungsfrist rechtzeitig prüfen.`,
    // Erinnerungen: 30 Tage und 7 Tage vor Vertragsende.
    alarms: [
      { trigger: '-P30D', description: `Kündigungsfrist prüfen: ${ct.customer} (30 Tage)` },
      { trigger: '-P7D', description: `Vertragsende naht: ${ct.customer} (7 Tage)` },
    ],
  };
}

export default router;
