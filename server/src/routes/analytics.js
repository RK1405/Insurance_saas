import { Router } from 'express';
import { query } from '../db.js';
import { ah } from '../lib.js';

const r = Router();

r.get('/summary', ah(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || req.user.preferences?.dashboardRangeDays || 180, 7), 730);
  const params = [req.org.id, req.user.lines, days];
  let own = '';
  if (req.user.role === 'agent') { params.push(req.user.id); own = ` and q.created_by = $${params.length}`; }
  const base = `from quotes q where q.org_id = $1 and q.line = any($2) and q.created_at > now() - ($3 || ' days')::interval${own}`;

  const totals = (await query(
    `select count(*)::int as quotes,
            count(*) filter (where status = 'issued')::int as issued,
            count(*) filter (where status = 'referred')::int as referred,
            count(*) filter (where status = 'declined')::int as declined,
            count(*) filter (where stp)::int as stp,
            coalesce(sum(premium) filter (where status = 'issued'), 0)::float as gwp,
            coalesce(avg(premium) filter (where status = 'issued'), 0)::float as avg_premium,
            coalesce(sum(case when line = 'retail' then jsonb_array_length(members) else jsonb_array_length(census) end) filter (where status = 'issued'), 0)::int as lives
     ${base}`, params)).rows[0];

  const byLine = (await query(
    `select line, count(*)::int as quotes, count(*) filter (where status = 'issued')::int as issued,
            coalesce(sum(premium) filter (where status = 'issued'), 0)::float as gwp
     ${base} group by line order by line`, params)).rows;

  const byStatus = (await query(`select status, count(*)::int as count ${base} group by status`, params)).rows;

  const monthly = (await query(
    `select to_char(date_trunc('month', q.created_at), 'YYYY-MM') as month, count(*)::int as quotes,
            count(*) filter (where status = 'issued')::int as issued,
            coalesce(sum(premium) filter (where status = 'issued'), 0)::float as gwp
     ${base} group by 1 order by 1`, params)).rows;

  const tat = (await query(
    `select coalesce(avg(extract(epoch from (p.issued_at - q.created_at)) / 3600), 0)::float as hours
     from policies p join quotes q on q.id = p.quote_id
     where q.org_id = $1 and q.line = any($2) and q.created_at > now() - ($3 || ' days')::interval${own}`, params)).rows[0];

  const topAgents = req.user.role === 'agent' ? [] : (await query(
    `select coalesce(u.name, 'Partner API') as name, count(*)::int as quotes,
            count(*) filter (where q.status = 'issued')::int as issued,
            coalesce(sum(q.premium) filter (where q.status = 'issued'), 0)::float as gwp
     ${base.replace('from quotes q', 'from quotes q left join users u on u.id = q.created_by')}
     group by 1 order by gwp desc, quotes desc limit 5`, params)).rows;

  const pendingReferrals = req.user.role === 'agent' ? null : (await query(
    `select count(*)::int as n from quotes q where q.org_id = $1 and q.line = any($2) and q.status = 'referred'`, [req.org.id, req.user.lines])).rows[0].n;

  res.json({
    days,
    totals: {
      ...totals,
      conversionPct: totals.quotes ? Math.round((totals.issued / totals.quotes) * 1000) / 10 : 0,
      stpPct: totals.quotes ? Math.round((totals.stp / totals.quotes) * 1000) / 10 : 0,
      avgIssueHours: Math.round(tat.hours * 10) / 10,
    },
    byLine, byStatus, monthly, topAgents, pendingReferrals,
  });
}));

export default r;
