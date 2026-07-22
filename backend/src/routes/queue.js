import { Router } from 'express';
import { enqueue, getJob, recentJobs } from '../lib/queue.js';
import { cacheStats } from '../lib/cache.js';

const router = Router();

// Job in die Queue legen (Hintergrundverarbeitung).
router.post('/:type', async (req, res, next) => {
  try {
    const job = await enqueue(req.params.type, req.body || {}, req.user?.email || 'anonym');
    res.status(202).json(job); // 202 Accepted – läuft asynchron
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Status eines Jobs pollen.
router.get('/job/:id', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(job);
  } catch (e) { next(e); }
});

router.get('/recent', async (req, res, next) => {
  try { res.json(await recentJobs()); } catch (e) { next(e); }
});

// Cache-Statistik (Hit-Rate)
router.get('/cache/stats', (req, res) => res.json(cacheStats()));

export default router;
