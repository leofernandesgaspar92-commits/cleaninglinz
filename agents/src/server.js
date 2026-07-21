// ============================================================================
//  Mini-Dashboard + API für das Multi-Agenten-System.
//  Zeigt Task Board, offene Freigaben (Human-in-the-Loop), Knowledge Base und
//  die letzten Agenten-Läufe. Freigaben lassen sich per Klick entscheiden.
// ============================================================================
import express from 'express';
import cors from 'cors';
import { query } from './core/db.js';
import { TaskBoard, Approvals, Knowledge } from './core/comms.js';
import { WORKFLOWS, WORKFLOW_KEYS } from './workflows/index.js';
import { isLive } from './core/llm.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/board', async (req, res) => res.json(await TaskBoard.list()));
app.get('/api/approvals', async (req, res) => res.json(await Approvals.list(req.query.status || 'offen')));
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.read({ limit: 30 })));
app.get('/api/runs', async (req, res) =>
  res.json(await query('SELECT agent_key, workflow, mode, output, reflection, started_at FROM agi.agent_runs ORDER BY started_at DESC LIMIT 40')));

// Freigabe entscheiden
app.post('/api/approvals/:id', async (req, res) => {
  const r = await Approvals.decide(req.params.id, req.body.approved === true);
  res.json(r || { error: 'nicht gefunden' });
});

// Workflow manuell auslösen
app.post('/api/workflows/:name', async (req, res) => {
  const wf = WORKFLOWS[req.params.name];
  if (!wf) return res.status(400).json({ error: 'unbekannter Workflow' });
  const result = await wf();
  res.json({ name: result.name, steps: result.steps.length });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Leco AGI Team</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0e1117;color:#e6edf3;margin:0;padding:1.5rem}
h1{margin:0 0 .2rem}.muted{color:#8b97a7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}
.card{background:#161b22;border:1px solid #2a3140;border-radius:10px;padding:1rem}
.card h2{font-size:1rem;margin:0 0 .6rem}.item{border-bottom:1px solid #2a3140;padding:.5rem 0;font-size:.85rem}
button{font:inherit;cursor:pointer;border:1px solid #2a3140;background:#1c2230;color:#e6edf3;padding:.3rem .7rem;border-radius:6px;margin-right:.3rem}
.ok{border-color:#3fb950;color:#4ade80}.no{border-color:#f85149;color:#fca5a5}
.pill{font-size:.7rem;background:#1c2230;padding:.1rem .5rem;border-radius:20px;color:#8b97a7}
select{font:inherit;background:#0e1117;color:#e6edf3;border:1px solid #2a3140;border-radius:6px;padding:.3rem}
</style></head><body>
<h1>Leco <span style="color:#2f81f7">AGI Team</span></h1>
<div class="muted">Modus: ${isLive() ? 'LIVE (Claude)' : 'SIMULATION'} · Human-in-the-Loop aktiv</div>
<div style="margin-top:1rem">
  <select id="wf">${WORKFLOW_KEYS.map((k) => `<option>${k}</option>`).join('')}</select>
  <button onclick="fire()">▶ Workflow auslösen</button>
</div>
<div class="grid">
  <div class="card"><h2>⚠ Offene Freigaben</h2><div id="approvals" class="muted">lädt…</div></div>
  <div class="card"><h2>📋 Task Board</h2><div id="board" class="muted">lädt…</div></div>
  <div class="card"><h2>🧠 Knowledge Base</h2><div id="knowledge" class="muted">lädt…</div></div>
  <div class="card"><h2>🏃 Letzte Agenten-Läufe</h2><div id="runs" class="muted">lädt…</div></div>
</div>
<script>
async function load(){
  const [a,b,k,r]=await Promise.all(['approvals','board','knowledge','runs'].map(p=>fetch('/api/'+p).then(x=>x.json())));
  document.getElementById('approvals').innerHTML=a.length?a.map(x=>
    '<div class=item><span class=pill>'+x.category+'</span> '+x.summary+
    '<div><button class=ok onclick="decide(\\''+x.id+'\\',true)">Genehmigen</button>'+
    '<button class=no onclick="decide(\\''+x.id+'\\',false)">Ablehnen</button></div></div>').join(''):'<div class=muted>keine</div>';
  document.getElementById('board').innerHTML=b.map(x=>
    '<div class=item><span class=pill>'+x.status+'</span> '+x.title+' <span class=muted>→ '+(x.assigned_to||'-')+'</span></div>').join('')||'<div class=muted>leer</div>';
  document.getElementById('knowledge').innerHTML=k.map(x=>
    '<div class=item><b>'+x.title+'</b> <span class=pill>'+x.topic+'</span><br><span class=muted>'+x.content.slice(0,140)+'</span></div>').join('')||'<div class=muted>leer</div>';
  document.getElementById('runs').innerHTML=r.map(x=>
    '<div class=item><span class=pill>'+x.agent_key+'</span> <span class=muted>'+(x.workflow||'')+'</span><br>'+(x.output||'').slice(0,120)+'</div>').join('')||'<div class=muted>leer</div>';
}
async function decide(id,ok){await fetch('/api/approvals/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:ok})});load();}
async function fire(){const n=document.getElementById('wf').value;await fetch('/api/workflows/'+n,{method:'POST'});load();}
load();setInterval(load,5000);
</script></body></html>`);
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => console.log(`Leco AGI Dashboard: http://localhost:${PORT}`));
