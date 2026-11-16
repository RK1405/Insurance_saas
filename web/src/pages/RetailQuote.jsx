import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, RELATION_LABEL, siLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Empty, ErrorBox, Field, Loading, Page, Steps, useLoad } from '../components/ui.jsx';

const STEPS = ['Plan & members', 'Health declaration', 'Customer & KYC', 'Review'];
const blankDecl = { heightCm: '', weightKg: '', smoker: false, conditions: [], hospitalisedLast3Years: false, onMedication: false };
const newMember = (relation = 'self') => ({ name: '', relation, age: '', gender: relation === 'spouse' ? 'female' : 'male', declaration: { ...blankDecl } });

export default function RetailQuote() {
  const { user } = useAuth();
  const prefs = user.preferences || {};
  const navigate = useNavigate();
  const products = useLoad(() => api.get('/products?line=retail&status=published'));
  const meta = useLoad(() => api.get('/settings/meta'));

  const [step, setStep] = useState(0);
  const [product, setProduct] = useState(null);
  const [plan, setPlan] = useState({
    productId: '', coverType: prefs.defaultCoverType || 'floater', sumInsured: prefs.defaultSumInsured || 1000000,
    cityTier: prefs.defaultCityTier || 1, copayPct: 0, riders: [],
  });
  const [members, setMembers] = useState([newMember('self')]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', pan: '', aadhaarLast4: '', city: '', pincode: '', address: '', nomineeName: '', nomineeRelation: '' });
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Pick the user's favourite product, else the first published one
  useEffect(() => {
    const list = products.data?.products;
    if (!list?.length || plan.productId) return;
    const fav = list.find((p) => prefs.favoriteProductIds?.includes(p.id)) || list[0];
    setPlan((p) => ({ ...p, productId: fav.id }));
  }, [products.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan.productId) return;
    api.get(`/products/${plan.productId}`).then(({ product: p }) => {
      setProduct(p);
      setPlan((x) => ({
        ...x,
        sumInsured: p.config.sumInsuredOptions.includes(x.sumInsured) ? x.sumInsured : p.config.sumInsuredOptions[0],
        coverType: p.config.coverTypes.includes(x.coverType) ? x.coverType : p.config.coverTypes[0],
        riders: x.riders.filter((r) => p.config.riders.some((pr) => pr.code === r)),
      }));
    });
  }, [plan.productId]);

  const ready = members.every((m) => m.age !== '' && m.relation);
  const previewBody = useMemo(() => JSON.stringify({ ...plan, members: members.map((m) => ({ name: m.name || 'Member', relation: m.relation, age: Number(m.age), gender: m.gender })) }), [plan, members]);

  // Live indicative price (debounced)
  useEffect(() => {
    if (!product || !ready) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/quotes/retail/preview', JSON.parse(previewBody))
        .then((d) => { setPreview(d); setPreviewError(null); })
        .catch((e) => { setPreview(null); setPreviewError(e); });
    }, 300);
    return () => clearTimeout(t);
  }, [previewBody, product, ready]);

  if (products.loading || meta.loading) return <Loading />;
  if (!products.data?.products.length) return <Page title="New Individual & Family quote"><Empty>No published retail products yet. Ask an admin to publish one under Products.</Empty></Page>;

  const cfg = product?.config;
  const setM = (i, patch) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const setD = (i, patch) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, declaration: { ...m.declaration, ...patch } } : m)));
  const toggleRider = (code) => setPlan((p) => ({ ...p, riders: p.riders.includes(code) ? p.riders.filter((r) => r !== code) : [...p.riders, code] }));

  const canNext = [
    () => ready && !!preview && members.every((m) => m.name.trim()),
    () => members.every((m) => Number(m.age) < 18 || (m.declaration.heightCm && m.declaration.weightKg)),
    () => customer.name && customer.phone && customer.city && customer.pincode && customer.nomineeName && customer.nomineeRelation,
    () => true,
  ][step]();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = {
        ...plan,
        customer,
        members: members.map((m) => ({
          ...m,
          age: Number(m.age),
          declaration: {
            ...m.declaration,
            heightCm: m.declaration.heightCm ? Number(m.declaration.heightCm) : undefined,
            weightKg: m.declaration.weightKg ? Number(m.declaration.weightKg) : undefined,
          },
        })),
      };
      const { quote } = await api.post('/quotes/retail', body);
      navigate(`/quotes/${quote.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const priceBox = (
    <div className="price-box">
      <div className="small muted">Indicative annual premium{preview?.price.gstRatePct ? ` + ${preview.price.gstRatePct}% GST` : ' (GST exempt)'}</div>
      <div className="big">{preview ? money(preview.price.total) : '—'}</div>
      {preview && (
        <div className="small muted">
          {siLabel(plan.sumInsured)} · {plan.coverType === 'floater' ? 'Family floater' : 'Individual'} · {members.length} member{members.length > 1 ? 's' : ''}
          {preview.rating.factors.floaterDiscountPct > 0 && <> · {preview.rating.factors.floaterDiscountPct}% floater discount</>}
        </div>
      )}
      {previewError && <div className="field-error" style={{ marginTop: 6 }}>{previewError.message}</div>}
      {step === 0 && <div className="small muted" style={{ marginTop: 8 }}>Final premium depends on the health declaration.</div>}
    </div>
  );

  return (
    <Page title="New Individual & Family quote" subtitle="Quote, underwrite and issue a retail health policy.">
      <Steps steps={STEPS} current={step} />
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="span2 stack">
          <ErrorBox error={error} />

          {step === 0 && cfg && (
            <>
              <Card title="Plan">
                <div className="grid g2">
                  <Field label="Product">
                    <select value={plan.productId} onChange={(e) => setPlan({ ...plan, productId: e.target.value })}>
                      {products.data.products.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
                    </select>
                  </Field>
                  <Field label="Cover type">
                    <select value={plan.coverType} onChange={(e) => setPlan({ ...plan, coverType: e.target.value })}>
                      {cfg.coverTypes.map((c) => <option key={c} value={c}>{c === 'floater' ? 'Family floater (shared sum insured)' : 'Individual (sum insured per member)'}</option>)}
                    </select>
                  </Field>
                  <Field label="Sum insured">
                    <select value={plan.sumInsured} onChange={(e) => setPlan({ ...plan, sumInsured: Number(e.target.value) })}>
                      {cfg.sumInsuredOptions.map((s) => <option key={s} value={s}>{siLabel(s)}</option>)}
                    </select>
                  </Field>
                  <Field label="City tier" hint="Tier 1 = metros (Mumbai, Delhi NCR, Bengaluru, Chennai, Hyderabad, Kolkata, Pune, Ahmedabad)">
                    <select value={plan.cityTier} onChange={(e) => setPlan({ ...plan, cityTier: Number(e.target.value) })}>
                      <option value={1}>Tier 1 (metro)</option><option value={2}>Tier 2</option><option value={3}>Tier 3 / rural</option>
                    </select>
                  </Field>
                  <Field label="Co-payment">
                    <select value={plan.copayPct} onChange={(e) => setPlan({ ...plan, copayPct: Number(e.target.value) })}>
                      {cfg.copayOptions.map((c) => <option key={c.pct} value={c.pct}>{c.pct === 0 ? 'No co-pay' : `${c.pct}% co-pay (${c.discountPct}% cheaper)`}</option>)}
                    </select>
                  </Field>
                </div>
                {cfg.riders.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <strong className="small">Add-on covers</strong>
                    <div className="row" style={{ marginTop: 6 }}>
                      {cfg.riders.map((r) => (
                        <label key={r.code} className="check"><input type="checkbox" checked={plan.riders.includes(r.code)} onChange={() => toggleRider(r.code)} />{r.name} <span className="muted small">+{r.ratePct}%</span></label>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
              <Card title="Members to cover" actions={members.length < cfg.maxMembers && <button className="btn sm" onClick={() => setMembers([...members, newMember(members.length === 1 ? 'spouse' : 'son')])}>+ Add member</button>}>
                <div className="stack">
                  {members.map((m, i) => (
                    <div key={i} className="grid g4" style={{ alignItems: 'end' }}>
                      <Field label="Full name"><input value={m.name} onChange={(e) => setM(i, { name: e.target.value })} /></Field>
                      <Field label="Relation">
                        <select value={m.relation} onChange={(e) => setM(i, { relation: e.target.value })}>
                          {meta.data.relations.map((r) => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
                        </select>
                      </Field>
                      <div className="grid g2" style={{ gap: 8 }}>
                        <Field label="Age"><input type="number" min="0" max="120" value={m.age} onChange={(e) => setM(i, { age: e.target.value })} /></Field>
                        <Field label="Gender">
                          <select value={m.gender} onChange={(e) => setM(i, { gender: e.target.value })}>
                            <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                          </select>
                        </Field>
                      </div>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="small muted num">{preview?.rating.members[i] ? money(preview.rating.members[i].premium) : ''}</span>
                        {members.length > 1 && <button className="btn sm danger" onClick={() => setMembers(members.filter((_, j) => j !== i))}>Remove</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {step === 1 && (
            <Card title="Digital health declaration">
              <p className="muted small" style={{ marginTop: 0 }}>Answers are checked against your organisation's underwriting rules. Most applicants are approved instantly; some are referred to an underwriter.</p>
              <div className="stack">
                {members.map((m, i) => (
                  <div className="member-card" key={i}>
                    <h3 style={{ marginBottom: 10 }}>{m.name} <span className="muted small">· {RELATION_LABEL[m.relation]}, {m.age}</span></h3>
                    <div className="grid g4">
                      <Field label="Height (cm)"><input type="number" value={m.declaration.heightCm} onChange={(e) => setD(i, { heightCm: e.target.value })} /></Field>
                      <Field label="Weight (kg)"><input type="number" value={m.declaration.weightKg} onChange={(e) => setD(i, { weightKg: e.target.value })} /></Field>
                      <div className="span2 stack" style={{ gap: 6, justifyContent: 'end' }}>
                        <label className="check"><input type="checkbox" checked={m.declaration.smoker} onChange={(e) => setD(i, { smoker: e.target.checked })} />Uses tobacco / smokes</label>
                        <label className="check"><input type="checkbox" checked={m.declaration.hospitalisedLast3Years} onChange={(e) => setD(i, { hospitalisedLast3Years: e.target.checked })} />Hospitalised in the last 3 years</label>
                        <label className="check"><input type="checkbox" checked={m.declaration.onMedication} onChange={(e) => setD(i, { onMedication: e.target.checked })} />On regular medication</label>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <span className="small" style={{ fontWeight: 600 }}>Has this person ever been diagnosed with:</span>
                      <div className="row" style={{ marginTop: 6, gap: '6px 16px' }}>
                        {meta.data.conditions.map((c) => (
                          <label key={c.code} className="check small">
                            <input
                              type="checkbox"
                              checked={m.declaration.conditions.includes(c.code)}
                              onChange={(e) => setD(i, { conditions: e.target.checked ? [...m.declaration.conditions, c.code] : m.declaration.conditions.filter((x) => x !== c.code) })}
                            />{c.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card title="Proposer details & KYC">
              <div className="grid g2">
                <Field label="Proposer name"><input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
                <Field label="Mobile number" hint="10 digits, used for OTP and policy SMS"><input inputMode="numeric" maxLength={10} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Email (optional)"><input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
                <Field label="PAN (optional)" hint="Needed for premium above ₹50,000 and for 80D certificate"><input value={customer.pan} maxLength={10} onChange={(e) => setCustomer({ ...customer, pan: e.target.value.toUpperCase() })} /></Field>
                <Field label="Aadhaar, last 4 digits (optional)" hint="Never store the full Aadhaar number"><input inputMode="numeric" maxLength={4} value={customer.aadhaarLast4} onChange={(e) => setCustomer({ ...customer, aadhaarLast4: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="City"><input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} /></Field>
                <Field label="PIN code"><input inputMode="numeric" maxLength={6} value={customer.pincode} onChange={(e) => setCustomer({ ...customer, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Address (optional)"><input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></Field>
                <Field label="Nominee name"><input value={customer.nomineeName} onChange={(e) => setCustomer({ ...customer, nomineeName: e.target.value })} /></Field>
                <Field label="Nominee relationship"><input value={customer.nomineeRelation} onChange={(e) => setCustomer({ ...customer, nomineeRelation: e.target.value })} /></Field>
              </div>
            </Card>
          )}

          {step === 3 && preview && (
            <Card title="Review">
              <dl className="kv">
                <dt>Product</dt><dd>{product.name} v{product.version}</dd>
                <dt>Cover</dt><dd>{siLabel(plan.sumInsured)} · {plan.coverType === 'floater' ? 'Family floater' : 'Individual'} · Tier {plan.cityTier} · {plan.copayPct}% co-pay</dd>
                <dt>Add-ons</dt><dd>{plan.riders.length ? plan.riders.map((r) => cfg.riders.find((x) => x.code === r)?.name).join(', ') : 'None'}</dd>
                <dt>Members</dt><dd>{members.map((m) => `${m.name} (${m.age})`).join(', ')}</dd>
                <dt>Proposer</dt><dd>{customer.name} · {customer.phone} · {customer.city} {customer.pincode}</dd>
                <dt>Nominee</dt><dd>{customer.nomineeName} ({customer.nomineeRelation})</dd>
              </dl>
              <p className="small muted">Submitting runs digital underwriting. Loadings for declared conditions are added automatically.</p>
            </Card>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {step < 3 ? (
              <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Underwriting…' : 'Get final quote'}</button>
            )}
          </div>
        </div>
        <div className="stack" style={{ position: 'sticky', top: 80 }}>
          {priceBox}
          {preview && (
            <Card title="Price breakdown" pad>
              <table className="table small">
                <tbody>
                  {preview.rating.members.map((m, i) => <tr key={i}><td>{m.name} ({m.age})</td><td className="right num">{money(m.premium)}</td></tr>)}
                  {preview.rating.factors.floaterDiscountPct > 0 && <tr><td>Floater discount</td><td className="right">−{preview.rating.factors.floaterDiscountPct}%</td></tr>}
                  {preview.rating.riders.map((r) => <tr key={r.code}><td>{r.name}</td><td className="right num">{money(r.premium)}</td></tr>)}
                  <tr><td><strong>Net premium</strong></td><td className="right num"><strong>{money(preview.price.premium)}</strong></td></tr>
                  <tr><td>GST ({preview.price.gstRatePct}%)</td><td className="right num">{money(preview.price.gst, true)}</td></tr>
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
