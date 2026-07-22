// ============================================================================
//  OpenAPI-3-Spezifikation der Leco-Enterprise-API (unter /api/docs via Swagger).
// ============================================================================
const bearer = [{ bearerAuth: [] }];

const crud = (tag, name) => ({
  get: { tags: [tag], summary: `${name} auflisten`, responses: { 200: { description: 'Liste' } } },
  post: { tags: [tag], summary: `${name} anlegen`, responses: { 201: { description: 'Angelegt' } } },
});
const crudItem = (tag, name) => ({
  get: { tags: [tag], summary: `${name} lesen`, parameters: [idParam], responses: { 200: { description: 'OK' }, 404: { description: 'Nicht gefunden' } } },
  patch: { tags: [tag], summary: `${name} aktualisieren`, parameters: [idParam], responses: { 200: { description: 'OK' } } },
  delete: { tags: [tag], summary: `${name} löschen`, parameters: [idParam], responses: { 204: { description: 'Gelöscht' } } },
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Leco Enterprise API',
    version: '1.0.0',
    description: 'Reinigungs-Imperium-Management für Linz – Enterprise-Backend (Auth/MFA, Merger, Admin-Monitoring, Analytics, SSO).',
  },
  servers: [{ url: 'http://localhost:4000', description: 'lokal' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  tags: [
    { name: 'Auth', description: 'Login, MFA, Registrierung' },
    { name: 'Admin', description: 'Monitoring & Benutzerverwaltung (Admin)' },
    { name: 'Analytics', description: 'Nutzungs-Tracking & Heatmap' },
    { name: 'SSO', description: 'Single Sign-On (Google/Azure)' },
    { name: 'Merger', description: 'Übernahmen (Merger & Acquisition)' },
    { name: 'KI', description: 'KI-Vertragsanalyse' },
    { name: 'Stammdaten', description: 'Unternehmen, Kunden, Verträge, Mitarbeiter, Jobs' },
    { name: 'System', description: 'Health, Metrics, Job-Queue & Cache' },
    { name: 'Kalender', description: 'iCalendar-Feeds (Outlook/Exchange)' },
  ],
  paths: {
    '/api/health': { get: { tags: ['System'], summary: 'Health-Check (Liveness)', responses: { 200: { description: 'OK' } } } },
    '/api/ready': { get: { tags: ['System'], summary: 'Readiness-Probe (prüft DB)', responses: { 200: { description: 'bereit' }, 503: { description: 'nicht bereit' } } } },
    '/metrics': { get: { tags: ['System'], summary: 'Prometheus-Metriken', responses: { 200: { description: 'Exposition-Format' } } } },
    '/api/queue/{type}': { post: { tags: ['System'], summary: 'Hintergrund-Job einreihen', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['export_customers', 'reindex'] } }], responses: { 202: { description: 'Angenommen (läuft asynchron)' } } } },
    '/api/queue/job/{id}': { get: { tags: ['System'], summary: 'Job-Status pollen', parameters: [idParam], responses: { 200: { description: 'Job' } } } },
    '/api/queue/cache/stats': { get: { tags: ['System'], summary: 'Cache-Statistik (Hit-Rate)', responses: { 200: { description: 'Stats' } } } },

    '/api/auth/register': { post: { tags: ['Auth'], summary: 'Registrierung (Bootstrap-Admin / Admin)', requestBody: reqBody({ email: 'string', password: 'string', full_name: 'string', role: 'string' }), responses: { 201: { description: 'Nutzer' }, 403: { description: 'Nur Admin' } } } },
    '/api/auth/login': { post: { tags: ['Auth'], summary: 'Login (Passwort + optional TOTP)', requestBody: reqBody({ email: 'string', password: 'string', totp: 'string' }), responses: { 200: { description: 'Token + Nutzer' }, 206: { description: 'MFA erforderlich' }, 401: { description: 'Falsche Daten' }, 423: { description: 'Konto gesperrt' } } } },
    '/api/auth/me': { get: { tags: ['Auth'], summary: 'Aktueller Nutzer', security: bearer, responses: { 200: { description: 'Nutzer' } } } },
    '/api/auth/mfa/setup': { post: { tags: ['Auth'], summary: 'MFA einrichten (Secret + otpauth-URL)', security: bearer, responses: { 200: { description: 'Secret' } } } },
    '/api/auth/mfa/enable': { post: { tags: ['Auth'], summary: 'MFA aktivieren', security: bearer, requestBody: reqBody({ code: 'string' }), responses: { 200: { description: 'OK' } } } },
    '/api/auth/mfa/disable': { post: { tags: ['Auth'], summary: 'MFA deaktivieren', security: bearer, requestBody: reqBody({ code: 'string' }), responses: { 200: { description: 'OK' } } } },

    '/api/admin/overview': { get: { tags: ['Admin'], summary: 'System-Überblick (Echtzeit)', security: bearer, responses: { 200: { description: 'Kennzahlen' }, 403: { description: 'Admin nötig' } } } },
    '/api/admin/audit': { get: { tags: ['Admin'], summary: 'Audit-Log', security: bearer, responses: { 200: { description: 'Einträge' } } } },
    '/api/admin/errors': { get: { tags: ['Admin'], summary: 'Fehler-Log', security: bearer, responses: { 200: { description: 'Einträge' } } } },
    '/api/admin/users': { get: { tags: ['Admin'], summary: 'Benutzer auflisten', security: bearer, responses: { 200: { description: 'Nutzer' } } } },
    '/api/admin/users/{id}/role': { patch: { tags: ['Admin'], summary: 'Rolle ändern', security: bearer, parameters: [idParam], requestBody: reqBody({ role: 'string' }), responses: { 200: { description: 'OK' } } } },
    '/api/admin/notifications': { get: { tags: ['Admin'], summary: 'Benachrichtigungs-Feed + Slack/Teams-Status', security: bearer, responses: { 200: { description: 'Feed' } } } },
    '/api/admin/notify/test': { post: { tags: ['Admin'], summary: 'Testbenachrichtigung senden', security: bearer, responses: { 200: { description: 'Gesendet' } } } },

    '/api/analytics/track': { post: { tags: ['Analytics'], summary: 'Funktionsnutzung erfassen', requestBody: reqBody({ feature: 'string', action: 'string' }), responses: { 204: { description: 'Erfasst' } } } },
    '/api/analytics/heatmap': { get: { tags: ['Analytics'], summary: 'Nutzungs-Heatmap', security: bearer, responses: { 200: { description: 'Aggregat' } } } },

    '/api/sso/status': { get: { tags: ['SSO'], summary: 'Konfigurierte Provider', responses: { 200: { description: 'Status' } } } },
    '/api/sso/{provider}/login': { get: { tags: ['SSO'], summary: 'SSO starten (Redirect)', parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['google', 'azure'] } }], responses: { 302: { description: 'Redirect' }, 501: { description: 'Nicht konfiguriert' } } } },

    '/api/acquisitions/by-company/{companyId}': { get: { tags: ['Merger'], summary: 'Übernahme-Workflow + Due Diligence', parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Workflow' } } } },
    '/api/acquisitions/steps/{stepId}': { patch: { tags: ['Merger'], summary: 'Schritt aktualisieren', parameters: [{ name: 'stepId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/api/acquisitions/by-company/{companyId}/report': { get: { tags: ['Merger'], summary: 'Statusbericht', parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Bericht' } } } },

    '/api/contract-ai/analyze': { post: { tags: ['KI'], summary: 'Vertragstext analysieren (KI)', requestBody: reqBody({ text: 'string' }), responses: { 200: { description: 'Extrahierte Felder' } } } },
    '/api/contract-ai/create-contract': { post: { tags: ['KI'], summary: 'Vertrag aus Analyse anlegen', requestBody: reqBody({ customer_id: 'string' }), responses: { 201: { description: 'Vertrag' } } } },

    '/api/search': { get: { tags: ['System'], summary: 'Globale Volltextsuche (Kunden/Firmen/Verträge)', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Treffer' } } } },
    '/api/datev/buchungsstapel.csv': { get: { tags: ['System'], summary: 'DATEV-Buchungsstapel (EXTF) exportieren', parameters: [{ name: 'from', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { 200: { description: 'text/csv (DATEV EXTF)' } } } },
    '/api/calendar/jobs.ics': { get: { tags: ['Kalender'], summary: 'Reinigungstermine als iCalendar-Feed', responses: { 200: { description: 'text/calendar' } } } },
    '/api/calendar/contracts.ics': { get: { tags: ['Kalender'], summary: 'Vertragsfristen als iCalendar-Feed', responses: { 200: { description: 'text/calendar' } } } },

    '/api/companies': crud('Stammdaten', 'Unternehmen'),
    '/api/companies/{id}': crudItem('Stammdaten', 'Unternehmen'),
    '/api/customers': crud('Stammdaten', 'Kunden'),
    '/api/customers/{id}': crudItem('Stammdaten', 'Kunden'),
    '/api/customers/{id}/contracts': { get: { tags: ['Stammdaten'], summary: 'Verträge eines Kunden', parameters: [idParam], responses: { 200: { description: 'Verträge' } } } },
    '/api/contracts': crud('Stammdaten', 'Verträge'),
    '/api/employees': crud('Stammdaten', 'Mitarbeiter'),
    '/api/jobs': crud('Stammdaten', 'Aufträge'),
    '/api/import/{entity}': { post: { tags: ['Stammdaten'], summary: 'CSV-Import (customers|employees)', parameters: [{ name: 'entity', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Ergebnis' } } } },
  },
};

function reqBody(props) {
  const properties = {};
  for (const [k, t] of Object.entries(props)) properties[k] = { type: t };
  return { required: true, content: { 'application/json': { schema: { type: 'object', properties } } } };
}
