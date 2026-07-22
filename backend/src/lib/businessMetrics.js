// ============================================================================
//  Geschäftskennzahlen als Prometheus-Gauges (für Grafana-Dashboards).
//  Gecacht (15s), damit häufiges Scraping die DB nicht belastet.
// ============================================================================
import { query } from './db.js';
import { wrap } from './cache.js';

export async function businessMetrics() {
  try {
    return await wrap('metrics:business', 15000, async () => {
      const [f] = await query(`
        SELECT
          COALESCE(SUM(annual_revenue) FILTER (WHERE is_own OR status IN ('uebernommen','integriert')),0) AS revenue,
          COALESCE(SUM(ebitda)         FILTER (WHERE is_own OR status IN ('uebernommen','integriert')),0) AS ebitda,
          COUNT(*) FILTER (WHERE status IN ('ziel','due_diligence','verhandlung','vertrag'))               AS pipeline,
          COUNT(*) FILTER (WHERE is_own OR status IN ('uebernommen','integriert'))                          AS owned
        FROM companies`);
      const [c] = await query(`
        SELECT COUNT(*) FILTER (WHERE status='aktiv') AS active,
               COALESCE(SUM(value_monthly) FILTER (WHERE status='aktiv'),0) AS mrr
        FROM contracts`);
      const jobs = await query(`SELECT status, COUNT(*)::int AS n FROM jobs GROUP BY status`);

      const L = [];
      const g = (name, help, val, labels = '') => {
        L.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name}${labels} ${val}`);
      };
      g('leco_revenue_eur', 'Konsolidierter Jahresumsatz (EUR)', Number(f.revenue));
      g('leco_ebitda_eur', 'Konsolidiertes EBITDA (EUR)', Number(f.ebitda));
      g('leco_mrr_eur', 'Monatlich wiederkehrender Umsatz (EUR)', Number(c.mrr));
      g('leco_active_contracts', 'Aktive Verträge', Number(c.active));
      g('leco_companies_owned', 'Unternehmen im Imperium', Number(f.owned));
      g('leco_companies_pipeline', 'Übernahmeziele in der Pipeline', Number(f.pipeline));
      // Jobs nach Status (mit Label)
      L.push('# HELP leco_jobs Reinigungsaufträge nach Status', '# TYPE leco_jobs gauge');
      for (const j of jobs) L.push(`leco_jobs{status="${j.status}"} ${j.n}`);
      return L.join('\n') + '\n';
    });
  } catch {
    return ''; // Metriken dürfen die HTTP-Metriken nie blockieren
  }
}
