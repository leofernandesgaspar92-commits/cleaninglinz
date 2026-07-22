import { useEffect, useState } from 'react';

// Status-Farben (Gut/Kritisch) – konsistent mit der App-Palette, mit Labels+Legende.
const APPLIED = '#3fb950';   // ausgeführt (gut)
const REVERTED = '#f85149';  // zurückgerollt (kritisch)

export default function MetricsPanel() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const load = () => fetch('/agi/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
    load(); const t = setInterval(load, 6000); return () => clearInterval(t);
  }, []);

  if (!stats) return null;
  const s = stats.summary;

  const tiles = [
    { label: 'Verbesserungs-Zyklen', value: s.cycles },
    { label: 'Änderungen ausgeführt', value: s.applied, color: APPLIED },
    { label: 'Auto-zurückgerollt', value: s.reverted, color: s.reverted > 0 ? REVERTED : undefined },
    { label: 'Freigaben offen', value: s.approvals_open },
    { label: 'Auto-genehmigt (Policy)', value: s.approvals_auto },
    { label: 'Erkenntnisse (Knowledge)', value: s.knowledge },
  ];

  return (
    <div style={{ marginBottom: '1.2rem' }}>
      <div className="cards" style={{ marginBottom: '1rem' }}>
        {tiles.map((t) => (
          <div key={t.label} className="card kpi">
            <div className="label">{t.label}</div>
            <div className="value" style={t.color ? { color: t.color } : undefined}>{t.value}</div>
          </div>
        ))}
      </div>
      <CycleChart series={stats.series} />
    </div>
  );
}

// Kompaktes gestapeltes Balkendiagramm: je Zyklus ausgeführt (grün) vs. zurückgerollt (rot).
function CycleChart({ series }) {
  const data = (series || []).filter((d) => d.applied + d.reverted >= 0);
  const max = Math.max(1, ...data.map((d) => d.applied + d.reverted));
  const H = 90, barW = 16, gap = 8, padL = 4, baseline = H;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
        <h3 style={{ fontSize: '.95rem', margin: 0 }}>Wirkung je Zyklus</h3>
        <div className="row" style={{ gap: '.8rem', fontSize: '.75rem' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: APPLIED, marginRight: 5 }} />ausgeführt</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: REVERTED, marginRight: 5 }} />zurückgerollt</span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="muted" style={{ fontSize: '.85rem' }}>Noch keine Zyklen – starte einen Verbesserungs-Zyklus.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg width={padL + data.length * (barW + gap)} height={H + 18} role="img"
               aria-label="Ausgeführte und zurückgerollte Änderungen je Zyklus">
            {/* recessive Baseline */}
            <line x1="0" y1={baseline} x2={padL + data.length * (barW + gap)} y2={baseline} stroke="#2a3140" strokeWidth="1" />
            {data.map((d, i) => {
              const x = padL + i * (barW + gap);
              const hApplied = (d.applied / max) * (H - 6);
              const hReverted = (d.reverted / max) * (H - 6);
              const gapSeg = hReverted > 0 && hApplied > 0 ? 2 : 0;
              return (
                <g key={i}>
                  <title>{`Zyklus ${d.iteration}: ${d.applied} ausgeführt, ${d.reverted} zurückgerollt`}</title>
                  {/* ausgeführt (unten, an Baseline verankert, 4px gerundete Enden) */}
                  {d.applied > 0 && (
                    <rect x={x} y={baseline - hApplied} width={barW} height={hApplied} rx="4" fill={APPLIED} />
                  )}
                  {/* zurückgerollt (oben, 2px Abstand) */}
                  {d.reverted > 0 && (
                    <rect x={x} y={baseline - hApplied - gapSeg - hReverted} width={barW} height={hReverted} rx="4" fill={REVERTED} />
                  )}
                  <text x={x + barW / 2} y={H + 13} textAnchor="middle" fontSize="9" fill="#8b97a7">{d.iteration}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
