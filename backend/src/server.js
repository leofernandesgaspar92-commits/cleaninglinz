import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import companies from './routes/companies.js';
import customers from './routes/customers.js';
import contracts from './routes/contracts.js';
import employees from './routes/employees.js';
import jobs from './routes/jobs.js';
import dashboard from './routes/dashboard.js';
import acquisitions from './routes/acquisitions.js';
import importRouter from './routes/import.js';
import auth from './routes/auth.js';
import admin from './routes/admin.js';
import analytics from './routes/analytics.js';
import sso from './routes/sso.js';
import contractAI from './routes/contract-ai.js';
import queueRouter from './routes/queue.js';
import calendar from './routes/calendar.js';
import search from './routes/search.js';
import datev from './routes/datev.js';
import swaggerUi from 'swagger-ui-express';
import { logError } from './lib/security.js';
import { metricsMiddleware, renderMetrics } from './lib/metrics.js';
import { businessMetrics } from './lib/businessMetrics.js';
import { securityHeaders, rateLimit, readiness } from './lib/hardening.js';
import { openapiSpec } from './lib/openapi.js';
import { startWorker } from './lib/queue.js';
import './lib/jobHandlers.js'; // registriert die Job-Handler

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(securityHeaders);
// CORS-Allowlist statt „alles erlauben" (Enterprise-Härtung). Same-Origin-Aufrufe
// (Desktop-App, statisch ausgeliefertes Frontend) und Tools ohne Origin (curl,
// Health-Checks) sind erlaubt; Cross-Origin nur für konfigurierte Herkünfte.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4137', 'http://127.0.0.1:4137'];
const CORS_ORIGINS = new Set([
  ...DEV_ORIGINS,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : []),
]);
app.use(cors({
  origin(origin, cb) {
    // Erlaubt → CORS-Header setzen; sonst ohne Header (Browser blockt cross-origin,
    // Request läuft aber sauber durch – kein 500/Log-Rauschen).
    cb(null, !origin || CORS_ORIGINS.has(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(metricsMiddleware);
// Genereller Rate-Limiter (großzügig); strenger für Auth (Brute-Force-Schutz).
app.use(rateLimit({ windowMs: 60000, max: 600, name: 'global' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'leco-backend', version: '1.0-enterprise' }));
app.get('/api/ready', readiness);

// Monitoring & Dokumentation
app.get('/metrics', async (req, res) => { res.type('text/plain').send(renderMetrics() + await businessMetrics()); });
app.get('/api/openapi.json', (req, res) => res.json(openapiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'Leco API' }));

// Sicherheit / Enterprise
app.use('/api/auth', rateLimit({ windowMs: 60000, max: 30, name: 'auth' }), auth);
app.use('/api/admin', admin);
app.use('/api/analytics', analytics);
app.use('/api/sso', sso);
app.use('/api/contract-ai', contractAI);
app.use('/api/queue', queueRouter);
app.use('/api/calendar', calendar);
app.use('/api/search', search);
app.use('/api/datev', datev);

// Fachdomäne
app.use('/api/companies', companies);
app.use('/api/customers', customers);
app.use('/api/contracts', contracts);
app.use('/api/employees', employees);
app.use('/api/jobs', jobs);
app.use('/api/dashboard', dashboard);
app.use('/api/acquisitions', acquisitions);
app.use('/api/import', importRouter);

// Statisches Frontend ausliefern (für die Electron-Desktop-App bzw. Single-Port-
// Deployment). Aktiv, wenn SERVE_FRONTEND gesetzt ist und ein Build existiert –
// dann funktioniert der relative API-Pfad `/api` ohne CORS/Proxy.
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = process.env.FRONTEND_DIST || resolve(__dirname, '../../frontend/dist');
if (process.env.SERVE_FRONTEND && existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA-Fallback: alle Nicht-API-GETs auf index.html (Client-Routing).
  app.get(/^\/(?!api\/|metrics|agi\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(resolve(distDir, 'index.html'));
  });
  console.log(`Frontend statisch ausgeliefert aus ${distDir}`);
}

// Zentrale Fehlerbehandlung – protokolliert in error_log für das Admin-Monitoring.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  logError({ message: err.message || 'Interner Fehler', stack: err.stack,
    method: req.method, path: req.originalUrl, status });
  res.status(status).json({ error: err.message || 'Interner Fehler' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Leco-Backend (Enterprise) läuft auf http://localhost:${PORT}`));

// Hintergrund-Worker für die Job-Queue starten.
startWorker().catch((e) => console.error('Worker-Start fehlgeschlagen:', e.message));
