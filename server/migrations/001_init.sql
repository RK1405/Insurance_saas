-- HealthStack core schema (PostgreSQL 13+; gen_random_uuid is built in)

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,              -- short code used in quote/policy numbers
  org_type    text not null check (org_type in ('insurer','broker','corporate_agent','tpa')),
  settings    jsonb not null default '{}',       -- underwriting rules, workflow, GST, etc.
  created_at  timestamptz not null default now()
);

create table users (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  email                text not null,
  name                 text not null,
  password_hash        text not null,
  role                 text not null check (role in ('admin','underwriter','agent')),
  lines                text[] not null default '{retail,sme}',   -- the kinds of insurance this user works on
  preferences          jsonb not null default '{}',
  active               boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));
create index users_org_idx on users (org_id);

create table products (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  code         text not null,
  name         text not null,
  line         text not null check (line in ('retail','sme')),
  version      int  not null default 1,
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  config       jsonb not null,
  compliance   jsonb,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  unique (org_id, code, version)
);

create table quotes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  quote_number  text not null,
  product_id    uuid not null references products(id),
  line          text not null check (line in ('retail','sme')),
  status        text not null check (status in ('quoted','referred','approved','declined','issued','expired')),
  source        text not null default 'portal' check (source in ('portal','api')),
  customer      jsonb not null default '{}',
  members       jsonb not null default '[]',
  census        jsonb not null default '[]',
  inputs        jsonb not null default '{}',
  rating        jsonb,
  underwriting  jsonb,
  premium       numeric(14,2),
  gst           numeric(14,2),
  total         numeric(14,2),
  stp           boolean not null default false,
  created_by    uuid references users(id) on delete set null,
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  decision_notes text,
  valid_until   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, quote_number)
);
create index quotes_org_status_idx on quotes (org_id, status);
create index quotes_org_created_idx on quotes (org_id, created_at desc);

create table policies (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  quote_id       uuid not null unique references quotes(id),
  product_id     uuid not null references products(id),
  policy_number  text not null,
  line           text not null,
  status         text not null default 'active' check (status in ('active','cancelled','free_look_cancelled')),
  customer       jsonb not null,
  start_date     date not null,
  end_date       date not null,
  premium        numeric(14,2) not null,
  gst            numeric(14,2) not null,
  total          numeric(14,2) not null,
  payment        jsonb not null,
  schedule       jsonb not null,
  issued_by      uuid references users(id) on delete set null,
  issued_at      timestamptz not null default now(),
  unique (org_id, policy_number)
);
create index policies_org_idx on policies (org_id, issued_at desc);

create table counters (
  org_id uuid not null references organizations(id) on delete cascade,
  name   text not null,
  value  bigint not null default 0,
  primary key (org_id, name)
);

create table audit_log (
  id        bigserial primary key,
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid references users(id) on delete set null,
  action    text not null,
  entity    text,
  entity_id text,
  details   jsonb,
  ip        text,
  at        timestamptz not null default now()
);
create index audit_org_idx on audit_log (org_id, at desc);

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  prefix       text not null,
  key_hash     text not null unique,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create table webhooks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  url        text not null,
  events     text[] not null,
  secret     text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table webhook_deliveries (
  id          bigserial primary key,
  webhook_id  uuid not null references webhooks(id) on delete cascade,
  event       text not null,
  status_code int,
  error       text,
  at          timestamptz not null default now()
);
