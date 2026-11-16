export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.issues = body?.issues || [];
    this.details = body?.details;
  }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/') && !url.startsWith('/me')) window.dispatchEvent(new Event('hs:unauthorized'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n, decimals = false) => (n === null || n === undefined ? '—' : (decimals ? inr2 : inr).format(Number(n)));

/** ₹5,00,000 -> "₹5 L", ₹1,00,00,000 -> "₹1 Cr" */
export function siLabel(n) {
  if (n >= 10000000) return `₹${+(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${+(n / 100000).toFixed(2)} L`;
  return inr.format(n);
}

export const compactMoney = (n) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return inr.format(n);
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export const LINE_LABEL = { retail: 'Individual & Family', sme: 'Small Business' };
export const ROLE_LABEL = { admin: 'Admin', underwriter: 'Underwriter', agent: 'Agent / Broker' };
export const RELATION_LABEL = {
  self: 'Self', spouse: 'Spouse', son: 'Son', daughter: 'Daughter', father: 'Father', mother: 'Mother',
  father_in_law: 'Father-in-law', mother_in_law: 'Mother-in-law',
};
export const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
