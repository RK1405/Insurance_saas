import { Link } from 'react-router-dom';
import { api, compactMoney, LINE_LABEL, money, titleCase } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Bars, MonthlyChart } from '../components/Charts.jsx';
import { Card, ErrorBox, Loading, Page, Stat, useLoad } from '../components/ui.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const days = user.preferences?.dashboardRangeDays || 180;
  const { data, error, loading } = useLoad(() => api.get(`/analytics/summary?days=${days}`), [days]);
  const first = user.name.split(' ')[0];

  const actions = (
    <>
      {user.lines.includes('retail') && <Link className="btn primary" to="/quotes/new/retail">+ Individual &amp; Family quote</Link>}
      {user.lines.includes('sme') && <Link className="btn" to="/quotes/new/sme">+ Small Business quote</Link>}
    </>
  );

  return (
    <Page
      title={`Namaste, ${first}`}
      subtitle={`${user.role === 'agent' ? 'Your' : 'Team'} performance over the last ${days} days · ${user.lines.map((l) => LINE_LABEL[l]).join(' + ')}`}
      actions={actions}
    >
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="stack">
          {data.pendingReferrals > 0 && (
            <div className="alert warn row" style={{ justifyContent: 'space-between' }}>
              <span>{data.pendingReferrals} quote{data.pendingReferrals > 1 ? 's are' : ' is'} waiting for an underwriting decision.</span>
              <Link to="/underwriting" className="btn sm">Open queue</Link>
            </div>
          )}
          <div className="grid g4">
            <Stat label="Premium written (GWP)" value={compactMoney(data.totals.gwp)} sub={`${data.totals.issued} ${data.totals.issued === 1 ? 'policy' : 'policies'} · ${data.totals.lives} lives`} />
            <Stat label="Quotes" value={data.totals.quotes} sub={`${data.totals.conversionPct}% converted to policy`} />
            <Stat label="Straight-through rate" value={`${data.totals.stpPct}%`} sub="Auto-approved by digital underwriting" />
            <Stat label="Avg. quote → policy" value={data.totals.avgIssueHours < 1 ? '< 1 h' : `${data.totals.avgIssueHours} h`} sub={`Avg premium ${money(data.totals.avg_premium)}`} />
          </div>
          <div className="grid g3">
            <Card title="Monthly trend" className="span2"><MonthlyChart data={data.monthly} /></Card>
            <Card title="Quote pipeline">
              <Bars
                rows={['quoted', 'referred', 'approved', 'issued', 'declined', 'expired'].map((s) => ({
                  label: titleCase(s),
                  value: data.byStatus.find((b) => b.status === s)?.count || 0,
                  color: s === 'declined' ? 'var(--bad)' : s === 'referred' ? 'var(--warn)' : undefined,
                }))}
              />
            </Card>
          </div>
          <div className="grid g2">
            <Card title="By line of business" pad={false}>
              <table className="table">
                <thead><tr><th>Line</th><th className="right">Quotes</th><th className="right">Policies</th><th className="right">GWP</th></tr></thead>
                <tbody>
                  {data.byLine.length === 0 && <tr><td colSpan={4} className="muted">No quotes yet.</td></tr>}
                  {data.byLine.map((l) => (
                    <tr key={l.line}><td>{LINE_LABEL[l.line]}</td><td className="right num">{l.quotes}</td><td className="right num">{l.issued}</td><td className="right num">{money(l.gwp)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {user.role !== 'agent' && (
              <Card title="Top producers" pad={false}>
                <table className="table">
                  <thead><tr><th>Name</th><th className="right">Quotes</th><th className="right">Policies</th><th className="right">GWP</th></tr></thead>
                  <tbody>
                    {data.topAgents.length === 0 && <tr><td colSpan={4} className="muted">No activity yet.</td></tr>}
                    {data.topAgents.map((a) => (
                      <tr key={a.name}><td>{a.name}</td><td className="right num">{a.quotes}</td><td className="right num">{a.issued}</td><td className="right num">{money(a.gwp)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
