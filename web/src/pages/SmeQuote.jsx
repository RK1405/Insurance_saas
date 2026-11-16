import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, RELATION_LABEL, siLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Empty, ErrorBox, Field, Loading, Page, Steps, useLoad } from '../components/ui.jsx';

const STEPS = ['Company', 'Employee census', 'Plan design', 'Review'];
const HEADER = 'employee_id,name,relation,age,gender,category';
const SAMPLE = `${HEADER}
E001,Rahul Mehta,self,34,male,A
E001,Neha Mehta,spouse,32,female,A
E001,Kabir Mehta,son,5,male,A
E002,Anita Rao,self,29,female,B
E003,Suresh Kumar,self,41,male,B
E003,Lata Kumar,spouse,38,female,B
E004,Farhan Ali,self,26,male,B
E005,Deepa Nair,self,45,female,A
E005,Gopal Nair,father,72,male,A
E006,Vikram Singh,self,31,male,B
E007,Pooja Iyer,self,27,female,B`;

const RELATION_ALIASES = { employee: 'self', emp: 'self', wife: 'spouse', husband: 'spouse', child: 'son', kid: 'son' };

export function parseCensus(text, relations) {
  const rows = [];
  const errors = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows, errors };
  const start = lines[0].toLowerCase().startsWith('employee') ? 1 : 0;
  lines.slice(start).forEach((line, i) => {
    const cols = line.split(',').map((c) => c.trim());
    const n = i + start + 1;
    if (cols.length < 6) { errors.push(`Line ${n}: expected 6 columns`); return; }
    const [employeeId, name, rel, ageStr, genderRaw, category] = cols;
    const relation = RELATION_ALIASES[rel.toLowerCase()] || rel.toLowerCase();
    const age = Number(ageStr);
    const g = genderRaw.toLowerCase();
    const gender = g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : 'other';
    if (!relations.includes(relation)) errors.push(`Line ${n}: unknown relation "${rel}"`);
    else if (!Number.isInteger(age) || age < 0 || age > 120) errors.push(`Line ${n}: invalid age "${ageStr}"`);
    else if (!category) errors.push(`Line ${n}: missing category`);
    else rows.push({ employeeId, name, relation, age, gender, category: category.toUpperCase() });
  });
  return { rows, errors };
}

export default function SmeQuote() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const products = useLoad(() => api.get('/products?line=sme&status=published'));
  const meta = useLoad(() => api.get('/settings/meta'));
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState('');
  const [product, setProduct] = useState(null);
  const [company, setCompany] = useState({ name: '', gstin: '', industry: 'it_services', city: '', pincode: '', contactName: '', contactEmail: '', contactPhone: '' });
  const [cityTier, setCityTier] = useState(user.preferences?.defaultCityTier || 1);
  const [csv, setCsv] = useState('');
  const [categories, setCategories] = useState({});
  const [options, setOptions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (products.data?.products.length && !productId) setProductId(products.data.products[0].id);
  }, [products.data, productId]);
  useEffect(() => { if (productId) api.get(`/products/${productId}`).then((d) => setProduct(d.product)); }, [productId]);

  const parsed = useMemo(() => (meta.data ? parseCensus(csv, meta.data.relations) : { rows: [], errors: [] }), [csv, meta.data]);
  const catKeys = useMemo(() => [...new Set(parsed.rows.map((r) => r.category))].sort(), [parsed.rows]);

  // Keep a category definition for every category found in the census
  useEffect(() => {
    if (!product) return;
    setCategories((prev) => Object.fromEntries(catKeys.map((k, i) => [k, prev[k] || {
      label: k === 'A' ? 'Senior staff' : k === 'B' ? 'Staff' : `Category ${k}`,
      sumInsured: product.config.sumInsuredOptions[Math.min(i === 0 ? 3 : 2, product.config.sumInsuredOptions.length - 1)],
    }])));
  }, [catKeys, product]);

  if (products.loading || meta.loading) return <Loading />;
  if (!products.data?.products.length) return <Page title="New Small Business quote"><Empty>No published SME products yet. Ask an admin to publish one under Products.</Empty></Page>;

  const cfg = product?.config;
  const set = (k) => (e) => setCompany({ ...company, [k]: e.target.value });
  const employees = parsed.rows.filter((r) => r.relation === 'self').length;

  const canNext = [
    () => company.name && company.city && company.pincode && company.contactName && company.contactPhone,
    () => parsed.rows.length >= (cfg?.minLives || 1) && parsed.errors.length === 0,
    () => Object.keys(categories).length > 0,
    () => true,
  ][step]();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const { quote } = await api.post('/quotes/sme', { productId, company, cityTier, categories, options, census: parsed.rows });
      navigate(`/quotes/${quote.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Page title="New Small Business quote" subtitle="Group health for employers: upload the census, design the plan, issue the policy.">
      <Steps steps={STEPS} current={step} />
      <div className="stack" style={{ maxWidth: 920 }}>
        <ErrorBox error={error} />

        {step === 0 && (
          <Card title="Employer details">
            <div className="grid g2">
              <Field label="Product">
                <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  {products.data.products.map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
                </select>
              </Field>
              <Field label="Company name"><input value={company.name} onChange={set('name')} /></Field>
              <Field label="GSTIN (optional)" hint="Needed to claim GST input credit"><input value={company.gstin} maxLength={15} onChange={(e) => setCompany({ ...company, gstin: e.target.value.toUpperCase() })} /></Field>
              <Field label="Industry">
                <select value={company.industry} onChange={set('industry')}>
                  {Object.entries(meta.data.industries).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="City"><input value={company.city} onChange={set('city')} /></Field>
              <Field label="PIN code"><input inputMode="numeric" maxLength={6} value={company.pincode} onChange={(e) => setCompany({ ...company, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="City tier">
                <select value={cityTier} onChange={(e) => setCityTier(Number(e.target.value))}>
                  <option value={1}>Tier 1 (metro)</option><option value={2}>Tier 2</option><option value={3}>Tier 3 / rural</option>
                </select>
              </Field>
              <Field label="HR contact name"><input value={company.contactName} onChange={set('contactName')} /></Field>
              <Field label="HR contact mobile"><input inputMode="numeric" maxLength={10} value={company.contactPhone} onChange={(e) => setCompany({ ...company, contactPhone: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="HR contact email (optional)"><input type="email" value={company.contactEmail} onChange={set('contactEmail')} /></Field>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card title="Employee census" actions={<><button className="btn sm" onClick={() => setCsv(SAMPLE)}>Load sample</button><a className="btn sm" download="census-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(`${HEADER}\n`)}`}>Download template</a></>}>
            <p className="muted small" style={{ marginTop: 0 }}>
              One row per insured life. Columns: <span className="code">{HEADER}</span>. Relation is self, spouse, son, daughter, father, mother, father_in_law or mother_in_law. Category is a letter such as A or B (used for different sums insured).
            </p>
            <div className="row" style={{ marginBottom: 10 }}>
              <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ maxWidth: 320 }} aria-label="Upload census CSV" />
            </div>
            <textarea rows={10} className="code" style={{ fontFamily: 'ui-monospace, monospace' }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV rows here" aria-label="Census CSV" />
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge brand">{parsed.rows.length} lives</span>
              <span className="badge">{employees} employees</span>
              <span className="badge">{parsed.rows.length - employees} dependants</span>
              {cfg && parsed.rows.length > 0 && parsed.rows.length < cfg.minLives && <span className="badge warn">Minimum {cfg.minLives} lives</span>}
            </div>
            {parsed.errors.length > 0 && <div className="alert bad" style={{ marginTop: 10 }}>Fix these rows:<ul>{parsed.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></div>}
            {parsed.rows.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
                <table className="table small">
                  <thead><tr><th>Emp ID</th><th>Name</th><th>Relation</th><th className="right">Age</th><th>Gender</th><th>Cat.</th></tr></thead>
                  <tbody>{parsed.rows.slice(0, 100).map((r, i) => <tr key={i}><td>{r.employeeId}</td><td>{r.name}</td><td>{RELATION_LABEL[r.relation]}</td><td className="right">{r.age}</td><td>{r.gender}</td><td>{r.category}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {step === 2 && cfg && (
          <Card title="Plan design">
            <table className="table">
              <thead><tr><th>Category</th><th>Label</th><th className="right">Lives</th><th>Sum insured (floater per family)</th></tr></thead>
              <tbody>
                {Object.entries(categories).map(([k, c]) => (
                  <tr key={k}>
                    <td><strong>{k}</strong></td>
                    <td><input value={c.label} onChange={(e) => setCategories({ ...categories, [k]: { ...c, label: e.target.value } })} /></td>
                    <td className="right num">{parsed.rows.filter((r) => r.category === k).length}</td>
                    <td>
                      <select value={c.sumInsured} onChange={(e) => setCategories({ ...categories, [k]: { ...c, sumInsured: Number(e.target.value) } })}>
                        {cfg.sumInsuredOptions.map((s) => <option key={s} value={s}>{siLabel(s)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <strong className="small">Optional benefits</strong>
              <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                {cfg.options.map((o) => (
                  <label key={o.code} className="check">
                    <input type="checkbox" checked={options.includes(o.code)} onChange={() => setOptions(options.includes(o.code) ? options.filter((x) => x !== o.code) : [...options, o.code])} />
                    {o.name} <span className="muted small">+{o.ratePct}%</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title="Review">
            <dl className="kv">
              <dt>Employer</dt><dd>{company.name}{company.gstin ? ` · GSTIN ${company.gstin}` : ''}</dd>
              <dt>Industry / location</dt><dd>{meta.data.industries[company.industry]} · {company.city} (Tier {cityTier})</dd>
              <dt>Lives</dt><dd>{parsed.rows.length} ({employees} employees)</dd>
              <dt>Categories</dt><dd>{Object.entries(categories).map(([k, c]) => `${k}: ${c.label} – ${siLabel(c.sumInsured)}`).join(' · ')}</dd>
              <dt>Options</dt><dd>{options.length ? options.map((o) => cfg.options.find((x) => x.code === o)?.name).join(', ') : 'None'}</dd>
            </dl>
            <p className="small muted">Submitting rates the group and runs group underwriting (size, age profile, dependant mix).</p>
          </Card>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < 3 ? (
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Rating…' : 'Get group quote'}</button>
          )}
        </div>
      </div>
    </Page>
  );
}
