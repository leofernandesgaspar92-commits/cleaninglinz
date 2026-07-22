# Leco Monitoring – Prometheus + Grafana

Fertiger Monitoring-Stack, der die Metriken des Leco-Backends (`/metrics`)
scrapt und in Grafana visualisiert.

## Start

```bash
# Leco-Backend läuft auf dem Host (Port 4000)
docker compose -f monitoring/docker-compose.yml up -d
```

- **Grafana**: http://localhost:3000 (admin / admin) → Dashboard „Leco – Betrieb & Geschäft"
- **Prometheus**: http://localhost:9090

Datenquelle und Dashboard werden automatisch provisioniert.

## Was überwacht wird

**Betrieb** (aus `lib/metrics.js`):
- `http_requests_total` – Anfragen nach Methode/Route/Status
- `http_request_duration_seconds` – Antwortzeit-Histogramm (p95 im Dashboard)
- `process_resident_memory_bytes`, `process_uptime_seconds`

**Geschäft** (aus `lib/businessMetrics.js`, 15 s gecacht):
- `leco_revenue_eur`, `leco_ebitda_eur`, `leco_mrr_eur`
- `leco_active_contracts`, `leco_companies_owned`, `leco_companies_pipeline`
- `leco_jobs{status=…}`

Damit sieht man Server-Performance **und** Geschäftskennzahlen in einem Dashboard.
