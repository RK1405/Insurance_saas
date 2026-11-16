import { compactMoney } from '../api.js';

export const PIPELINE = [
  { key: 'quoted', label: 'Quoted', color: 'var(--info)' },
  { key: 'referred', label: 'Referred', color: 'var(--warn)' },
  { key: 'approved', label: 'Approved', color: '#7c3aed' },
  { key: 'issued', label: 'Issued', color: 'var(--primary)' },
  { key: 'declined', label: 'Declined', color: 'var(--bad)' },
  { key: 'expired', label: 'Expired', color: 'var(--muted)' },
];

/**
 * Monthly quote pipeline: one stacked bar per month, each segment a quote status,
 * with premium issued as a line on the right axis. Pure SVG, no chart library.
 */
export function PipelineChart({ data }) {
  if (!data?.length) return <div className="empty">No activity in this period yet.</div>;
  const W = 640; const H = 240; const pad = { l: 34, r: 56, t: 16, b: 26 };
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const maxQ = Math.max(1, ...data.map((d) => d.quotes));
  const maxG = Math.max(1, ...data.map((d) => d.gwp));
  const gw = iw / data.length; const bw = Math.min(46, gw * 0.55);
  const yq = (v) => (v / maxQ) * ih;
  const yg = (v) => pad.t + ih - (v / maxG) * ih;
  const cx = (i) => pad.l + gw * i + gw / 2;
  const label = (m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  const used = PIPELINE.filter((s) => data.some((d) => d[s.key] > 0));

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly quotes by status, with premium issued">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - t)} y2={pad.t + ih * (1 - t)} stroke="var(--border)" />
            <text x={pad.l - 6} y={pad.t + ih * (1 - t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(maxQ * t * 10) / 10}</text>
            <text x={W - pad.r + 6} y={pad.t + ih * (1 - t) + 4} fontSize="10" fill="var(--muted)">{compactMoney(maxG * t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          let y = pad.t + ih;
          return (
            <g key={d.month}>
              {PIPELINE.map((s) => {
                const h = yq(d[s.key] || 0);
                if (!h) return null;
                y -= h;
                return (
                  <rect key={s.key} x={cx(i) - bw / 2} y={y} width={bw} height={Math.max(h - 1, 1)} fill={s.color}>
                    <title>{`${s.label}: ${d[s.key]}`}</title>
                  </rect>
                );
              })}
              <text x={cx(i)} y={pad.t + ih - yq(d.quotes) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">{d.quotes}</text>
              <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{label(d.month)}</text>
            </g>
          );
        })}
        {data.length > 1 && <polyline points={data.map((d, i) => `${cx(i)},${yg(d.gwp)}`).join(' ')} fill="none" stroke="var(--text)" strokeWidth="2" strokeDasharray="4 3" />}
        {data.map((d, i) => <circle key={d.month} cx={cx(i) + bw / 2 + 8} cy={yg(d.gwp)} r="4" fill="var(--text)"><title>{`Premium issued: ${compactMoney(d.gwp)}`}</title></circle>)}
      </svg>
      <div className="legend">
        {used.map((s) => <span key={s.key} style={{ '--c': s.color }}>{s.label}</span>)}
        <span style={{ '--c': 'var(--text)' }}>Premium issued (right axis)</span>
      </div>
    </div>
  );
}

/** Horizontal bars, one per pipeline status. */
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
