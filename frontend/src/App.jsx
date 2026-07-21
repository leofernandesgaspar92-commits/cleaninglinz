import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Companies from './pages/Companies.jsx';
import Customers from './pages/Customers.jsx';
import Employees from './pages/Employees.jsx';
import Merger from './pages/Merger.jsx';
import Import from './pages/Import.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', ico: '🗺️', end: true },
  { to: '/unternehmen', label: 'Unternehmen', ico: '🏢' },
  { to: '/kunden', label: 'Kunden', ico: '📋' },
  { to: '/mitarbeiter', label: 'Mitarbeiter', ico: '👷' },
  { to: '/uebernahme', label: 'Übernahme', ico: '⚡' },
  { to: '/import', label: 'Import', ico: '📥' },
];

export default function App() {
  return (
    <div className="app">
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
        </nav>
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
        </Routes>
      </main>
    </div>
  );
}
