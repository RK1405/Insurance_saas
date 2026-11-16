import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDate, LINE_LABEL, money } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Empty, ErrorBox, LineBadge, Loading, Page, StatusBadge, useLoad } from '../components/ui.jsx';

export default function Quotes({ referredOnly }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(referredOnly ? 'referred' : '');
  const [line, setLine] = useState('');
  const [q, setQ] = useState('');
  const effStatus = referredOnly ? 'referred' : status;
  const qs = new URLSearchParams(Object.entries({ status: effStatus, line, q }).filter(([, v]) => v)).toString();
  const { data, error, loading } = useLoad(() => api.get(`/quotes?${qs}`), [qs]);

  return (
    <Page
      title={referredOnly ? 'Underwriting queue' : 'Quotes'}
      subtitle={referredOnly ? 'Quotes the digital underwriting engine referred for a manual decision.' : user.role === 'agent' ? 'Quotes you have created.' : 'All quotes for your lines of business.'}
    >
      <Card pad={false}>
        <div className="card-head">
          <div className="row" style={{ flex: 1 }}>
            <input placeholder="Search quote number or customer" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} aria-label="Search" />
            {!referredOnly && (
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="Status">
                <option value="">All statuses</option>
                {['quoted', 'referred', 'approved', 'issued', 'declined', 'expired'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            )}
            {user.lines.length > 1 && (
              <select value={line} onChange={(e) => setLine(e.target.value)} style={{ width: 'auto' }} aria-label="Line">
                <option value="">All lines</option>
                {user.lines.map((l) => <option key={l} value={l}>{LINE_LABEL[l]}</option>)}
              </select>
            )}
          </div>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data?.quotes.length === 0 ? (
          <Empty>{referredOnly ? 'Nothing waiting. All quotes were decided automatically.' : 'No quotes match.'}</Empty>
        ) : data && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Quote</th><th>Customer</th><th>Line</th><th>Product</th><th className="right">Lives</th><th className="right">Total premium</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {data.quotes.map((x) => (
                  <tr key={x.id} className="click" onClick={() => navigate(`/quotes/${x.id}`)}>
                    <td className="nowrap"><a href={`/quotes/${x.id}`} onClick={(e) => e.preventDefault()}>{x.quote_number}</a>{x.source === 'api' && <span className="badge" style={{ marginLeft: 6 }}>API</span>}</td>
                    <td>{x.customer_name}<div className="small muted">{x.created_by_name || 'Partner API'}</div></td>
                    <td><LineBadge line={x.line} /></td>
                    <td className="small">{x.product_name}</td>
                    <td className="right num">{x.lives}</td>
                    <td className="right num">{money(x.total)}</td>
                    <td><StatusBadge status={x.status} />{x.stp && x.status !== 'referred' && <div className="small muted">Auto-approved</div>}</td>
                    <td className="small nowrap">{fmtDate(x.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
