// Public customer payment page (opened from the payment link; no login needed).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtDateTime, LINE_LABEL, money } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const METHODS = [
  { id: 'upi', label: 'UPI', desc: 'Google Pay, PhonePe, Paytm, BHIM' },
  { id: 'card', label: 'Debit / credit card', desc: 'Visa, Mastercard, RuPay' },
  { id: 'netbanking', label: 'Net banking', desc: 'All major Indian banks' },
];

export default function Pay() {
  const { token } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    api.get(`/pay/${token}`).then((d) => setP(d.payment)).catch(setError);
  }, [token]);

  const pay = async () => {
    setBusy(true); setError(null);
    await new Promise((r) => setTimeout(r, 1200)); // simulate the gateway
    try {
      const d = await api.post(`/pay/${token}/complete`, { method });
      setP(d.payment);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pay-wrap">
      <div className="card card-pad stack pay-card">
        {!p && !error && <Loading />}
        {!p && error && <ErrorBox error={error} />}
        {p && (
          <>
            {p.testMode && <div className="test-banner">TEST MODE · no real money will be charged</div>}
            <div>
              <div className="small muted">{p.orgName}</div>
              <h2 style={{ marginTop: 2 }}>{p.productName}</h2>
              <div className="small muted">{LINE_LABEL[p.line]} health insurance · quote {p.quoteNumber}</div>
            </div>
            <div>
              <div className="small muted">Amount payable{p.customerName ? ` by ${p.customerName}` : ''}</div>
              <div className="pay-amount">{money(p.amount, true)}</div>
            </div>

            {p.status === 'paid' && (
              <div className="alert ok">
                Payment successful. Thank you!
                <div className="small" style={{ fontWeight: 400 }}>Reference <span className="code">{p.reference}</span> · {fmtDateTime(p.paidAt)}<br />Your policy will be issued and sent to you shortly.</div>
              </div>
            )}
            {p.status === 'expired' && <div className="alert bad">This payment link has expired. Please ask your agent for a new link.</div>}
            {p.status === 'cancelled' && <div className="alert bad">This payment link was replaced by a newer one. Please use the latest link from your agent.</div>}

            {p.status === 'created' && (
              <>
                <ErrorBox error={error} />
                <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Payment method">
                  {METHODS.map((m) => (
                    <button type="button" key={m.id} role="radio" aria-checked={method === m.id} className={`choice ${method === m.id ? 'selected' : ''}`} onClick={() => setMethod(m.id)}>
                      <input type="radio" readOnly checked={method === m.id} tabIndex={-1} />
                      <div><div className="title">{m.label}</div><div className="desc">{m.desc}</div></div>
                    </button>
                  ))}
                </div>
                <button className="btn primary" disabled={busy} onClick={pay}>{busy ? 'Processing payment…' : `Pay ${money(p.amount, true)}`}</button>
                <p className="small muted" style={{ margin: 0 }}>Link valid until {fmtDateTime(p.expiresAt)}. Payments are secured by the insurer's payment gateway.</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
