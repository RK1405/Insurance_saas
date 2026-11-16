import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtDateTime, LINE_LABEL, ROLE_LABEL, siLabel, titleCase } from '../api.js';
import { applyTheme, useAuth } from '../auth.jsx';
import { Card, ErrorBox, Field, Loading, Page, Toast, useLoad } from '../components/ui.jsx';
import { ChangePassword, LinePicker } from './Auth.jsx';

export default function Settings() {
  const { tab = 'preferences' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tabs = [
    ['preferences', 'My preferences'],
    ['security', 'Password'],
    ...(user.role !== 'agent' ? [['rules', 'Underwriting & workflow']] : []),
    ...(user.role === 'admin' ? [['team', 'Team'], ['integrations', 'Integrations & API'], ['audit', 'Audit log']] : []),
  ];
  return (
    <Page title="Settings">
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => navigate(`/settings/${k}`)}>{label}</button>)}
      </div>
      {tab === 'preferences' && <Preferences />}
      {tab === 'security' && <ChangePassword />}
      {tab === 'rules' && user.role !== 'agent' && <Rules readOnly={user.role !== 'admin'} />}
      {tab === 'team' && user.role === 'admin' && <Team />}
      {tab === 'integrations' && user.role === 'admin' && <Integrations />}
      {tab === 'audit' && user.role === 'admin' && <Audit />}
    </Page>
  );
}

function Preferences() {
  const { user, setUser } = useAuth();
  const [lines, setLines] = useState(user.lines);
  const [prefs, setPrefs] = useState({ theme: 'system', defaultCityTier: 1, defaultSumInsured: 1000000, defaultCoverType: 'floater', dashboardRangeDays: 180, ...user.preferences });
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const save = async () => {
    setError(null);
    try {
      const { favoriteProductIds, ...rest } = prefs;
      const r = await api.put('/me/preferences', { lines, preferences: { ...rest, defaultLine: lines.includes(prefs.defaultLine) ? prefs.defaultLine : lines[0] } });
      setUser(r.user);
      setToast('Preferences saved');
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Toast message={toast} onDone={() => setToast(null)} />
      <ErrorBox error={error} />
      <Card title="My kinds of insurance">
        <p className="small muted" style={{ marginTop: 0 }}>Your menus, dashboards, quotes and products only show the lines you choose here.</p>
        <LinePicker value={lines} onChange={setLines} />
      </Card>
      <Card title="My quoting defaults">
        <div className="grid g2">
          <Field label="Default sum insured (Individual & Family)">
            <select value={prefs.defaultSumInsured} onChange={(e) => setPrefs({ ...prefs, defaultSumInsured: Number(e.target.value) })}>
              {[300000, 500000, 1000000, 1500000, 2500000, 5000000, 10000000].map((s) => <option key={s} value={s}>{siLabel(s)}</option>)}
            </select>
          </Field>
          <Field label="Default cover type">
            <select value={prefs.defaultCoverType} onChange={(e) => setPrefs({ ...prefs, defaultCoverType: e.target.value })}>
              <option value="floater">Family floater</option><option value="individual">Individual</option>
            </select>
          </Field>
          <Field label="Default city tier" hint="Where most of your customers are">
            <select value={prefs.defaultCityTier} onChange={(e) => setPrefs({ ...prefs, defaultCityTier: Number(e.target.value) })}>
              <option value={1}>Tier 1 (metro)</option><option value={2}>Tier 2</option><option value={3}>Tier 3 / rural</option>
            </select>
          </Field>
          <Field label="Home line">
            <select value={prefs.defaultLine || lines[0]} onChange={(e) => setPrefs({ ...prefs, defaultLine: e.target.value })}>
              {lines.map((l) => <option key={l} value={l}>{LINE_LABEL[l]}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Display">
        <div className="grid g2">
          <Field label="Theme">
            <select value={prefs.theme} onChange={(e) => { setPrefs({ ...prefs, theme: e.target.value }); applyTheme(e.target.value); }}>
              <option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Dashboard period">
            <select value={prefs.dashboardRangeDays} onChange={(e) => setPrefs({ ...prefs, dashboardRangeDays: Number(e.target.value) })}>
              <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 6 months</option><option value={365}>Last 12 months</option>
            </select>
          </Field>
        </div>
      </Card>
      <div><button className="btn primary" onClick={save} disabled={!lines.length}>Save preferences</button></div>
    </div>
  );
}

const ACTIONS = ['accept', 'load', 'refer', 'decline'];

function Rules({ readOnly }) {
  const { data, error, loading } = useLoad(() => Promise.all([api.get('/settings'), api.get('/settings/meta')]));
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => { if (data) setS(data[0].settings); }, [data]);
  if (loading || !s) return error ? <ErrorBox error={error} /> : <Loading />;
  const meta = data[1];
  const uw = s.underwriting;
  const setUw = (patch) => setS({ ...s, underwriting: { ...uw, ...patch } });
  const setCond = (code, patch) => setUw({ conditions: { ...uw.conditions, [code]: { ...uw.conditions[code], ...patch } } });
  const n = (v) => Number(v);

  const save = async () => {
    setErr(null);
    try {
      const r = await api.put('/settings', s);
      setS(r.settings);
      setToast('Rules saved. They apply to new quotes immediately.');
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, maxWidth: 980 }} className="stack">
      <Toast message={toast} onDone={() => setToast(null)} />
      <ErrorBox error={err} />
      {readOnly && <div className="alert info">Only admins can change these rules.</div>}
      <Card title="Digital underwriting: thresholds">
        <div className="grid g4">
          <Field label="BMI: standard from"><input type="number" value={uw.bmi.min} onChange={(e) => setUw({ bmi: { ...uw.bmi, min: n(e.target.value) } })} /></Field>
          <Field label="BMI: standard up to"><input type="number" value={uw.bmi.max} onChange={(e) => setUw({ bmi: { ...uw.bmi, max: n(e.target.value) } })} /></Field>
          <Field label="BMI: load up to" hint="Above this: refer"><input type="number" value={uw.bmi.loadUpTo} onChange={(e) => setUw({ bmi: { ...uw.bmi, loadUpTo: n(e.target.value) } })} /></Field>
          <Field label="BMI loading %"><input type="number" value={uw.bmi.loadingPct} onChange={(e) => setUw({ bmi: { ...uw.bmi, loadingPct: n(e.target.value) } })} /></Field>
          <Field label="Tobacco loading %"><input type="number" value={uw.smokerLoadingPct} onChange={(e) => setUw({ smokerLoadingPct: n(e.target.value) })} /></Field>
          <Field label="Refer above age" hint="Pre-policy medicals"><input type="number" value={uw.referAboveAge} onChange={(e) => setUw({ referAboveAge: n(e.target.value) })} /></Field>
          <Field label="Auto-approve up to sum insured (₹)"><input type="number" value={uw.autoApproveMaxSumInsured} onChange={(e) => setUw({ autoApproveMaxSumInsured: n(e.target.value) })} /></Field>
          <Field label="Max automatic loading %"><input type="number" value={uw.maxAutoLoadingPct} onChange={(e) => setUw({ maxAutoLoadingPct: n(e.target.value) })} /></Field>
          <Field label="Hospitalised in last 3 years">
            <select value={uw.hospitalisedLast3YearsAction} onChange={(e) => setUw({ hospitalisedLast3YearsAction: e.target.value })}>
              <option value="refer">Refer to underwriter</option><option value="accept">Accept</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Medical conditions" pad={false}>
        <table className="table">
          <thead><tr><th>Condition</th><th>Action</th><th>Loading %</th><th>Treat as pre-existing disease</th></tr></thead>
          <tbody>{meta.conditions.map((c) => {
            const r = uw.conditions[c.code] || { action: 'refer' };
            return (
              <tr key={c.code}>
                <td>{c.label}</td>
                <td><select value={r.action} onChange={(e) => setCond(c.code, { action: e.target.value })}>{ACTIONS.map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}</select></td>
                <td><input type="number" disabled={r.action !== 'load'} value={r.loadingPct || 0} onChange={(e) => setCond(c.code, { loadingPct: n(e.target.value) })} /></td>
                <td><input type="checkbox" checked={!!r.ped} onChange={(e) => setCond(c.code, { ped: e.target.checked })} aria-label={`${c.label} is PED`} /></td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      <Card title="Small Business group underwriting">
        <div className="grid g4">
          <Field label="Refer groups smaller than (lives)"><input type="number" value={uw.sme.referBelowLives} onChange={(e) => setUw({ sme: { ...uw.sme, referBelowLives: n(e.target.value) } })} /></Field>
          <Field label="Load if average age above"><input type="number" value={uw.sme.avgAgeLoadingAbove} onChange={(e) => setUw({ sme: { ...uw.sme, avgAgeLoadingAbove: n(e.target.value) } })} /></Field>
          <Field label="Average-age loading %"><input type="number" value={uw.sme.avgAgeLoadingPct} onChange={(e) => setUw({ sme: { ...uw.sme, avgAgeLoadingPct: n(e.target.value) } })} /></Field>
          <Field label="Max parents share %"><input type="number" value={uw.sme.maxParentsSharePct} onChange={(e) => setUw({ sme: { ...uw.sme, maxParentsSharePct: n(e.target.value) } })} /></Field>
        </div>
      </Card>
      <Card title="Workflow & tax">
        <div className="grid g4">
          <Field label="Quote validity (days)"><input type="number" value={s.workflow.quoteValidityDays} onChange={(e) => setS({ ...s, workflow: { ...s.workflow, quoteValidityDays: n(e.target.value) } })} /></Field>
          <Field label="GST on retail health (%)" hint="Exempt from 22 Sep 2025"><input type="number" value={s.gst.retail} onChange={(e) => setS({ ...s, gst: { ...s.gst, retail: n(e.target.value) } })} /></Field>
          <Field label="GST on group health (%)"><input type="number" value={s.gst.sme} onChange={(e) => setS({ ...s, gst: { ...s.gst, sme: n(e.target.value) } })} /></Field>
          <div className="stack" style={{ gap: 6, justifyContent: 'end' }}>
            <label className="check"><input type="checkbox" checked={s.workflow.agentsCanIssue} onChange={(e) => setS({ ...s, workflow: { ...s.workflow, agentsCanIssue: e.target.checked } })} />Agents can issue policies</label>
            <label className="check"><input type="checkbox" checked={s.workflow.requirePaymentReference} onChange={(e) => setS({ ...s, workflow: { ...s.workflow, requirePaymentReference: e.target.checked } })} />Require payment reference</label>
          </div>
        </div>
      </Card>
      {!readOnly && <div><button className="btn primary" onClick={save}>Save rules</button></div>}
    </fieldset>
  );
}

function Team() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api.get('/users'));
  const [form, setForm] = useState({ name: '', email: '', role: 'agent', lines: ['retail'] });
  const [secret, setSecret] = useState(null);
  const [err, setErr] = useState(null);

  const invite = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api.post('/users', form);
      setSecret({ email: r.user.email, password: r.temporaryPassword });
      setForm({ name: '', email: '', role: 'agent', lines: ['retail'] });
      reload();
    } catch (e2) { setErr(e2); }
  };
  const patch = async (id, body) => { try { await api.patch(`/users/${id}`, body); reload(); } catch (e) { setErr(e); } };
  const reset = async (u) => {
    if (!window.confirm(`Reset password for ${u.email}?`)) return;
    const r = await api.post(`/users/${u.id}/reset-password`);
    setSecret({ email: u.email, password: r.temporaryPassword });
  };

  return (
    <div className="stack">
      <ErrorBox error={error || err} />
      {secret && (
        <div className="alert ok">
          Temporary password for {secret.email}: <span className="code">{secret.password}</span>. Share it securely; they must change it at first sign-in. It will not be shown again.
          <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setSecret(null)}>Done</button>
        </div>
      )}
      <form className="card card-pad stack" onSubmit={invite}>
        <h2>Add a team member</h2>
        <div className="grid g4">
          <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Lines of business">
            <select value={form.lines.join(',')} onChange={(e) => setForm({ ...form, lines: e.target.value.split(',') })}>
              <option value="retail">Individual &amp; Family only</option><option value="sme">Small Business only</option><option value="retail,sme">Both</option>
            </select>
          </Field>
        </div>
        <div><button className="btn primary">Add member</button></div>
      </form>
      <Card pad={false}>
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Lines</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
              <tbody>{data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}<div className="small muted">{u.email}</div></td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label="Role">
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={u.lines.slice().sort().join(',')} onChange={(e) => patch(u.id, { lines: e.target.value.split(',') })} aria-label="Lines">
                      <option value="retail">Individual &amp; Family</option><option value="sme">Small Business</option><option value="retail,sme">Both</option>
                    </select>
                  </td>
                  <td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}{u.must_change_password && <div className="badge warn">Temp password</div>}</td>
                  <td>{u.active ? <span className="badge ok">Active</span> : <span className="badge">Disabled</span>}</td>
                  <td className="nowrap right">
                    {u.id !== me.id && <button className="btn sm" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button>}{' '}
                    <button className="btn sm" onClick={() => reset(u)}>Reset password</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Integrations() {
  const keys = useLoad(() => api.get('/integrations/keys'));
  const hooks = useLoad(() => api.get('/integrations/webhooks'));
  const meta = useLoad(() => api.get('/settings/meta'));
  const [keyName, setKeyName] = useState('');
  const [secret, setSecret] = useState(null);
  const [hook, setHook] = useState({ url: '', events: ['policy.issued'] });
  const [err, setErr] = useState(null);
  const origin = window.location.origin;

  const createKey = async (e) => {
    e.preventDefault(); setErr(null);
    try { const r = await api.post('/integrations/keys', { name: keyName }); setSecret({ label: 'API key', value: r.secret }); setKeyName(''); keys.reload(); } catch (e2) { setErr(e2); }
  };
  const createHook = async (e) => {
    e.preventDefault(); setErr(null);
    try { const r = await api.post('/integrations/webhooks', hook); setSecret({ label: 'Webhook signing secret', value: r.secret }); setHook({ url: '', events: ['policy.issued'] }); hooks.reload(); } catch (e2) { setErr(e2); }
  };

  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <ErrorBox error={err} />
      {secret && <div className="alert ok">{secret.label}: <span className="code">{secret.value}</span>. Copy it now; it will not be shown again. <button className="btn sm" onClick={() => setSecret(null)}>Done</button></div>}
      <Card title="API keys" pad={false}>
        <form className="card-pad row" onSubmit={createKey}>
          <input required placeholder="Key name, e.g. Bank partner portal" value={keyName} onChange={(e) => setKeyName(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn primary">Create key</button>
        </form>
        <table className="table">
          <thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th /></tr></thead>
          <tbody>
            {keys.data?.keys.length === 0 && <tr><td colSpan={5} className="muted">No keys yet.</td></tr>}
            {keys.data?.keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td><td><span className="code">{k.prefix}…</span></td><td className="small">{fmtDateTime(k.created_at)}</td><td className="small">{k.last_used_at ? fmtDateTime(k.last_used_at) : 'Never'}</td>
                <td className="right">{k.revoked_at ? <span className="badge">Revoked</span> : <button className="btn sm danger" onClick={async () => { await api.del(`/integrations/keys/${k.id}`); keys.reload(); }}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Partner API: quick start">
        <p className="small muted" style={{ marginTop: 0 }}>Let banks, aggregators, HRMS or your own apps quote and issue through REST. Send the key in the <span className="code">x-api-key</span> header.</p>
        <pre className="code">{`GET  ${origin}/api/v1/products
POST ${origin}/api/v1/quotes/retail      # same body as the portal quote
POST ${origin}/api/v1/quotes/sme
GET  ${origin}/api/v1/quotes/{quoteNumber}
POST ${origin}/api/v1/quotes/{quoteNumber}/issue
     {"startDate":"2026-12-01","payment":{"method":"upi","reference":"UTR123"}}`}</pre>
      </Card>
      <Card title="Webhooks" pad={false}>
        <form className="card-pad stack" onSubmit={createHook}>
          <Field label="Endpoint URL (https)"><input required type="url" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} placeholder="https://your-system.example.com/hooks/healthstack" /></Field>
          <div className="row">
            {meta.data?.webhookEvents.map((ev) => (
              <label key={ev} className="check small"><input type="checkbox" checked={hook.events.includes(ev)} onChange={(e) => setHook({ ...hook, events: e.target.checked ? [...hook.events, ev] : hook.events.filter((x) => x !== ev) })} />{ev}</label>
            ))}
          </div>
          <div><button className="btn primary">Add webhook</button></div>
          <span className="small muted">Each delivery is signed: verify the <span className="code">x-healthstack-signature</span> header (HMAC-SHA256 of the body with your secret).</span>
        </form>
        <table className="table">
          <thead><tr><th>URL</th><th>Events</th><th>Recent deliveries</th><th /></tr></thead>
          <tbody>
            {hooks.data?.webhooks.length === 0 && <tr><td colSpan={4} className="muted">No webhooks yet.</td></tr>}
            {hooks.data?.webhooks.map((w) => (
              <tr key={w.id}>
                <td className="small" style={{ wordBreak: 'break-all' }}>{w.url}</td>
                <td className="small">{w.events.join(', ')}</td>
                <td className="small">{(w.recent || []).map((d, i) => <div key={i}><span className={`badge ${d.status_code >= 200 && d.status_code < 300 ? 'ok' : 'bad'}`}>{d.status_code || 'ERR'}</span> {d.event} · {fmtDateTime(d.at)}</div>)}{!w.recent && <span className="muted">None yet</span>}</td>
                <td className="right"><button className="btn sm danger" onClick={async () => { await api.del(`/integrations/webhooks/${w.id}`); hooks.reload(); }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Audit() {
  const { data, error } = useLoad(() => api.get('/audit'));
  return (
    <Card pad={false}>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>{data.events.map((a) => (
              <tr key={a.id}>
                <td className="small nowrap">{fmtDateTime(a.at)}</td>
                <td>{a.user_name || 'System / API'}</td>
                <td><span className="code">{a.action}</span></td>
                <td className="small" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{a.details ? JSON.stringify(a.details) : ''}</td>
                <td className="small muted">{a.ip}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
