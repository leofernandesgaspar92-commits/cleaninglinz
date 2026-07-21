import express from 'express';
import cors from 'cors';

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
import { logError } from './lib/security.js';

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'leco-backend', version: '1.0-enterprise' }));

// Sicherheit / Enterprise
app.use('/api/auth', auth);
app.use('/api/admin', admin);
app.use('/api/analytics', analytics);
app.use('/api/sso', sso);

// Fachdomäne
app.use('/api/companies', companies);
app.use('/api/customers', customers);
app.use('/api/contracts', contracts);
app.use('/api/employees', employees);
app.use('/api/jobs', jobs);
app.use('/api/dashboard', dashboard);
app.use('/api/acquisitions', acquisitions);
app.use('/api/import', importRouter);

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
