import { Router } from 'express';
import { query } from '../db.js';
import { ah, visibleLines } from '../lib.js';

const r = Router();
const STATUSES = ['quoted', 'referred', 'approved', 'issued', 'declined', 'expired'];
const statusCols = STATUSES.map((s) => `count(*) filter (where q.status = '${s}')::int as ${s}`).join(', ');

// Scope: admin = whole organisation (all lines) · underwriter = their lines · agent = only their own quotes.
r.get('/summary', ah(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || req.user.preferences?.dashboardRangeDays || 180, 7), 730);
  const lines = visibleLines(req.user);
  const params = [req.org.id, lines, days];
  let own = '';
  if (req.user.role === 'agent') {
    params.push(req.user.id);
    own = ` and q.created_by = $${params.length}`;
  }
  const where = `q.org_id = $1 and q.line = any($2) and q.created_at > now() - ($3 || ' days')::interval${own}`;

  const totals = (await query(
    `select count(*)::int as quotes, ${statusCols},
            count(*) filter (where q.stp)::int as stp,
            coalesce(sum(q.premium) filter (where q.status = 'issued'), 0)::float as gwp,
            coalesce(sum(q.total) filter (where q.status = 'issued'), 0)::float as gwp_incl_gst,
            coalesce(avg(q.premium) filter (where q.status = 'issued'), 0)::float as avg_premium,
            coalesce(sum(case when q.line = 'retail' then jsonb_array_length(q.members) else jsonb_array_length(q.census) end)
                     filter (where q.status = 'issued'), 0)::int as lives
     from quotes q where ${where}`, params)).rows[0];

  const byLine = (await query(
    `select q.line, count(*)::int as quotes, ${statusCols},
            coalesce(sum(q.premium) filter (where q.status = 'issued'), 0)::float as gwp,
            coalesce(sum(q.total) filter (where q.status = 'issued'), 0)::float as gwp_incl_gst
     from quotes q where ${where} group by q.line order by q.line`, params)).rows;

  const monthly = (await query(
    `select to_char(date_trunc('month', q.created_at), 'YYYY-MM') as month, count(*)::int as quotes, ${statusCols},
            coalesce(sum(q.premium) filter (where q.status = 'issued'), 0)::float as gwp
     from quotes q where ${where} group by 1 order by 1`, params)).rows;

  const tat = (await query(
    `select coalesce(avg(extract(epoch from (p.issued_at - q.created_at)) / 3600), 0)::float as hours
     from policies p join quotes q on q.id = p.quote_id where ${where}`, params)).rows[0];

  // Team report: each person's pipeline and premium (admins and underwriters only)
  const team = req.user.role === 'agent' ? [] : (await query(
    `select coalesce(u.name, 'Partner API') as name, coalesce(u.role, 'api') as role, count(*)::int as quotes, ${statusCols},
            coalesce(sum(q.premium) filter (where q.status = 'issued'), 0)::float as gwp,
            coalesce(sum(q.total) filter (where q.status = 'issued'), 0)::float as gwp_incl_gst
     from quotes q left join users u on u.id = q.created_by where ${where}
     group by 1, 2 order by gwp desc, quotes desc`, params)).rows;

  const pendingReferrals = req.user.role === 'agent' ? null : (await query(
    "select count(*)::int as n from quotes q where q.org_id = $1 and q.line = any($2) and q.status = 'referred'",
    [req.org.id, lines])).rows[0].n;

  res.json({
    days,
    scope: req.user.role === 'agent' ? 'own' : req.user.role === 'admin' ? 'organisation' : 'lines',
    lines,
    totals: {
      ...totals,
      conversionPct: totals.quotes ? Math.round((totals.issued / totals.quotes) * 1000) / 10 : 0,
      stpPct: totals.quotes ? Math.round((totals.stp / totals.quotes) * 1000) / 10 : 0,
      avgIssueHours: Math.round(tat.hours * 10) / 10,
    },
    byStatus: STATUSES.map((s) => ({ status: s, count: totals[s] })),
    byLine,
    monthly,
    team,
    pendingReferrals,
  });
}));

export default r;
