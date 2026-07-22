// ============================================================================
//  Die vier Kommunikationskanäle des Multi-Agenten-Systems.
//  Alle Postgres-gestützt (überleben Neustarts, sind auditierbar).
// ============================================================================
import { query, one } from './db.js';

// --- 1) TASK BOARD ----------------------------------------------------------
export const TaskBoard = {
  async create({ title, description, priority = 'normal', assignedTo, createdBy, workflow, parentId }) {
    return one(
      `INSERT INTO agi.task_board (title, description, priority, assigned_to, created_by, workflow, parent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description ?? null, priority, assignedTo ?? null, createdBy ?? 'system', workflow ?? null, parentId ?? null]
    );
  },
  async update(id, { status, result }) {
    return one(
      `UPDATE agi.task_board
       SET status = COALESCE($2, status), result = COALESCE($3, result)
       WHERE id = $1 RETURNING *`,
      [id, status ?? null, result ? JSON.stringify(result) : null]
    );
  },
  async list({ status, assignedTo } = {}) {
    const where = [];
    const params = [];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (assignedTo) { params.push(assignedTo); where.push(`assigned_to = $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return query(`SELECT * FROM agi.task_board ${clause} ORDER BY
       CASE priority WHEN 'kritisch' THEN 1 WHEN 'hoch' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
       created_at DESC`, params);
  },
  get: (id) => one('SELECT * FROM agi.task_board WHERE id = $1', [id]),
};

// --- 2) MESSAGE QUEUE -------------------------------------------------------
export const MessageQueue = {
  async send({ from, to, kind = 'info', taskId, content, payload }) {
    return one(
      `INSERT INTO agi.agent_messages (from_agent, to_agent, kind, task_id, content, payload)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [from, to, kind, taskId ?? null, content, payload ? JSON.stringify(payload) : null]
    );
  },
  // Nachrichten für einen Agenten holen und als konsumiert markieren.
  async drain(agentKey) {
    const rows = await query(
      `SELECT * FROM agi.agent_messages
       WHERE (to_agent = $1 OR to_agent = 'broadcast') AND consumed = FALSE
       ORDER BY created_at`,
      [agentKey]
    );
    if (rows.length) {
      await query('UPDATE agi.agent_messages SET consumed = TRUE WHERE id = ANY($1)',
        [rows.map((r) => r.id)]);
    }
    return rows;
  },
};

// --- 3) KNOWLEDGE BASE (Inter-Agenten-Learning) -----------------------------
export const Knowledge = {
  async write({ author, topic, title, content, tags = [] }) {
    return one(
      `INSERT INTO agi.knowledge_base (author, topic, title, content, tags)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [author, topic, title, content, JSON.stringify(tags)]
    );
  },
  async read({ topic, limit = 20 } = {}) {
    if (topic) {
      return query('SELECT * FROM agi.knowledge_base WHERE topic = $1 ORDER BY created_at DESC LIMIT $2',
        [topic, limit]);
    }
    return query('SELECT * FROM agi.knowledge_base ORDER BY created_at DESC LIMIT $1', [limit]);
  },
};

// --- 4) EVENT BUS -----------------------------------------------------------
export const EventBus = {
  async emit({ type, source, payload }) {
    return one(
      `INSERT INTO agi.agent_events (type, source, payload) VALUES ($1,$2,$3) RETURNING *`,
      [type, source, payload ? JSON.stringify(payload) : null]
    );
  },
  async pending(type) {
    if (type) return query('SELECT * FROM agi.agent_events WHERE handled = FALSE AND type = $1 ORDER BY created_at', [type]);
    return query('SELECT * FROM agi.agent_events WHERE handled = FALSE ORDER BY created_at');
  },
  markHandled: (id) => query('UPDATE agi.agent_events SET handled = TRUE WHERE id = $1', [id]),
};

// --- APPROVALS (Human-in-the-Loop) -----------------------------------------
export const Approvals = {
  async request({ category, requestedBy, taskId, summary, detail }) {
    return one(
      `INSERT INTO agi.approvals (category, requested_by, task_id, summary, detail)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [category, requestedBy, taskId ?? null, summary, detail ? JSON.stringify(detail) : null]
    );
  },
  list: (status = 'offen') => query('SELECT * FROM agi.approvals WHERE status = $1 ORDER BY created_at', [status]),
  async decide(id, approved, decidedBy = 'human') {
    return one(
      `UPDATE agi.approvals SET status = $2, decided_by = $3, decided_at = now()
       WHERE id = $1 RETURNING *`,
      [id, approved ? 'genehmigt' : 'abgelehnt', decidedBy]
    );
  },
  // Genehmigte, noch nicht ausgeführte Code-Freigaben mit Volltext.
  approvedUnappliedCode: () => query(
    `SELECT * FROM agi.approvals
     WHERE category = 'code_release' AND status = 'genehmigt' AND applied_at IS NULL
       AND detail ? 'new_content' AND detail->>'new_content' <> '' AND detail->>'new_content' <> '(kein Volltext übergeben)'
     ORDER BY decided_at`),
  markApplied: (id) => one('UPDATE agi.approvals SET applied_at = now() WHERE id = $1 RETURNING *', [id]),
};

// --- LOOP CYCLES ------------------------------------------------------------
export const LoopLog = {
  start: (iteration) => one('INSERT INTO agi.loop_cycles (iteration) VALUES ($1) RETURNING *', [iteration]),
  finish: (id, { phaseSummary, appliedCount, learning }) => one(
    `UPDATE agi.loop_cycles SET phase_summary=$2, applied_count=$3, learning=$4, finished_at=now()
     WHERE id=$1 RETURNING *`,
    [id, JSON.stringify(phaseSummary ?? {}), appliedCount ?? 0, learning ?? null]),
  recent: (limit = 20) => query('SELECT * FROM agi.loop_cycles ORDER BY started_at DESC LIMIT $1', [limit]),
};

// --- AGENT RUN LOG ----------------------------------------------------------
export const RunLog = {
  async start({ agentKey, taskId, workflow, mode, input }) {
    return one(
      `INSERT INTO agi.agent_runs (agent_key, task_id, workflow, mode, input)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [agentKey, taskId ?? null, workflow ?? null, mode, input ?? null]
    );
  },
  async finish(id, { output, reflection, tokensIn, tokensOut, toolCalls }) {
    return one(
      `UPDATE agi.agent_runs
       SET output=$2, reflection=$3, tokens_in=$4, tokens_out=$5, tool_calls=$6, finished_at=now()
       WHERE id=$1 RETURNING *`,
      [id, output ?? null, reflection ?? null, tokensIn ?? null, tokensOut ?? null,
       JSON.stringify(toolCalls ?? [])]
    );
  },
};
