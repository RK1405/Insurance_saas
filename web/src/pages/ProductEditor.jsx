import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, siLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, ErrorBox, Field, LineBadge, Loading, Page, StatusBadge, Toast } from '../components/ui.jsx';

const num = (v) => (v === '' || v === null ? '' : Number(v));

export default function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [name, setName] = useState('');
  const [compliance, setCompliance] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('pricing');
  const [json, setJson] = useState('');

  const load = () => api.get(`/products/${id}`).then(({ product: p }) => {
    setProduct(p); setCfg(p.config); setName(p.name); setCompliance(p.compliance); setJson(JSON.stringify(p.config, null, 2));
  }).catch(setError);
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = product?.status === 'draft' && user.role !== 'agent';

  // Live compliance check while editing
  useEffect(() => {
    if (!cfg || !editable) return undefined;
    const t = setTimeout(() => api.post('/products/compliance-check', { line: product.line, config: cfg }).then(setCompliance).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [cfg, editable, product?.line]);

  if (error && !product) return <ErrorBox error={error} />;
  if (!product || !cfg) return <Loading />;

  const set = (path, value) => setCfg((c) => {
    const next = structuredClone(c);
    const keys = path.split('.');
    let o = next;
    keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys.at(-1)] = value;
    return next;
  });

  const run = async (fn, msg) => {
    setError(null);
    try {
      const r = await fn();
      if (r?.product) { setProduct(r.product); setCfg(r.product.config); setCompliance(r.product.compliance); setJson(JSON.stringify(r.product.config, null, 2)); }
      setToast(msg);
      return r;
    } catch (e) {
      setError(e);
      if (e.details?.checks) setCompliance(e.details);
      return null;
    }
  };

  const save = () => run(() => api.put(`/products/${id}`, { name, config: cfg }), 'Draft saved');
  const publish = async () => { if (await save()) await run(() => api.post(`/products/${id}/publish`), 'Published. New quotes now use this version.'); };
  const newVersion = async () => {
    try {
      const r = await api.post(`/products/${id}/new-version`);
      navigate(`/products/${r.product.id}`);
    } catch (e) {
      if (e.details?.id) navigate(`/products/${e.details.id}`); else setError(e);
    }
  };
  const archive = () => window.confirm('Archive this version? It will no longer be quotable.') && run(() => api.post(`/products/${id}/archive`), 'Archived');

  const applyJson = () => {
    try { setCfg(JSON.parse(json)); setToast('JSON applied. Save the draft to keep it.'); } catch (e) { setError(new Error(`Invalid JSON: ${e.message}`)); }
  };

  const isRetail = product.line === 'retail';
  const tabs = ['pricing', 'benefits', isRetail ? 'options' : 'group', 'advanced'];

  return (
    <Page
      title={product.name}
      subtitle={<span className="row" style={{ gap: 8 }}><LineBadge line={product.line} /><StatusBadge status={product.status} /><span>{product.code} · version {product.version}</span></span>}
      actions={user.role !== 'agent' && (
        <>
          {editable && <button className="btn" onClick={save}>Save draft</button>}
          {editable && <button className="btn primary" onClick={publish} disabled={compliance && !compliance.passed}>Publish</button>}
          {!editable && product.status !== 'archived' && <button className="btn" onClick={newVersion}>Create new version</button>}
          {product.status !== 'archived' && <button className="btn danger" onClick={archive}>Archive</button>}
        </>
      )}
    >
      <Toast message={toast} onDone={() => setToast(null)} />
      {!editable && user.role !== 'agent' && product.status === 'published' && <div className="alert info" style={{ marginBottom: 14 }}>Published versions are locked so issued policies stay consistent. Create a new version to make changes.</div>}
      <div className="grid g3" style={{ alignItems: 'start' }}>
        <div className="span2 stack">
          <ErrorBox error={error} />
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="stack">
            <Card>
              <div className="grid g2">
                <Field label="Product name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Description"><input value={cfg.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
              </div>
            </Card>
            <div className="tabs" role="tablist">
              {tabs.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
            </div>

            {tab === 'pricing' && (
              <>
                <Card title="Sums insured">
                  <Field label="Options (₹, comma separated)" hint={cfg.sumInsuredOptions.map(siLabel).join(' · ')}>
                    <input value={cfg.sumInsuredOptions.join(', ')} onChange={(e) => set('sumInsuredOptions', e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => n > 0))} />
                  </Field>
                </Card>
                <Card title="Base rates by age" actions={<button type="button" className="btn sm" onClick={() => { const last = cfg.ageBands.at(-1); set('ageBands', [...cfg.ageBands, { min: (last?.max ?? -1) + 1, max: (last?.max ?? -1) + 5, rate: last?.rate || 1000 }]); }}>+ Band</button>}>
                  <p className="small muted" style={{ marginTop: 0 }}>Annual premium in ₹ per ₹1 lakh of sum insured, before discounts, city factor and loadings.</p>
                  <table className="table">
                    <thead><tr><th>From age</th><th>To age</th><th>₹ per lakh</th><th /></tr></thead>
                    <tbody>{cfg.ageBands.map((b, i) => (
                      <tr key={i}>
                        <td><input type="number" value={b.min} onChange={(e) => set('ageBands', cfg.ageBands.map((x, j) => (j === i ? { ...x, min: num(e.target.value) } : x)))} /></td>
                        <td><input type="number" value={b.max} onChange={(e) => set('ageBands', cfg.ageBands.map((x, j) => (j === i ? { ...x, max: num(e.target.value) } : x)))} /></td>
                        <td><input type="number" value={b.rate} onChange={(e) => set('ageBands', cfg.ageBands.map((x, j) => (j === i ? { ...x, rate: num(e.target.value) } : x)))} /></td>
                        <td><button type="button" className="btn sm ghost danger" onClick={() => set('ageBands', cfg.ageBands.filter((_, j) => j !== i))} aria-label="Remove band">✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
                <Card title="Factors">
                  <div className="grid g3">
                    {[1, 2, 3].map((t) => (
                      <Field key={t} label={`City tier ${t} factor`}><input type="number" step="0.01" value={cfg.cityTierFactors[t]} onChange={(e) => set(`cityTierFactors.${t}`, num(e.target.value))} /></Field>
                    ))}
                  </div>
                  {isRetail && (
                    <>
                      <h3 style={{ margin: '16px 0 8px' }}>Floater discount by family size (%)</h3>
                      <div className="grid g4">
                        {Object.keys(cfg.floaterDiscountPct).map((k) => (
                          <Field key={k} label={`${k} members`}><input type="number" value={cfg.floaterDiscountPct[k]} onChange={(e) => set(`floaterDiscountPct.${k}`, num(e.target.value))} /></Field>
                        ))}
                      </div>
                      <h3 style={{ margin: '16px 0 8px' }}>Sum insured discounts</h3>
                      <div className="grid g4">
                        {cfg.siDiscounts.map((d, i) => (
                          <Field key={i} label={`From ${siLabel(d.minSumInsured)} (%)`}><input type="number" value={d.pct} onChange={(e) => set('siDiscounts', cfg.siDiscounts.map((x, j) => (j === i ? { ...x, pct: num(e.target.value) } : x)))} /></Field>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </>
            )}

            {tab === 'benefits' && (
              <>
                <Card title="Benefits">
                  <div className="grid g2">
                    <Field label="Room rent"><input value={cfg.benefits.roomRent} onChange={(e) => set('benefits.roomRent', e.target.value)} /></Field>
                    <Field label="Pre / post hospitalisation (days)"><input value={cfg.benefits.prePostHospitalisationDays} onChange={(e) => set('benefits.prePostHospitalisationDays', e.target.value)} /></Field>
                    <Field label="Day-care"><input value={cfg.benefits.dayCare} onChange={(e) => set('benefits.dayCare', e.target.value)} /></Field>
                    <div className="stack" style={{ gap: 6, justifyContent: 'end' }}>
                      <label className="check"><input type="checkbox" checked={!!cfg.benefits.ayushCovered} onChange={(e) => set('benefits.ayushCovered', e.target.checked)} />AYUSH treatment covered</label>
                      {isRetail && <label className="check"><input type="checkbox" checked={!!cfg.benefits.restoreBenefit} onChange={(e) => set('benefits.restoreBenefit', e.target.checked)} />Restore / recharge benefit</label>}
                    </div>
                  </div>
                </Card>
                <Card title="Waiting periods & policy conditions">
                  <div className="grid g3">
                    <Field label="Initial waiting (days)"><input type="number" value={cfg.waitingPeriods.initialDays} onChange={(e) => set('waitingPeriods.initialDays', num(e.target.value))} /></Field>
                    <Field label="Pre-existing diseases (months)"><input type="number" value={cfg.waitingPeriods.pedMonths} onChange={(e) => set('waitingPeriods.pedMonths', num(e.target.value))} /></Field>
                    <Field label="Specific diseases (months)"><input type="number" value={cfg.waitingPeriods.specificDiseaseMonths} onChange={(e) => set('waitingPeriods.specificDiseaseMonths', num(e.target.value))} /></Field>
                    <Field label="Maternity (months)"><input type="number" value={cfg.waitingPeriods.maternityMonths} onChange={(e) => set('waitingPeriods.maternityMonths', num(e.target.value))} /></Field>
                    <Field label="Free-look period (days)"><input type="number" value={cfg.freeLookDays} onChange={(e) => set('freeLookDays', num(e.target.value))} /></Field>
                    <Field label="Grace period (days)"><input type="number" value={cfg.gracePeriodDays} onChange={(e) => set('gracePeriodDays', num(e.target.value))} /></Field>
                    <Field label="Moratorium (months)"><input type="number" value={cfg.moratoriumMonths} onChange={(e) => set('moratoriumMonths', num(e.target.value))} /></Field>
                    {isRetail && <Field label="Minimum entry age"><input type="number" value={cfg.minEntryAge} onChange={(e) => set('minEntryAge', num(e.target.value))} /></Field>}
                    {isRetail && <Field label="Maximum entry age"><input type="number" value={cfg.maxEntryAge} onChange={(e) => set('maxEntryAge', num(e.target.value))} /></Field>}
                  </div>
                </Card>
              </>
            )}

            {tab === 'options' && isRetail && (
              <>
                <Card title="Co-payment options">
                  <table className="table">
                    <thead><tr><th>Co-pay %</th><th>Premium discount %</th></tr></thead>
                    <tbody>{cfg.copayOptions.map((c, i) => (
                      <tr key={i}>
                        <td><input type="number" value={c.pct} onChange={(e) => set('copayOptions', cfg.copayOptions.map((x, j) => (j === i ? { ...x, pct: num(e.target.value) } : x)))} /></td>
                        <td><input type="number" value={c.discountPct} onChange={(e) => set('copayOptions', cfg.copayOptions.map((x, j) => (j === i ? { ...x, discountPct: num(e.target.value) } : x)))} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
                <RowsEditor title="Add-on riders" rows={cfg.riders} onChange={(v) => set('riders', v)} />
                <Card title="Cover types & limits">
                  <div className="row">
                    {['individual', 'floater'].map((t) => (
                      <label key={t} className="check"><input type="checkbox" checked={cfg.coverTypes.includes(t)} onChange={(e) => set('coverTypes', e.target.checked ? [...cfg.coverTypes, t] : cfg.coverTypes.filter((x) => x !== t))} />{t === 'floater' ? 'Family floater' : 'Individual'}</label>
                    ))}
                    <Field label="Max members per policy"><input type="number" value={cfg.maxMembers} onChange={(e) => set('maxMembers', num(e.target.value))} /></Field>
                  </div>
                </Card>
              </>
            )}

            {tab === 'group' && !isRetail && (
              <>
                <Card title="Group eligibility">
                  <div className="grid g3">
                    <Field label="Minimum lives"><input type="number" value={cfg.minLives} onChange={(e) => set('minLives', num(e.target.value))} /></Field>
                    <Field label="Maximum lives"><input type="number" value={cfg.maxLives} onChange={(e) => set('maxLives', num(e.target.value))} /></Field>
                    <Field label="Parents co-pay (%)"><input type="number" value={cfg.parentsCopayPct} onChange={(e) => set('parentsCopayPct', num(e.target.value))} /></Field>
                  </div>
                </Card>
                <Card title="Industry risk factors">
                  <div className="grid g3">
                    {Object.entries(cfg.industryFactors).map(([k, v]) => (
                      <Field key={k} label={k.replace(/_/g, ' ')}><input type="number" step="0.01" value={v} onChange={(e) => set(`industryFactors.${k}`, num(e.target.value))} /></Field>
                    ))}
                  </div>
                </Card>
                <Card title="Group size discounts">
                  <div className="grid g3">
                    {cfg.groupSizeDiscounts.map((d, i) => (
                      <Field key={i} label={`${d.minLives}+ lives (%)`}><input type="number" value={d.pct} onChange={(e) => set('groupSizeDiscounts', cfg.groupSizeDiscounts.map((x, j) => (j === i ? { ...x, pct: num(e.target.value) } : x)))} /></Field>
                    ))}
                  </div>
                </Card>
                <RowsEditor title="Optional benefits" rows={cfg.options} onChange={(v) => set('options', v)} />
              </>
            )}

            {tab === 'advanced' && (
              <Card title="Full configuration (JSON)" actions={editable && <button type="button" className="btn sm" onClick={applyJson}>Apply JSON</button>}>
                <p className="small muted" style={{ marginTop: 0 }}>Every product setting in one place, for bulk edits or copying between environments.</p>
                <textarea className="code" rows={24} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Product JSON" />
              </Card>
            )}
          </fieldset>
        </div>

        <div className="stack" style={{ position: 'sticky', top: 80 }}>
          <Card title="Compliance" actions={compliance && <span className={`badge ${compliance.passed ? 'ok' : 'bad'}`}>{compliance.passed ? 'Ready to publish' : 'Blocking issues'}</span>}>
            {!compliance ? <span className="muted">Not checked yet.</span> : (
              <div className="stack" style={{ gap: 8 }}>
                <div className="small muted">Rule pack {compliance.rulePack}</div>
                {compliance.checks.map((c) => (
                  <div key={c.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8 }}>
                    <span className={`badge ${c.passed ? 'ok' : c.severity === 'error' ? 'bad' : 'warn'}`} style={{ minWidth: 22, justifyContent: 'center' }}>{c.passed ? '✓' : c.severity === 'error' ? '✕' : '!'}</span>
                    <div className="small"><div style={{ fontWeight: 500 }}>{c.title}</div><div className="muted">{String(c.detail)}</div></div>
                  </div>
                ))}
                <p className="small muted" style={{ margin: 0 }}>Checks reflect IRDAI health insurance norms. Confirm against current circulars and file the product (use-and-file) before sale.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

function RowsEditor({ title, rows, onChange }) {
  return (
    <Card title={title} actions={<button type="button" className="btn sm" onClick={() => onChange([...rows, { code: `NEW${rows.length + 1}`, name: 'New benefit', ratePct: 5 }])}>+ Add</button>}>
      <table className="table">
        <thead><tr><th>Code</th><th>Name</th><th>Rate (% of premium)</th><th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td><input value={r.code} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))} /></td>
            <td><input value={r.name} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
            <td><input type="number" value={r.ratePct} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, ratePct: num(e.target.value) } : x)))} /></td>
            <td><button type="button" className="btn sm ghost danger" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove">✕</button></td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}
