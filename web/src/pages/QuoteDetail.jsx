import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, money, RELATION_LABEL, siLabel, titleCase } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, ErrorBox, Field, LineBadge, Loading, Page, StatusBadge, useLoad } from '../components/ui.jsx';

const DECISION_TEXT = {
  accept: 'Accepted automatically: standard rates',
  accept_with_loading: 'Accepted automatically with premium loading',
  refer: 'Referred to an underwriter',
  decline: 'Declined by underwriting rules',
};

export default function QuoteDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get(`/quotes/${id}`), [id]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { quote: q, product, policy, decidedBy } = data;
  const uw = q.underwriting;
  const isStaff = user.role !== 'agent';

  return (
    <Page
      title={q.quote_number}
      subtitle={<span className="row" style={{ gap: 8 }}><LineBadge line={q.line} /><StatusBadge status={q.status} />{q.source === 'api' && <span className="badge">Created via API</span>}<span>{product.name} v{product.version} · valid until {fmtDate(q.valid_until)}</span></span>}
      actions={policy && <Link className="btn primary" to={`/policies/${policy.id}`}>View policy {policy.policy_number}</Link>}
    >
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="span2 stack">
          <Card title="Underwriting outcome">
            <div className={`alert ${uw.decision === 'decline' ? 'bad' : uw.decision === 'refer' ? 'warn' : 'ok'}`}>{DECISION_TEXT[uw.decision]}</div>
            {uw.reasons?.length > 0 && <ul className="small">{uw.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            {q.line === 'retail' && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead><tr><th>Member</th><th className="right">BMI</th><th>Decision</th><th className="right">Loading</th><th>Notes</th><th className="right">Premium</th></tr></thead>
                  <tbody>
                    {uw.members.map((m, i) => (
                      <tr key={i}>
                        <td>{m.name}<div className="small muted">{RELATION_LABEL[q.members[i]?.relation]}, {m.age}</div></td>
                        <td className="right num">{m.bmi ?? '—'}</td>
                        <td><StatusBadge status={m.decision} /></td>
                        <td className="right num">{m.loadingPct ? `+${m.loadingPct}%` : '—'}</td>
                        <td className="small">{m.reasons.join('; ') || 'No adverse disclosures'}{m.peds.length > 0 && <div className="muted">PED: {m.peds.join(', ')}</div>}</td>
                        <td className="right num">{money(q.rating.members[i]?.premium)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {uw.manual && (
              <div className="alert info" style={{ marginTop: 12 }}>
                Underwriter {titleCase(uw.manual.decision)}d by {decidedBy || uw.manual.by} on {fmtDateTime(uw.manual.at)}: "{uw.manual.notes}"
                {uw.manual.exclusions?.length > 0 && <div>Exclusions: {uw.manual.exclusions.join('; ')}</div>}
              </div>
            )}
          </Card>

          {q.line === 'retail' ? (
            <Card title="Proposer">
              <dl className="kv">
                <dt>Name</dt><dd>{q.customer.name}</dd>
                <dt>Contact</dt><dd>{q.customer.phone}{q.customer.email ? ` · ${q.customer.email}` : ''}</dd>
                <dt>Location</dt><dd>{q.customer.city} {q.customer.pincode}</dd>
                <dt>KYC</dt><dd>{q.customer.pan ? `PAN ${q.customer.pan}` : 'PAN not provided'}{q.customer.aadhaarLast4 ? ` · Aadhaar XXXX-XXXX-${q.customer.aadhaarLast4}` : ''}</dd>
                <dt>Nominee</dt><dd>{q.customer.nomineeName} ({q.customer.nomineeRelation})</dd>
                <dt>Plan</dt><dd>{siLabel(q.inputs.sumInsured)} · {q.inputs.coverType === 'floater' ? 'Family floater' : 'Individual'} · Tier {q.inputs.cityTier} · {q.inputs.copayPct}% co-pay</dd>
              </dl>
            </Card>
          ) : (
            <Card title="Employer & group" pad={false}>
              <div className="card-pad">
                <dl className="kv">
                  <dt>Employer</dt><dd>{q.customer.name}{q.customer.gstin ? ` · GSTIN ${q.customer.gstin}` : ''}</dd>
                  <dt>Contact</dt><dd>{q.customer.contactName} · {q.customer.contactPhone}</dd>
                  <dt>Location</dt><dd>{q.customer.city} {q.customer.pincode} · Tier {q.inputs.cityTier}</dd>
                  <dt>Group</dt><dd>{q.rating.lives} lives · {q.rating.employees} employees · average age {q.rating.averageAge}</dd>
                </dl>
              </div>
              <table className="table">
                <thead><tr><th>Category</th><th className="right">Lives</th><th className="right">Employees</th><th className="right">Sum insured</th><th className="right">Premium</th></tr></thead>
                <tbody>{q.rating.categories.map((c) => (
                  <tr key={c.category}><td>{c.category} · {q.inputs.categories[c.category]?.label}</td><td className="right num">{c.lives}</td><td className="right num">{c.employees}</td><td className="right">{siLabel(c.sumInsured)}</td><td className="right num">{money(c.premium)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="stack">
          <div className="price-box">
            <div className="small muted">Total annual premium</div>
            <div className="big">{money(q.total, true)}</div>
            <table className="table small" style={{ marginTop: 6 }}>
              <tbody>
                <tr><td>Net premium</td><td className="right num">{money(q.premium, true)}</td></tr>
                {q.line === 'retail' && q.rating.factors.floaterDiscountPct > 0 && <tr><td>Floater discount applied</td><td className="right">{q.rating.factors.floaterDiscountPct}%</td></tr>}
                {q.line === 'sme' && q.rating.factors.groupDiscountPct > 0 && <tr><td>Group size discount</td><td className="right">{q.rating.factors.groupDiscountPct}%</td></tr>}
                {q.line === 'sme' && q.rating.factors.loadingPct > 0 && <tr><td>Group loading</td><td className="right">+{q.rating.factors.loadingPct}%</td></tr>}
                {(q.rating.riders || q.rating.options || []).map((r) => <tr key={r.code}><td>{r.name}</td><td className="right num">{money(r.premium)}</td></tr>)}
                <tr><td>GST</td><td className="right num">{money(q.gst, true)}</td></tr>
              </tbody>
            </table>
          </div>
          {q.status === 'referred' && isStaff && <DecisionPanel quote={q} onDone={reload} />}
          {q.status === 'referred' && !isStaff && <div className="alert warn">Waiting for an underwriter. You will be able to issue once it is approved.</div>}
          {['quoted', 'approved'].includes(q.status) && <IssuePanel quote={q} />}
        </div>
      </div>
    </Page>
  );
}

function DecisionPanel({ quote, onDone }) {
  const [loadings, setLoadings] = useState(quote.underwriting.loadings || []);
  const [loadingPct, setLoadingPct] = useState(quote.underwriting.loadingPct || 0);
  const [notes, setNotes] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (decision) => {
    setBusy(true); setError(null);
    try {
      await api.post(`/quotes/${quote.id}/decision`, {
        decision, notes,
        memberLoadings: quote.line === 'retail' ? loadings.map(Number) : undefined,
        loadingPct: quote.line === 'sme' ? Number(loadingPct) : undefined,
        exclusions: exclusions.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Underwriter decision">
      <div className="stack">
        <ErrorBox error={error} />
        {quote.line === 'retail' ? quote.members.map((m, i) => (
          <Field key={i} label={`Loading for ${m.name} (%)`}><input type="number" min="0" max="300" value={loadings[i] ?? 0} onChange={(e) => setLoadings((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })} /></Field>
        )) : (
          <Field label="Group loading (%)"><input type="number" min="0" max="300" value={loadingPct} onChange={(e) => setLoadingPct(e.target.value)} /></Field>
        )}
        <Field label="Specific exclusions (one per line, optional)"><textarea rows={3} value={exclusions} onChange={(e) => setExclusions(e.target.value)} /></Field>
        <Field label="Decision notes" hint="Recorded in the audit trail; needed for declines"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="row">
          <button className="btn primary" disabled={busy || notes.trim().length < 3} onClick={() => submit('approve')}>Approve</button>
          <button className="btn danger" disabled={busy || notes.trim().length < 3} onClick={() => submit('decline')}>Decline</button>
        </div>
      </div>
    </Card>
  );
}

function IssuePanel({ quote }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ startDate: today, method: 'upi', reference: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(null), [form]);

  const submit = async () => {
    setBusy(true);
    try {
      const { policy } = await api.post(`/quotes/${quote.id}/issue`, { startDate: form.startDate, payment: { method: form.method, reference: form.reference } });
      navigate(`/policies/${policy.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Card title="Collect payment & issue">
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Policy start date"><input type="date" min={today} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="Payment mode">
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="upi">UPI</option><option value="card">Debit / credit card</option><option value="netbanking">Net banking</option><option value="neft">NEFT / RTGS</option><option value="cheque">Cheque</option>
          </select>
        </Field>
        <Field label="Payment reference" hint="UPI UTR / gateway transaction ID / cheque number"><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Issuing…' : `Issue policy · ${money(quote.total)}`}</button>
      </div>
    </Card>
  );
}
