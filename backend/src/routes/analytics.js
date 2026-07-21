import { Router } from 'express';
import { query } from '../lib/db.js';
import { trackEvent, requireAuth, requireRole } from '../lib/security.js';

const router = Router();

// Event erfassen (Funktionsnutzung) – für eingeloggte oder anonyme Nutzung.
router.post('/track', async (req, res, next) => {
  try {
    const { feature, action, meta } = req.body;
    if (!feature) return res.status(400).json({ error: 'feature nötig' });
    // Optionaler Nutzerbezug, falls Token vorhanden.
    let userId = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const { verifyToken } = await import('../lib/auth.js');
      userId = verifyToken(header.slice(7))?.sub ?? null;
    }
    await trackEvent({ userId, feature, action, meta });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Heatmap: welche Funktionen werden am häufigsten genutzt (Admin).
router.get('/heatmap', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const byFeature = await query(
      `SELECT feature, COUNT(*)::int AS uses,
              COUNT(DISTINCT user_id)::int AS users
       FROM analytics_events
       WHERE created_at > now() - ($1 || ' days')::interval
       GROUP BY feature ORDER BY uses DESC LIMIT 50`, [days]);
    const byHour = await query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS uses
       FROM analytics_events
       WHERE created_at > now() - ($1 || ' days')::interval
       GROUP BY hour ORDER BY hour`, [days]);
    res.json({ byFeature, byHour });
  } catch (e) { next(e); }
});

export default router;
