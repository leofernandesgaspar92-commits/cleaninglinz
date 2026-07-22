import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Befehle: Navigation + schnelle Aktionen. `extra` erlaubt kontextabhängige Aktionen.
const NAV_COMMANDS = [
  { id: 'dash', label: 'Dashboard', hint: 'g d', to: '/', ico: '🗺️' },
  { id: 'comp', label: 'Unternehmen', hint: 'g u', to: '/unternehmen', ico: '🏢' },
  { id: 'cust', label: 'Kunden', hint: 'g k', to: '/kunden', ico: '📋' },
  { id: 'emp', label: 'Mitarbeiter', hint: 'g m', to: '/mitarbeiter', ico: '👷' },
  { id: 'merg', label: 'Übernahme starten', hint: 'g x', to: '/uebernahme', ico: '⚡' },
  { id: 'imp', label: 'Daten-Import', hint: 'g i', to: '/import', ico: '📥' },
  { id: 'agi', label: 'KI-Team', hint: 'g t', to: '/ki-team', ico: '🤖' },
  { id: 'admin', label: 'Admin · Systemüberwachung', hint: 'g a', to: '/admin', ico: '🛡️' },
];
const KEY_TO_PATH = { d: '/', u: '/unternehmen', k: '/kunden', m: '/mitarbeiter', x: '/uebernahme', i: '/import', t: '/ki-team', a: '/admin' };

const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

export default function CommandPalette({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const nav = useNavigate();
  const gPending = useRef(false);

  const [results, setResults] = useState({ customers: [], companies: [], contracts: [] });

  const commands = [...NAV_COMMANDS, ...actions];
  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  // Globale Volltextsuche (debounced), sobald ≥2 Zeichen getippt werden.
  useEffect(() => {
    if (!open || q.trim().length < 2) { setResults({ customers: [], companies: [], contracts: [] }); return; }
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((j) => setResults({ customers: j.customers || [], companies: j.companies || [], contracts: j.contracts || [] }))
        .catch(() => {});
    }, 220);
    return () => clearTimeout(id);
  }, [q, open]);

  const hasResults = results.customers.length + results.companies.length + results.contracts.length > 0;

  const run = useCallback((c) => {
    setOpen(false); setQ('');
    if (c.to) nav(c.to);
    else if (c.action) c.action();
  }, [nav]);

  useEffect(() => {
    function onKey(e) {
      // Palette: Strg/Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen((o) => !o); setHelp(false); setQ(''); setSel(0); return;
      }
      if (e.key === 'Escape') { setOpen(false); setHelp(false); gPending.current = false; return; }
      if (isTyping(e)) return;

      // Hilfe: ?
      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); return; }

      // Navigations-Chords: "g" dann Buchstabe
      if (e.key === 'g') { gPending.current = true; setTimeout(() => { gPending.current = false; }, 1200); return; }
      if (gPending.current && KEY_TO_PATH[e.key]) { e.preventDefault(); gPending.current = false; nav(KEY_TO_PATH[e.key]); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  function onListKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && filtered[sel]) { e.preventDefault(); run(filtered[sel]); }
  }

  return (
    <>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <input ref={inputRef} className="palette-input" placeholder="Befehl oder Seite suchen …"
              value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onListKey} />
            <div className="palette-list">
              {filtered.length === 0 && <div className="muted" style={{ padding: '.7rem' }}>Kein Treffer.</div>}
              {filtered.map((c, i) => (
                <div key={c.id} className={`palette-item ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                  <span className="ico">{c.ico || '›'}</span>
                  <span style={{ flex: 1 }}>{c.label}</span>
                  {c.hint && <kbd>{c.hint}</kbd>}
                </div>
              ))}
            </div>
            {hasResults && (
              <div className="palette-list" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="muted" style={{ padding: '.4rem .7rem', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.5px' }}>Suchergebnisse</div>
                {results.companies.map((c) => (
                  <div key={'co' + c.id} className="palette-item" onClick={() => run({ to: `/uebernahme/${c.id}` })}>
                    <span className="ico">🏢</span><span style={{ flex: 1 }}>{c.name}</span><span className="pill">{c.status}</span>
                  </div>
                ))}
                {results.customers.map((c) => (
                  <div key={'cu' + c.id} className="palette-item" onClick={() => run({ to: '/kunden' })}>
                    <span className="ico">📋</span><span style={{ flex: 1 }}>{c.name}</span><span className="muted" style={{ fontSize: '.75rem' }}>{c.district || ''}</span>
                  </div>
                ))}
                {results.contracts.map((c) => (
                  <div key={'ct' + c.id} className="palette-item" onClick={() => run({ to: '/kunden' })}>
                    <span className="ico">📄</span><span style={{ flex: 1 }}>{c.title}</span><span className="muted" style={{ fontSize: '.75rem' }}>{c.customer}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="palette-foot muted">↑↓ Befehle · ⏎ öffnen · Volltextsuche über Kunden, Firmen, Verträge · Esc</div>
          </div>
        </div>
      )}

      {help && (
        <div className="overlay" onClick={() => setHelp(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()} style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Tastatur-Kurzbefehle</h3>
            <table><tbody>
              <tr><td><kbd>Strg</kbd>+<kbd>K</kbd></td><td>Befehlspalette</td></tr>
              <tr><td><kbd>g</kbd> dann <kbd>d/u/k/m/x/i/t/a</kbd></td><td>Zu Seite springen</td></tr>
              <tr><td><kbd>?</kbd></td><td>Diese Hilfe</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Schließen</td></tr>
            </tbody></table>
          </div>
        </div>
      )}
    </>
  );
}
