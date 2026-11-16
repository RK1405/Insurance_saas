import { useEffect, useState } from 'react';
import { LINE_LABEL, money, titleCase } from '../api.js';

export function Page({ title, subtitle, actions, children }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </>
  );
}

export function Card({ title, actions, children, pad = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert bad" role="alert">
      {error.message || String(error)}
      {error.issues?.length > 0 && (
        <ul>{error.issues.slice(0, 8).map((i) => <li key={i.path + i.message}>{i.path ? `${prettyPath(i.path)}: ` : ''}{i.message}</li>)}</ul>
      )}
    </div>
  );
}

const prettyPath = (p) => p.split('.').map((s) => (/^\d+$/.test(s) ? `#${Number(s) + 1}` : titleCase(s.replace(/([A-Z])/g, ' $1')))).join(' › ');

const STATUS_TONE = {
  quoted: 'info', referred: 'warn', approved: 'ok', declined: 'bad', issued: 'ok', expired: '',
  active: 'ok', cancelled: 'bad', free_look_cancelled: 'warn', published: 'ok', draft: 'info', archived: '',
  accept: 'ok', accept_with_loading: 'info', refer: 'warn', decline: 'bad',
};

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{titleCase(status)}</span>;
}

export const LineBadge = ({ line }) => <span className="badge brand">{LINE_LABEL[line] || line}</span>;

export function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export const Money = ({ value, decimals }) => <span className="num">{money(value, decimals)}</span>;

export function Loading() {
  return <div className="empty"><span className="spinner" /></div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** Small data-loading hook: returns { data, error, loading, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function Steps({ steps, current }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={s} className={`step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}>
          <span className="dot">{i < current ? '✓' : i + 1}</span>{s}
        </div>
      ))}
    </div>
  );
}
