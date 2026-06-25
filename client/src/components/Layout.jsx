import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isManager = user?.role === 'manager';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const managerLinks = [
    { to: '/', icon: '📊', label: 'Dashboard', end: true },
    { to: '/schedule', icon: '📅', label: 'Schedule' },
    { to: '/employees', icon: '👥', label: 'Employees' },
    { to: '/account', icon: '👤', label: 'Account' },
  ];

  const employeeLinks = [
    { to: '/', icon: '📅', label: 'Availability', end: true },
    { to: '/schedule', icon: '🗓', label: 'My Schedule' },
    { to: '/account', icon: '👤', label: 'Account' },
  ];

  const links = isManager ? managerLinks : employeeLinks;

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">🐯 Scheduler</div>
          <div className="logo-sub">Easley</div>
        </div>

        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <span className="nav-icon">{l.icon}</span> {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 8, paddingLeft: 10 }}>
            Signed in as <strong style={{ color: 'rgba(255,255,255,.7)' }}>{user?.name}</strong>
          </div>
          <button className="nav-item" onClick={handleLogout} style={{ color: 'rgba(255,255,255,.5)' }}>
            <span className="nav-icon">↩</span> Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'bottom-nav-item' + (isActive ? ' active' : '')}>
            <span className="bottom-nav-icon">{l.icon}</span>
            <span className="bottom-nav-label">{l.label}</span>
          </NavLink>
        ))}
        <button className="bottom-nav-item" onClick={handleLogout}>
          <span className="bottom-nav-icon">↩</span>
          <span className="bottom-nav-label">Sign Out</span>
        </button>
      </nav>
    </div>
  );
}
