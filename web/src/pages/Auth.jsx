import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

function AuthShell({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="brand" style={{ color: '#fff', padding: 0 }}>
          <span className="brand-mark" style={{ background: '#fff', color: '#0f766e' }}>✚</span>HealthStack
        </div>
        <div>
          <h1>Health insurance underwriting &amp; distribution, in the cloud.</h1>
          <ul>
            <li>Individual &amp; family floater quotes in under a minute</li>
            <li>Digital health underwriting with straight-through approval</li>
            <li>SME group health with census upload</li>
            <li>IRDAI-aware product configurator and compliance checks</li>
          </ul>
        </div>
        <div className="small" style={{ color: '#a7e3da' }}>Secure, multi-tenant SaaS · Hosted in India</div>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}

export function Login() {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post('/auth/login', form);
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form className="card card-pad stack" onSubmit={submit}>
        <div>
          <h1>Sign in</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Welcome back. Enter your work email and password.</p>
        </div>
        <ErrorBox error={error} />
        <Field label="Work email"><input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted" style={{ margin: 0 }}>New organisation? <Link to="/register">Create an account</Link></p>
      </form>
    </AuthShell>
  );
}

const LINES = [
  { id: 'retail', title: 'Individual & Family Health', desc: 'Retail policies: individual and family floater, digital health declaration.' },
  { id: 'sme', title: 'Small Business Health', desc: 'Group cover for 7+ employees, census upload, categories.' },
];

export function LinePicker({ value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="choice-grid">
      {LINES.map((l) => (
        <button type="button" key={l.id} className={`choice ${value.includes(l.id) ? 'selected' : ''}`} onClick={() => toggle(l.id)} aria-pressed={value.includes(l.id)}>
          <input type="checkbox" readOnly checked={value.includes(l.id)} tabIndex={-1} />
          <div><div className="title">{l.title}</div><div className="desc">{l.desc}</div></div>
        </button>
      ))}
    </div>
  );
}

export function Register() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ orgName: '', orgType: 'insurer', name: '', email: '', password: '', lines: ['retail', 'sme'] });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post('/auth/register', form);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form className="card card-pad stack" onSubmit={submit} style={{ maxWidth: 520 }}>
        <div>
          <h1>Create your organisation</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>You will be the admin. Starter products are set up for you.</p>
        </div>
        <ErrorBox error={error} />
        <div className="grid g2">
          <Field label="Organisation name"><input required value={form.orgName} onChange={set('orgName')} placeholder="Acme General Insurance" /></Field>
          <Field label="Organisation type">
            <select value={form.orgType} onChange={set('orgType')}>
              <option value="insurer">Insurer</option>
              <option value="broker">Insurance broker</option>
              <option value="corporate_agent">Corporate agent / bancassurance</option>
              <option value="tpa">TPA</option>
            </select>
          </Field>
          <Field label="Your name"><input required value={form.name} onChange={set('name')} /></Field>
          <Field label="Work email"><input type="email" required autoComplete="username" value={form.email} onChange={set('email')} /></Field>
          <Field label="Password" hint="At least 8 characters" className="span2"><input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <strong>Which kinds of insurance do you work on?</strong>
          <LinePicker value={form.lines} onChange={(lines) => setForm({ ...form, lines })} />
        </div>
        <button className="btn primary" disabled={busy || !form.lines.length}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="small muted" style={{ margin: 0 }}>Already have an account? <Link to="/">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ChangePassword({ forced, onDone }) {
  const { refresh, logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) return setError(new Error('New passwords do not match'));
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setOk(true);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      await refresh();
      onDone?.();
    } catch (err) {
      setError(err);
    }
  };

  const body = (
    <form className="card card-pad stack" onSubmit={submit} style={{ maxWidth: 440 }}>
      <div>
        <h2>{forced ? 'Set a new password' : 'Change password'}</h2>
        {forced && <p className="muted" style={{ margin: '4px 0 0' }}>Your admin gave you a temporary password. Choose your own to continue.</p>}
      </div>
      <ErrorBox error={error} />
      {ok && <div className="alert ok">Password updated.</div>}
      <Field label={forced ? 'Temporary password' : 'Current password'}><input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
      <Field label="New password" hint="At least 8 characters"><input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
      <Field label="Confirm new password"><input type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
      <div className="row">
        <button className="btn primary">Update password</button>
        {forced && <button type="button" className="btn ghost" onClick={logout}>Sign out</button>}
      </div>
    </form>
  );
  return forced ? <AuthShell>{body}</AuthShell> : body;
}
