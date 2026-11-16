import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, money, RELATION_LABEL, siLabel, titleCase } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Empty, ErrorBox, LineBadge, Loading, Page, StatusBadge, useLoad } from '../components/ui.jsx';

export function Policies() {
  const navigate = useNavigate();
  const { data, error, loading } = useLoad(() => api.get('/policies'));
  return (
    <Page title="Policies" subtitle="Issued policies for your lines of business.">
      <Card pad={false}>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data?.policies.length === 0 ? <Empty>No policies issued yet.</Empty> : data && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Policy number</th><th>Insured / employer</th><th>Line</th><th>Product</th><th>Period</th><th className="right">Premium incl. GST</th><th>Status</th></tr></thead>
              <tbody>
                {data.policies.map((p) => (
                  <tr key={p.id} className="click" onClick={() => navigate(`/policies/${p.id}`)}>
                    <td className="nowrap"><a href={`/policies/${p.id}`} onClick={(e) => e.preventDefault()}>{p.policy_number}</a><div className="small muted">{p.quote_number}</div></td>
                    <td>{p.customer_name}</td>
                    <td><LineBadge line={p.line} /></td>
                    <td className="small">{p.product_name}</td>
                    <td className="small nowrap">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</td>
                    <td className="right num">{money(p.total)}</td>
                    <td><StatusBadge status={p.status} /></td>
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

export function PolicyDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get(`/policies/${id}`), [id]);
  const [msg, setMsg] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { policy: p, org } = data;
  const s = p.schedule;

  const cancel = async () => {
    const reason = window.prompt('Reason for cancellation (recorded in audit log):');
    if (!reason) return;
    try {
      const r = await api.post(`/policies/${p.id}/cancel`, { reason });
      setMsg(r.freeLook ? 'Cancelled within free-look period: refund the full premium (less stamp duty and medical costs, if any).' : 'Policy cancelled. Refund per short-period scale.');
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <Page
      title={p.policy_number}
      subtitle={<span className="row" style={{ gap: 8 }}><LineBadge line={p.line} /><StatusBadge status={p.status} /><span>Issued {fmtDateTime(p.issued_at)} by {p.issued_by_name || 'Partner API'}</span></span>}
      actions={
        <span className="row no-print">
          <button className="btn" onClick={() => window.print()}>Print / save PDF</button>
          {user.role !== 'agent' && p.status === 'active' && <button className="btn danger" onClick={cancel}>Cancel policy</button>}
        </span>
      }
    >
      {msg && <div className="alert info no-print" style={{ marginBottom: 14 }}>{msg}</div>}
      <article className="doc">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Policy Schedule</h1>
            <div className="muted">{s.product.name} (version {s.product.version}) · {p.line === 'retail' ? 'Individual / Family Health Insurance' : 'Group Health Insurance'}</div>
          </div>
          <div className="right">
            <strong>{org.name}</strong>
            <div className="muted small">Policy no. {p.policy_number}</div>
          </div>
        </div>

        <h3 style={{ marginTop: 20 }}>Policy details</h3>
        <table>
          <tbody>
            <tr><th>{p.line === 'retail' ? 'Proposer' : 'Policyholder (employer)'}</th><td>{p.customer.name}{p.customer.gstin ? ` · GSTIN ${p.customer.gstin}` : ''}</td><th>Period of insurance</th><td>{fmtDate(p.start_date)} to {fmtDate(p.end_date)} (both days inclusive)</td></tr>
            <tr><th>Address</th><td>{[p.customer.address, p.customer.city, p.customer.pincode].filter(Boolean).join(', ')}</td><th>Contact</th><td>{p.customer.phone || p.customer.contactPhone}</td></tr>
            {p.line === 'retail' && <tr><th>Nominee</th><td>{p.customer.nomineeName} ({p.customer.nomineeRelation})</td><th>Cover type</th><td>{s.inputs.coverType === 'floater' ? 'Family floater' : 'Individual'} · Sum insured {siLabel(s.inputs.sumInsured)}</td></tr>}
            <tr><th>Premium</th><td>{money(p.premium, true)} + GST {money(p.gst, true)} = <strong>{money(p.total, true)}</strong></td><th>Payment</th><td>{p.payment.method.toUpperCase()} {p.payment.reference ? `· ref ${p.payment.reference}` : ''}</td></tr>
          </tbody>
        </table>

        {p.line === 'retail' ? (
          <>
            <h3>Insured members</h3>
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Relation</th><th>Age</th><th>Gender</th><th>Premium</th><th>Loading</th></tr></thead>
              <tbody>{s.members.map((m, i) => (
                <tr key={i}><td>{i + 1}</td><td>{m.name}</td><td>{RELATION_LABEL[m.relation]}</td><td>{m.age}</td><td>{titleCase(m.gender)}</td><td>{money(s.rating.members[i]?.premium)}</td><td>{s.rating.members[i]?.loadingPct ? `${s.rating.members[i].loadingPct}%` : '—'}</td></tr>
              ))}</tbody>
            </table>
            {s.rating.riders?.length > 0 && <p><strong>Add-on covers:</strong> {s.rating.riders.map((r) => r.name).join(', ')}</p>}
          </>
        ) : (
          <>
            <h3>Group cover ({s.lives} lives)</h3>
            <table>
              <thead><tr><th>Category</th><th>Description</th><th>Lives</th><th>Sum insured</th><th>Premium</th></tr></thead>
              <tbody>{s.rating.categories.map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{s.categories[c.category]?.label}</td><td>{c.lives}</td><td>{siLabel(c.sumInsured)}</td><td>{money(c.premium)}</td></tr>
              ))}</tbody>
            </table>
            {s.rating.options?.length > 0 && <p><strong>Optional benefits:</strong> {s.rating.options.map((o) => o.name).join(', ')}</p>}
          </>
        )}

        <h3>Key benefits &amp; conditions</h3>
        <table>
          <tbody>
            <tr><th>Room rent</th><td>{s.benefits.roomRent}</td><th>Pre / post hospitalisation</th><td>{s.benefits.prePostHospitalisationDays} days</td></tr>
            <tr><th>Day-care</th><td>{s.benefits.dayCare}</td><th>AYUSH treatment</th><td>{s.benefits.ayushCovered ? 'Covered up to sum insured' : 'Not covered'}</td></tr>
            <tr><th>Initial waiting period</th><td>{s.waitingPeriods.initialDays} days (accidents covered from day 1)</td><th>Pre-existing diseases</th><td>{s.waitingPeriods.pedMonths} months</td></tr>
            <tr><th>Specific diseases</th><td>{s.waitingPeriods.specificDiseaseMonths} months</td><th>Maternity</th><td>{s.waitingPeriods.maternityMonths} months</td></tr>
            <tr><th>Free-look period</th><td>{s.freeLookDays} days from receipt of policy</td><th>Grace period</th><td>{s.gracePeriodDays} days</td></tr>
            <tr><th>Moratorium</th><td colSpan={3}>After {s.moratoriumMonths} months of continuous cover, no claim can be contested except for proven fraud or permanent exclusions.</td></tr>
          </tbody>
        </table>

        {s.pedDeclared?.length > 0 && <p><strong>Declared pre-existing conditions:</strong> {s.pedDeclared.map((m) => `${m.name}: ${m.peds.join(', ')}`).join('; ')}</p>}
        {s.exclusions?.length > 0 && <p><strong>Specific exclusions:</strong> {s.exclusions.join('; ')}</p>}
        <p className="muted small">{s.taxNote}</p>
        <p className="muted small">This schedule is generated by HealthStack on behalf of {org.name}. The policy wording, prospectus and Customer Information Sheet form part of this contract.</p>
      </article>
    </Page>
  );
}
