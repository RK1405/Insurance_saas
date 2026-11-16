import { compactMoney } from '../api.js';

/** Grouped monthly bars: quotes vs issued, with GWP as a line. Pure SVG, no chart library. */
export function MonthlyChart({ data }) {
  if (!data?.length) return <div className="empty">No activity in this period yet.</div>;
  const W = 640; const H = 220; const pad = { l: 34, r: 48, t: 12, b: 26 };
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const maxQ = Math.max(1, ...data.map((d) => d.quotes));
  const maxG = Math.max(1, ...data.map((d) => d.gwp));
  const gw = iw / data.length; const bw = Math.min(22, gw / 3);
  const y = (v) => pad.t + ih - (v / maxQ) * ih;
  const yg = (v) => pad.t + ih - (v / maxG) * ih;
  const pts = data.map((d, i) => `${pad.l + gw * i + gw / 2},${yg(d.gwp)}`).join(' ');
  const label = (m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short' });
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly quotes, policies issued and premium">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - t)} y2={pad.t + ih * (1 - t)} stroke="var(--border)" />
            <text x={pad.l - 6} y={pad.t + ih * (1 - t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(maxQ * t)}</text>
            <text x={W - pad.r + 6} y={pad.t + ih * (1 - t) + 4} fontSize="10" fill="var(--muted)">{compactMoney(maxG * t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + gw * i + gw / 2;
          return (
            <g key={d.month}>
              <rect x={cx - bw - 1} y={y(d.quotes)} width={bw} height={pad.t + ih - y(d.quotes)} rx="3" fill="var(--border)"><title>{`${d.quotes} quotes`}</title></rect>
              <rect x={cx + 1} y={y(d.issued)} width={bw} height={pad.t + ih - y(d.issued)} rx="3" fill="var(--primary)"><title>{`${d.issued} policies`}</title></rect>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(d.month)}</text>
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {data.map((d, i) => <circle key={d.month} cx={pad.l + gw * i + gw / 2} cy={yg(d.gwp)} r="3.5" fill="var(--accent)"><title>{compactMoney(d.gwp)}</title></circle>)}
      </svg>
      <div className="legend">
        <span style={{ '--c': 'var(--border)' }}>Quotes</span>
        <span style={{ '--c': 'var(--primary)' }}>Policies issued</span>
        <span style={{ '--c': 'var(--accent)' }}>Premium (right axis)</span>
      </div>
    </div>
  );
}

export function Bars({ rows, format = (v) => v }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="small">{r.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span className="small num right">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
