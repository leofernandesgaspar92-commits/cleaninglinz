// ============================================================================
//  DATEV-Buchungsstapel-Export der Reinigungsumsätze (aktive Verträge).
//   GET /api/datev/buchungsstapel.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
//  Konfiguration via Umgebung: DATEV_BERATER, DATEV_MANDANT,
//  DATEV_KONTO_ERLOES (Standard 8400 = Erlöse 19% SKR03), DATEV_GEGENKONTO (10000).
//  Ausgabe in Windows-1252 (ANSI) – wie von DATEV erwartet.
// ============================================================================
import { Router } from 'express';
import { query } from '../lib/db.js';
import { buildBuchungsstapel } from '../lib/datev.js';

const router = Router();

router.get('/buchungsstapel.csv', async (req, res, next) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const kontoErloes = process.env.DATEV_KONTO_ERLOES || '8400';
    const gegenkonto = process.env.DATEV_GEGENKONTO || '10000';

    // Aktive Verträge -> je ein Buchungssatz (Monatsumsatz) im Zeitraum.
    const rows = await query(`
      SELECT ct.value_monthly, ct.title, c.name AS customer
      FROM contracts ct JOIN customers c ON c.id = ct.customer_id
      WHERE ct.status = 'aktiv' AND COALESCE(ct.value_monthly,0) > 0
      ORDER BY c.name`);

    const bookings = rows.map((r, i) => ({
      umsatz: r.value_monthly,
      shKz: 'S',
      konto: gegenkonto,      // Debitor/Forderung im Soll
      gegenkonto: kontoErloes, // Erlöskonto im Haben
      belegdatum: to,
      belegfeld1: `RE-${to.getFullYear()}${String(to.getMonth() + 1).padStart(2, '0')}-${i + 1}`,
      buchungstext: `Reinigung ${r.customer}${r.title ? ' - ' + r.title : ''}`,
    }));

    const csv = buildBuchungsstapel({
      berater: process.env.DATEV_BERATER || '1000',
      mandant: process.env.DATEV_MANDANT || '1',
      wjBeginn: new Date(to.getFullYear(), 0, 1),
      from, to, bezeichnung: 'Leco Reinigungsumsätze',
    }, bookings);

    res.set('Content-Type', 'text/csv; charset=windows-1252');
    res.set('Content-Disposition', `attachment; filename="EXTF_Buchungsstapel_${to.getFullYear()}${String(to.getMonth() + 1).padStart(2, '0')}.csv"`);
    // DATEV erwartet ANSI (Windows-1252); latin1 deckt die verwendeten Zeichen ab.
    res.send(Buffer.from(csv, 'latin1'));
  } catch (e) { next(e); }
});

export default router;
