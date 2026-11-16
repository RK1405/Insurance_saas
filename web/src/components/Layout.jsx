import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api, LINE_LABEL, ROLE_LABEL } from '../api.js';
import { useAuth } from '../auth.jsx';

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const I = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  family: 'M7 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm10 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 2.5-5 5-5s5 2 5 5m0 0c0-3 2.5-5 5-5s5 2 5 5',
  biz: 'M3 21V7l9-4 9 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  flag: 'M4 21V4m0 0h12l-2 4 2 4H4',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
};

export default function Layout({ children }) {
  const { user, org, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [referred, setReferred] = useState(0);
  const loc = useLocation();
  const isStaff = user.role !== 'agent';

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!isStaff) return;
    api.get('/quotes?status=referred').then((d) => setReferred(d.quotes.length)).catch(() => {});
  }, [isStaff, loc.pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Icon d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" /></span>HealthStack
        </div>
        <nav className="nav">
          <NavLink to="/" end><Icon d={I.home} />Dashboard</NavLink>
          <div className="nav-section">New quote</div>
          {user.lines.includes('retail') && <NavLink to="/quotes/new/retail"><Icon d={I.family} />Individual &amp; Family</NavLink>}
          {user.lines.includes('sme') && <NavLink to="/quotes/new/sme"><Icon d={I.biz} />Small Business</NavLink>}
          <div className="nav-section">Work</div>
          <NavLink to="/quotes" end><Icon d={I.list} />Quotes</NavLink>
          {isStaff && <NavLink to="/underwriting"><Icon d={I.flag} />Underwriting{referred > 0 && <span className="count">{referred}</span>}</NavLink>}
          <NavLink to="/policies"><Icon d={I.shield} />Policies</NavLink>
          <NavLink to="/products"><Icon d={I.box} />Products</NavLink>
          <NavLink to="/settings"><Icon d={I.gear} />Settings</NavLink>
        </nav>
        <div className="sidebar-foot small">
          <div style={{ fontWeight: 600 }}>{org.name}</div>
          <div className="muted">Org code {org.code}</div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="btn sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Open menu">☰</button>
            <div className="row" style={{ gap: 6 }}>
              {user.lines.map((l) => <span key={l} className="badge brand">{LINE_LABEL[l]}</span>)}
            </div>
          </div>
          <div className="row">
            <div className="right small">
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="muted">{ROLE_LABEL[user.role]}</div>
            </div>
            <button className="btn sm" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
