// ============================================================================
//  Benachrichtigungs-Service – schreibt jede Meldung in den In-App-Feed
//  (Tabelle notifications) und pusht sie zusätzlich an Slack/Teams, sofern
//  SLACK_WEBHOOK_URL bzw. TEAMS_WEBHOOK_URL gesetzt sind (Incoming Webhooks).
// ============================================================================
import { one, query } from './db.js';

const EMOJI = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨' };
const COLOR = { info: '2f81f7', success: '3fb950', warning: 'd29922', error: 'f85149' };

export function notifyStatus() {
  return { slack: !!process.env.SLACK_WEBHOOK_URL, teams: !!process.env.TEAMS_WEBHOOK_URL };
}

function slackPayload(level, title, message) {
  return { text: `${EMOJI[level]} *${title}*${message ? `\n${message}` : ''}` };
}
function teamsPayload(level, title, message) {
  // MessageCard-Format für Teams Incoming Webhooks.
  return {
    '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
    themeColor: COLOR[level], summary: title, title: `${EMOJI[level]} ${title}`,
    text: message || '',
  };
}
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

export async function notify({ title, message = '', level = 'info', meta } = {}) {
  const row = await one(
    `INSERT INTO notifications (level, title, message, meta) VALUES ($1,$2,$3,$4) RETURNING *`,
    [level, title, message, meta ? JSON.stringify(meta) : null]
  );

  let sentSlack = false, sentTeams = false;
  const slack = process.env.SLACK_WEBHOOK_URL;
  const teams = process.env.TEAMS_WEBHOOK_URL;
  if (slack) { try { await post(slack, slackPayload(level, title, message)); sentSlack = true; } catch (e) { console.warn('Slack:', e.message); } }
  if (teams) { try { await post(teams, teamsPayload(level, title, message)); sentTeams = true; } catch (e) { console.warn('Teams:', e.message); } }
  if (sentSlack || sentTeams)
    await query('UPDATE notifications SET sent_slack=$2, sent_teams=$3 WHERE id=$1', [row.id, sentSlack, sentTeams]);

  return { ...row, sent_slack: sentSlack, sent_teams: sentTeams };
}

export const recentNotifications = (limit = 30) =>
  query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1', [limit]);
