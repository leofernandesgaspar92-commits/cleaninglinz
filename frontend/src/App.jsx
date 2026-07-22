import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Companies from './pages/Companies.jsx';
import Customers from './pages/Customers.jsx';
import Employees from './pages/Employees.jsx';
import Merger from './pages/Merger.jsx';
import Import from './pages/Import.jsx';
import AgiTeam from './pages/AgiTeam.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { Toasts, toast } from './components/Toast.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import { me, clearToken, track } from './lib/auth.js';

const NAV = [
  { to: '/', label: 'Dashboard', ico: '🗺️', end: true },
  { to: '/unternehmen', label: 'Unternehmen', ico: '🏢' },
  { to: '/kunden', label: 'Kunden', ico: '📋' },
  { to: '/mitarbeiter', label: 'Mitarbeiter', ico: '👷' },
  { to: '/uebernahme', label: 'Übernahme', ico: '⚡' },
  { to: '/import', label: 'Import', ico: '📥' },
  { to: '/ki-team', label: 'KI-Team', ico: '🤖' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const location = useLocation();

  const refresh = () => me().then(setUser);
  useEffect(() => { refresh(); }, []);
  // Seitenaufrufe für die Nutzungs-Heatmap erfassen.
  useEffect(() => { track(`page${location.pathname.replace(/\//g, '.') || '.home'}`); }, [location.pathname]);

  const logout = () => { clearToken(); setUser(null); toast.info('Abgemeldet', 'Du wurdest sicher abgemeldet.'); };

  const paletteActions = user
    ? [{ id: 'logout', label: 'Abmelden', ico: '🚪', action: logout }]
    : [{ id: 'login', label: 'Anmelden', ico: '🔑', action: () => (window.location.href = '/login') }];

  return (
    <div className="app">
      <ProgressBar />
      <CommandPalette actions={paletteActions} />
      <Toasts />
      <aside className="sidebar">
        <div className="brand">Le<span>co</span></div>
        <div className="tagline">Reinigungs-Imperium · Linz</div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ico">{n.ico}</span>{n.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ico">🛡️</span>Admin
            </NavLink>
          )}
        </nav>

        <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem', fontSize: '.8rem' }}>
          {user ? (
            <div>
              <div className="muted">{user.email}</div>
              <div className="muted" style={{ fontSize: '.72rem' }}>
                {user.role}{user.mfa_enabled ? ' · MFA ✅' : ''}
              </div>
              <button onClick={logout} style={{ marginTop: '.4rem', width: '100%' }}>Abmelden</button>
            </div>
          ) : (
            <NavLink to="/login"><button className="primary" style={{ width: '100%' }}>Anmelden</button></NavLink>
          )}
          <div className="kbd-hint"><kbd>Strg</kbd>+<kbd>K</kbd> Befehle · <kbd>?</kbd> Hilfe</div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/unternehmen" element={<Companies />} />
          <Route path="/kunden" element={<Customers />} />
          <Route path="/mitarbeiter" element={<Employees />} />
          <Route path="/uebernahme" element={<Merger />} />
          <Route path="/uebernahme/:companyId" element={<Merger />} />
          <Route path="/import" element={<Import />} />
          <Route path="/ki-team" element={<AgiTeam />} />
          <Route path="/login" element={<Login onAuth={refresh} />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}
