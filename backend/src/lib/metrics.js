// ============================================================================
//  Leichtgewichtige Prometheus-Metriken (ohne Abhängigkeit).
//  Exposition-Format unter GET /metrics – von Prometheus/Grafana scrapebar.
// ============================================================================
const counters = new Map();          // key -> count
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const durBuckets = new Map();        // route -> {le:count}
const durSum = new Map();            // route -> summe(sekunden)
const durCount = new Map();          // route -> anzahl

// Route normalisieren, damit IDs nicht die Kardinalität sprengen.
function normRoute(req) {
  const base = (req.baseUrl || '') + (req.route?.path || req.path || '');
  return base.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+/g, '/:id') || req.path;
}

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = normRoute(req);
    const key = `${req.method}|${route}|${res.statusCode}`;
    counters.set(key, (counters.get(key) || 0) + 1);

    const sec = Number(process.hrtime.bigint() - start) / 1e9;
    durSum.set(route, (durSum.get(route) || 0) + sec);
    durCount.set(route, (durCount.get(route) || 0) + 1);
    const b = durBuckets.get(route) || {};
    for (const le of BUCKETS) if (sec <= le) b[le] = (b[le] || 0) + 1;
    durBuckets.set(route, b);
  });
  next();
}

export function renderMetrics() {
  const lines = [];
  lines.push('# HELP http_requests_total Anzahl HTTP-Anfragen');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, val] of counters) {
    const [method, route, status] = key.split('|');
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${val}`);
  }
  lines.push('# HELP http_request_duration_seconds Antwortzeit je Route');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [route, buckets] of durBuckets) {
    const count = durCount.get(route) || 0;
    for (const le of BUCKETS) lines.push(`http_request_duration_seconds_bucket{route="${route}",le="${le}"} ${buckets[le] || 0}`);
    lines.push(`http_request_duration_seconds_bucket{route="${route}",le="+Inf"} ${count}`);
    lines.push(`http_request_duration_seconds_sum{route="${route}"} ${(durSum.get(route) || 0).toFixed(6)}`);
    lines.push(`http_request_duration_seconds_count{route="${route}"} ${count}`);
  }
  // Prozessmetriken
  const mem = process.memoryUsage();
  lines.push('# HELP process_resident_memory_bytes Speicherverbrauch (RSS)');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push(`process_resident_memory_bytes ${mem.rss}`);
  lines.push('# HELP process_uptime_seconds Laufzeit des Prozesses');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${process.uptime().toFixed(0)}`);
  return lines.join('\n') + '\n';
}
