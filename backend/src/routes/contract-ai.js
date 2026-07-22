import { Router } from 'express';
import { one } from '../lib/db.js';
import { analyzeContract, isLive } from '../lib/contractAI.js';
import { trackEvent } from '../lib/security.js';

const router = Router();

// Vertragstext analysieren -> strukturierte Felder.
router.post('/analyze', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 20)
      return res.status(400).json({ error: 'Bitte aussagekräftigen Vertragstext übergeben (min. 20 Zeichen).' });
    const result = await analyzeContract(text);
    trackEvent({ feature: 'merger.contract_analyze', action: 'submit', meta: { mode: result.mode } });
    res.json(result);
  } catch (e) { next(e); }
});

// Aus der Analyse einen Vertrag anlegen (Merger-Integration).
router.post('/create-contract', async (req, res, next) => {
  try {
    const { customer_id, fields, title } = req.body;
    if (!customer_id || !fields) return res.status(400).json({ error: 'customer_id und fields nötig' });
    const toDate = (s) => (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(s || '') ? s.split('.').reverse().join('-') : null);
    const status = fields.auto_verlaengerung ? 'aktiv' : 'aktiv';
    const contract = await one(
      `INSERT INTO contracts (customer_id, title, status, start_date, end_date, auto_renew,
                              frequency, value_monthly, price_per_sqm, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [customer_id, title || `Vertrag ${fields.vertragspartner || ''}`.trim(), status,
       toDate(fields.laufzeit_start), toDate(fields.laufzeit_ende), !!fields.auto_verlaengerung,
       fields.frequenz || null, fields.monatswert_eur || null, fields.preis_pro_qm_eur || null,
       `KI-Analyse: Kündigungsfrist ${fields.kuendigungsfrist || '?'}. ${(fields.besondere_klauseln || []).join('; ')}`]
    );
    res.status(201).json(contract);
  } catch (e) { next(e); }
});

router.get('/status', (req, res) => res.json({ mode: isLive() ? 'live' : 'sim' }));

export default router;
