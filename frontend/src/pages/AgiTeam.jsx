import { useEffect, useState, useCallback } from 'react';

// Ruft das AGI-Team-Dashboard (Port 4100) über den /agi-Proxy auf.
async function agiGet(path) {
  const res = await fetch('/agi/api' + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function agiPost(path, body) {
  const res = await fetch('/agi/api' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const WORKFLOWS = [
  'daily_standup', 'continuous_improvement', 'merger_pipeline', 'bug_bounty', 'market_intelligence',
];

export default function AgiTeam() {
  const [board, setBoard] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [runs, setRuns] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [wf, setWf] = useState(WORKFLOWS[0]);
  const [busy, setBusy] = useState(false);
  const [looping, setLooping] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [b, a, k, r, c] = await Promise.all([
        agiGet('/board'), agiGet('/approvals'), agiGet('/knowledge'), agiGet('/runs'), agiGet('/cycles'),
      ]);
      setBoard(b); setApprovals(a); setKnowledge(k); setRuns(r); setCycles(c); setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  async function fire() {
    setBusy(true);
    try { await agiPost(`/workflows/${wf}`); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function decide(id, approved) {
    await agiPost(`/approvals/${id}`, { approved });
    load();
  }
  async function runCycle() {
    setLooping(true);
    try { await agiPost('/loop'); await load(); }
    catch (e) { setErr(e.message); }
    setLooping(false);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>KI-Team <span className="muted" style={{ fontSize: '.9rem' }}>· AGI Multi-Agenten-System</span></h1>
          <div className="muted">Agenten verbessern Leco autonom – kritische Schritte brauchen deine Freigabe.</div>
        </div>
        <div className="row">
          <select value={wf} onChange={(e) => setWf(e.target.value)} style={{ width: 'auto' }}>
            {WORKFLOWS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <button className="primary" onClick={fire} disabled={busy}>{busy ? 'läuft…' : '▶ Workflow starten'}</button>
          <button onClick={runCycle} disabled={looping} title="analysieren → Lösung → verbessern → ausführen → lernen">
            {looping ? 'Zyklus läuft…' : '↻ Verbesserungs-Zyklus'}
          </button>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          AGI-Server nicht erreichbar ({err}). Starte ihn mit <code>cd agents && npm run dashboard</code>.
        </div>
      )}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px' }}>
          <h3>⚠ Offene Freigaben ({approvals.length})</h3>
          <div className="card" style={{ padding: '.4rem .6rem' }}>
            {approvals.length === 0 && <div className="muted" style={{ padding: '.5rem' }}>Keine offen.</div>}
            {approvals.map((a) => (
              <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '.6rem 0' }}>
                <span className="pill">{a.category}</span> <b>{a.requested_by}</b>
                <div className="muted" style={{ fontSize: '.82rem', margin: '.3rem 0' }}>{a.summary}</div>
                <div className="row">
                  <button className="primary" onClick={() => decide(a.id, true)}>Genehmigen</button>
                  <button onClick={() => decide(a.id, false)}>Ablehnen</button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '1rem' }}>📋 Task Board ({board.length})</h3>
          <div className="card" style={{ padding: '.4rem .6rem' }}>
            {board.length === 0 && <div className="muted" style={{ padding: '.5rem' }}>Leer.</div>}
            {board.map((t) => (
              <div key={t.id} style={{ borderBottom: '1px solid var(--border)', padding: '.4rem 0', fontSize: '.85rem' }}>
                <span className={`badge ${t.status === 'erledigt' ? 'erledigt' : 'in_arbeit'}`}>{t.status}</span> {t.title}
                <span className="muted"> → {t.assigned_to || '-'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 340px' }}>
          <h3>🧠 Knowledge Base</h3>
          <div className="card" style={{ padding: '.4rem .6rem', maxHeight: 260, overflow: 'auto' }}>
            {knowledge.map((k) => (
              <div key={k.id} style={{ borderBottom: '1px solid var(--border)', padding: '.4rem 0', fontSize: '.82rem' }}>
                <b>{k.title}</b> <span className="pill">{k.topic}</span>
                <div className="muted">{k.content.slice(0, 140)}</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '1rem' }}>🏃 Letzte Agenten-Läufe</h3>
          <div className="card" style={{ padding: '.4rem .6rem', maxHeight: 260, overflow: 'auto' }}>
            {runs.map((r, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '.4rem 0', fontSize: '.82rem' }}>
                <span className="pill">{r.agent_key}</span> <span className="muted">{r.workflow || ''} · {r.mode}</span>
                <div className="muted">{(r.output || '').slice(0, 120)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: '1.2rem' }}>↻ Verbesserungs-Zyklen <span className="muted" style={{ fontSize: '.8rem' }}>· analysieren → Lösung → verbessern → ausführen → lernen</span></h3>
      <div className="card" style={{ padding: '.2rem' }}>
        <table>
          <thead><tr><th>#</th><th>Ausgeführt</th><th>Erkenntnis</th><th>Zeit</th></tr></thead>
          <tbody>
            {cycles.length === 0 && <tr><td colSpan="4" className="muted">Noch keine Zyklen. Klicke „↻ Verbesserungs-Zyklus".</td></tr>}
            {cycles.map((c) => (
              <tr key={c.id}>
                <td>{c.iteration}</td>
                <td>{c.applied_count > 0 ? <span className="badge ok">{c.applied_count} ✓</span> : <span className="muted">0</span>}</td>
                <td style={{ fontSize: '.82rem' }}>{c.learning}</td>
                <td className="muted" style={{ fontSize: '.75rem' }}>{c.started_at?.slice(11, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
