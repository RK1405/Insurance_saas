import { Link } from 'react-router-dom';
import { api, compactMoney, LINE_LABEL, money, ROLE_LABEL } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Bars, PIPELINE, PipelineChart } from '../components/Charts.jsx';
import { Card, ErrorBox, Loading, Page, Stat, useLoad } from '../components/ui.jsx';

const SCOPE_TEXT = {
  organisation: 'Whole organisation · all team members · all lines',
  lines: 'All team members',
  own: 'Only quotes you created',
};

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

  const t = data?.totals;
  return (
    <Page
      title={`Namaste, ${first}`}
      subtitle={data ? `${SCOPE_TEXT[data.scope]}${data.scope === 'lines' ? ` · ${data.lines.map((l) => LINE_LABEL[l]).join(' + ')}` : ''} · last ${days} days` : ''}
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
            <Stat
              label="Premium written (excl. GST)"
              value={compactMoney(t.gwp)}
              sub={`${money(t.gwp_incl_gst)} incl. GST · ${t.issued} ${t.issued === 1 ? 'policy' : 'policies'} · ${t.lives} lives`}
            />
            <Stat label="Quotes" value={t.quotes} sub={`${t.issued} issued · ${t.conversionPct}% converted to policy`} />
            <Stat label="Straight-through rate" value={`${t.stpPct}%`} sub="Auto-approved by digital underwriting" />
            <Stat label="Avg. quote → policy" value={t.issued === 0 ? '—' : t.avgIssueHours < 1 ? '< 1 h' : `${t.avgIssueHours} h`} sub={`Avg premium ${money(t.avg_premium)} (excl. GST)`} />
          </div>
          <div className="grid g3">
            <Card title="Quote pipeline by month" className="span2"><PipelineChart data={data.monthly} /></Card>
            <Card title="Quote pipeline">
              <Bars rows={PIPELINE.map((s) => ({ label: s.label, value: data.byStatus.find((b) => b.status === s.key)?.count || 0, color: s.color }))} />
              <p className="small muted" style={{ marginBottom: 0 }}>Each quote is counted once, in its current status. The total equals the Quotes figure ({t.quotes}).</p>
            </Card>
          </div>

          {data.team.length > 0 && (
            <Card title="Team performance" pad={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Role</th><th className="right">Quotes</th>
                      {PIPELINE.map((s) => <th key={s.key} className="right">{s.label}</th>)}
                      <th className="right">Premium (excl. GST)</th><th className="right">Incl. GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.map((a) => (
                      <tr key={a.name}>
                        <td>{a.name}</td>
                        <td className="small">{ROLE_LABEL[a.role] || 'Partner API'}</td>
                        <td className="right num"><strong>{a.quotes}</strong></td>
                        {PIPELINE.map((s) => <td key={s.key} className="right num">{a[s.key] || <span className="muted">0</span>}</td>)}
                        <td className="right num">{money(a.gwp)}</td>
                        <td className="right num">{money(a.gwp_incl_gst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="By line of business" pad={false}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Line</th><th className="right">Quotes</th>{PIPELINE.map((s) => <th key={s.key} className="right">{s.label}</th>)}<th className="right">Premium (excl. GST)</th><th className="right">Incl. GST</th></tr></thead>
                <tbody>
                  {data.byLine.length === 0 && <tr><td colSpan={10} className="muted">No quotes yet.</td></tr>}
                  {data.byLine.map((l) => (
                    <tr key={l.line}>
                      <td>{LINE_LABEL[l.line]}</td>
                      <td className="right num"><strong>{l.quotes}</strong></td>
                      {PIPELINE.map((s) => <td key={s.key} className="right num">{l[s.key] || <span className="muted">0</span>}</td>)}
                      <td className="right num">{money(l.gwp)}</td>
                      <td className="right num">{money(l.gwp_incl_gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
