import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDate, LINE_LABEL, siLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Empty, ErrorBox, Field, LineBadge, Loading, Page, StatusBadge, useLoad } from '../components/ui.jsx';

export default function Products() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.get('/products'));
  const [creating, setCreating] = useState(false);
  const canEdit = user.role !== 'agent';
  const favs = user.preferences?.favoriteProductIds || [];

  const toggleFav = async (e, id) => {
    e.stopPropagation();
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    const r = await api.put('/me/preferences', { preferences: { favoriteProductIds: next } });
    setUser(r.user);
  };

  return (
    <Page
      title="Products"
      subtitle={canEdit ? 'Configure plans, rates and rules. Publishing runs IRDAI compliance checks.' : 'Products you can sell. Star your favourites to pre-select them in quotes.'}
      actions={canEdit && <button className="btn primary" onClick={() => setCreating(true)}>+ New product</button>}
    >
      {creating && <NewProduct onCancel={() => setCreating(false)} onCreated={(p) => navigate(`/products/${p.id}`)} lines={user.lines} />}
      <Card pad={false}>
        <ErrorBox error={error} />
        {loading && !data ? <Loading /> : data?.products.length === 0 ? <Empty>No products yet.</Empty> : data && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th aria-label="Favourite" /><th>Product</th><th>Line</th><th>Version</th><th>Sums insured</th><th>Status</th><th>Compliance</th><th>Updated</th></tr></thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id} className="click" onClick={() => navigate(`/products/${p.id}`)}>
                    <td><button className="btn ghost sm" onClick={(e) => toggleFav(e, p.id)} aria-label={favs.includes(p.id) ? 'Remove favourite' : 'Add favourite'} title="Favourite">{favs.includes(p.id) ? '★' : '☆'}</button></td>
                    <td><strong>{p.name}</strong><div className="small muted">{p.code} · {p.description}</div></td>
                    <td><LineBadge line={p.line} /></td>
                    <td>v{p.version}</td>
                    <td className="small">{(p.sum_insured_options || []).map(siLabel).join(', ')}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{p.compliance_passed === 'true' ? <span className="badge ok">Passed</span> : <span className="badge bad">Issues</span>}</td>
                    <td className="small nowrap">{fmtDate(p.updated_at)}</td>
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

function NewProduct({ onCancel, onCreated, lines }) {
  const [form, setForm] = useState({ name: '', code: '', line: lines[0] });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { product } = await api.post('/products', form);
      onCreated(product);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="card card-pad stack" style={{ marginBottom: 16 }} onSubmit={submit}>
      <h2>New product</h2>
      <ErrorBox error={error} />
      <div className="grid g3">
        <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Senior Care Plus" /></Field>
        <Field label="Code" hint="Letters, digits, dashes"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SENIOR-CARE" /></Field>
        <Field label="Line of business">
          <select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })}>
            {lines.map((l) => <option key={l} value={l}>{LINE_LABEL[l]}</option>)}
          </select>
        </Field>
      </div>
      <div className="row"><button className="btn primary">Create draft</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
