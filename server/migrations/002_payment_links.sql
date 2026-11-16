-- Payment links sent to customers before a policy is issued (dummy gateway for testing)
create table payment_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  quote_id    uuid not null references quotes(id) on delete cascade,
  token       text not null unique,
  amount      numeric(14,2) not null,
  status      text not null default 'created' check (status in ('created','paid','cancelled')),
  method      text,
  reference   text,
  gateway     text not null default 'dummy',
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  paid_at     timestamptz
);
create index payment_links_quote_idx on payment_links (quote_id, created_at desc);
