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

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'leco-backend' }));

app.use('/api/companies', companies);
app.use('/api/customers', customers);
app.use('/api/contracts', contracts);
app.use('/api/employees', employees);
app.use('/api/jobs', jobs);
app.use('/api/dashboard', dashboard);
app.use('/api/acquisitions', acquisitions);
app.use('/api/import', importRouter);

// Zentrale Fehlerbehandlung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Interner Fehler' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Leco-Backend läuft auf http://localhost:${PORT}`));
