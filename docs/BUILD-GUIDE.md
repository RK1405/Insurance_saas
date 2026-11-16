# How HealthStack was built: a step-by-step guide

This guide explains how HealthStack was created from scratch, in the order it was built, so you can rebuild it, extend it or hand it to a developer. Each step says **what** was built, **why**, and **which files** hold it.

---

## Step 0: Research: understanding the reference product

HealthStack is modelled on the two products of a Dubai insurtech, AURA (aurainsure.tech): a *Health Insurance SaaS* and a *Motor Insurance SaaS*. We studied the public website, its JavaScript bundle and its legal pages, and wrote down every feature it advertises. The health product has two parts:

- **Individual and Family Health:** flexible product setup, custom workflows, integrations, digital health underwriting.
- **Small Business Health:** product configurator, analytics dashboard, regulatory compliance, end-to-end processing.
- **No claims module.** The scope is quoting → underwriting → policy issuance.

Then we adapted the design for **India**: rupees and lakhs/crores, IRDAI health insurance rules, GST, PAN/Aadhaar KYC, city tiers and data residency in India.

---

## Step 1: Decide the requirements

| Requirement | Decision |
|---|---|
| Cloud only, no desktop app | A web app in the browser, responsive for phones |
| Many customers on one system | **Multi-tenant**: every insurer or broker is an *organisation* with isolated data |
| Login | Email + password, secure session cookie, roles |
| "Each user has their own kind of insurance" | Every user has a list of **lines** (`retail`, `sme`) and personal **preferences** |
| Easy to host anywhere | One **Docker** image + one **PostgreSQL** database |

---

## Step 2: Choose the technology

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js 20+ with Express** | Simple, fast, one language (JavaScript) across the whole app |
| Database | **PostgreSQL 16** | Reliable, available as a managed service on every cloud; `jsonb` columns store flexible product configs |
| Validation | **zod** | Checks every input and gives field-level error messages |
| Auth | **bcryptjs** (password hashing) + **jsonwebtoken** (session token in an `httpOnly` cookie) | Industry standard, no native dependencies |
| Security | **helmet** (security headers), **express-rate-limit** (brute-force protection) | |
| Frontend | **React 18 + Vite + React Router** | Fast single-page app; Vite builds static files the server can serve |
| Styling | Hand-written CSS with design tokens (light/dark) | No heavy UI library; small bundle (~80 KB gzipped) |
| Charts | Hand-written SVG | No chart library needed |
| Tests | Node's built-in `node:test` | No extra test framework |
| Packaging | **Docker** multi-stage build | Same image runs locally and on any cloud |

---

## Step 3: Create the project structure

```text
Insurance_saas/
├── server/                  # API + business logic
│   ├── migrations/          # SQL database schema
│   ├── src/
│   │   ├── engine/          # pure pricing / underwriting / compliance logic
│   │   ├── services/        # workflows (quote → decision → issue, org setup)
│   │   ├── routes/          # HTTP endpoints
│   │   ├── app.js           # Express app wiring
│   │   └── index.js         # entry point (migrate, seed, listen)
│   └── test/                # automated tests
├── web/                     # React frontend
│   └── src/
│       ├── pages/           # one file per screen
│       └── components/      # shared UI pieces
├── docs/                    # documentation (this file, India strategy, screenshots)
├── Dockerfile               # production image
├── docker-compose.yml       # local run with a database
└── render.yaml              # one-click test deployment
```

Commands used to start:

```bash
mkdir -p healthstack/{server/src/{routes,engine,services},server/migrations,server/test,web/src/{pages,components},docs}
```

```bash
cd healthstack/server && npm init -y && npm install express pg bcryptjs jsonwebtoken cookie-parser helmet express-rate-limit zod
```

```bash
cd ../web && npm install react react-dom react-router-dom && npm install -D vite @vitejs/plugin-react
```

---

## Step 4: Design the database

File: `server/migrations/001_init.sql`

| Table | Holds |
|---|---|
| `organizations` | Each tenant (insurer / broker / corporate agent / TPA), its short **code** (used in policy numbers) and its **settings** (underwriting rules, workflow, GST) as JSON |
| `users` | Login, role (`admin`, `underwriter`, `agent`), **`lines`** (kinds of insurance the user works on) and **`preferences`** (JSON) |
| `products` | Product **code + version**, line, status (`draft` → `published` → `archived`), full **config** (rates, benefits…) as JSON, latest compliance result |
| `quotes` | Customer, members or census, inputs, rating breakdown, underwriting result, premium / GST / total, status, validity |
| `policies` | Policy number, period, payment details and a frozen **schedule** snapshot |
| `counters` | Per-organisation running numbers for quote and policy numbers |
| `audit_log` | Who did what and when |
| `api_keys`, `webhooks`, `webhook_deliveries` | Partner integrations |

Key design choices:
- **Every table has `org_id`**, and every query filters by it. That's what isolates tenants.
- Product settings are **JSON** so new fields need no database change.
- Policies store a **snapshot** of the product, so editing a product never changes issued policies.

The migration runner (`server/src/migrate.js`) applies any new `.sql` file at start-up and records it in `schema_migrations`. A PostgreSQL advisory lock stops two servers migrating at the same time.

---

## Step 5: Build the business engines (pure logic, no database)

These are plain functions, so they're easy to test and are reused by both the website and the partner API.

### 5a. Defaults: `server/src/engine/defaults.js`
- The list of medical conditions, relations and industries.
- **Default organisation settings:** GST (retail 0%, group 18%), underwriting rules, workflow options.
- **Starter products:**
  - *Family Shield* (retail): age-band rates per ₹1 lakh, sum insured options ₹3 L–₹1 Cr, city-tier factors, floater discounts, co-pay options, riders, benefits, waiting periods.
  - *BizCare* (SME): rates, industry factors, group-size discounts, optional benefits.

### 5b. Pricing: `server/src/engine/rating.js`

**Retail premium** (per member, then combined):

```text
base        = rate for member's age band × (sum insured ÷ 1,00,000)
            × (1 − sum-insured discount %)        e.g. 15% off at ₹10 L
            × city-tier factor                     e.g. 1.15 for metros
            × (1 − co-pay discount %)              e.g. 8% off for 10% co-pay
            × (1 + underwriting loading %)         e.g. +25% for diabetes
cover       = sum of members × (1 − floater discount %)   (floater only)
riders      = cover × rider rate %                  e.g. OPD +12%
net premium = cover + riders
```

**SME premium:**

```text
per life    = age-band rate × (category sum insured ÷ 1 lakh) × city factor × industry factor
group       = sum of lives × (1 − group-size discount %) × (1 + group loading %)
options     = group × option rate %                 e.g. maternity +8%
```

**GST** (`withGst`): `total = net + net × GST%`. Retail is 0% by default (individual health premiums are GST-exempt from 22 Sep 2025) and group is 18%.

The engine also **validates eligibility**: allowed sums insured, entry ages, at least one adult, maximum members, minimum lives for a group.

### 5c. Digital underwriting: `server/src/engine/underwriting.js`

For each member's health declaration:

1. Calculate **BMI** from height and weight.
2. Apply rules in order:
   - Age above the "refer above age" setting → **refer** (pre-policy medicals).
   - BMI within the standard range → nothing. Within the loading range → **+loading %**. Outside → **refer**.
   - Tobacco → **+loading %**.
   - Each declared condition follows its configured action: *accept* / *load %* / *refer* / *decline*, and optionally *mark as pre-existing disease (PED)*.
   - Hospitalised in the last 3 years → refer (configurable).
   - Total loading above the auto limit → refer.
3. Decide the policy outcome: any decline → **decline**; any refer → **refer**; any loading → **accept with loading**; otherwise **accept**.
4. *Accept* and *accept with loading* are **straight-through (STP)**: no human needed.

Group underwriting checks group size (small groups → refer), average age (→ loading) and the share of parents (→ refer, to prevent anti-selection).

### 5d. Compliance: `server/src/engine/compliance.js`

A rule pack (`IN-IRDAI-HEALTH-2025`) checked before any product is published:

| Blocking errors | Warnings |
|---|---|
| Free-look ≥ 30 days · Grace ≥ 30 days · PED waiting ≤ 36 months · Specific-disease waiting ≤ 36 months · Initial waiting ≤ 30 days · Moratorium ≤ 60 months · AYUSH covered · Age bands contiguous with positive rates · At least one sum insured | Retail max entry age ≥ 65 (no blanket senior cut-off) · SME minimum lives ≥ 7 |

---

## Step 6: Build security and login

File: `server/src/auth.js`

1. **Passwords** are hashed with bcrypt (cost 11) and never stored in plain text.
2. On login the server creates a signed **JWT** (user id + org id) and puts it in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). JavaScript can't read it, which protects against token theft.
3. `requireAuth` runs on every protected request: it verifies the token, **reloads the user and organisation from the database** (so a disabled user loses access immediately) and attaches them to the request.
4. `requireRole('admin', …)` guards admin-only and underwriter-only actions.
5. `requirePasswordCurrent` blocks everything except changing the password while a user still has an admin-issued temporary password.
6. **Login rate limit:** 30 attempts per 15 minutes per IP. Unknown emails take as long to reject as wrong passwords, so attackers can't tell which emails exist.
7. **Partner API keys:** generated randomly, shown once, stored only as a SHA-256 hash, sent in the `x-api-key` header.
8. In `app.js`: `helmet` sets security headers including a Content-Security-Policy, mutating API calls must be JSON (blocks cross-site form attacks), and the request body is capped at 3 MB.

---

## Step 7: Build the workflows (services)

### `server/src/services/orgs.js`: sign-up
Creates the organisation (with a unique short code), the first admin user and two **published starter products**, all in one database transaction.

### `server/src/services/quotes.js`: quote → decision → issue
- `previewRetail`: instant price with no saving (powers the live price in the wizard).
- `createRetailQuote`:
  1. Load the published product.
  2. Check eligibility.
  3. **Underwrite.**
  4. Re-price with the loadings.
  5. Add GST.
  6. Save with a status: `quoted`, `referred` or `declined`.
  7. Fire webhooks.
- `createSmeQuote`: the same for groups.
- `decide`: an underwriter approves (optionally with new loadings and exclusions, which re-prices the quote) or declines a referred quote, with mandatory notes.
- `issue`:
  1. Check the status and expiry.
  2. Check permissions and the payment reference.
  3. Lock the quote row to prevent double issuance.
  4. Generate the policy number (`ORG/HR/2026/0000001` retail, `/HG/` group).
  5. Save the policy with a frozen schedule.
  6. Mark the quote issued and fire `policy.issued`.

Quote numbers look like `Q-ORG-2026-000001`, generated from the `counters` table inside the transaction.

### `server/src/services/payments.js`: payment links (added later)
Issuance became three stages: **payment link → customer pays → issue policy**.
- Migration `002_payment_links.sql` adds the `payment_links` table: quote, unguessable token, amount, status (`created` / `paid` / `cancelled`), method, reference and expiry (7 days or the quote's validity, whichever is sooner).
- `createLink` makes a new link for a quoted or approved quote and cancels any older unpaid link.
- The public endpoints `GET /api/pay/:token` and `POST /api/pay/:token/complete` (no login, rate-limited) power the customer page `web/src/pages/Pay.jsx`. The **dummy gateway** marks the link paid with a `pay_TEST…` reference, writes `payment.received` to the audit log and fires the `payment.received` webhook.
- `issue` automatically uses the paid link's method and reference, so the agent doesn't type anything. Without a paid link, the manual NEFT/cheque route still works.
- The agent's screen (`IssuePanel` in `QuoteDetail.jsx`) shows the 3 stages, share buttons (copy, WhatsApp, SMS, email) and checks for payment every 5 seconds.
- To take real money, replace the dummy part with a gateway (for example Razorpay Payment Links + its `payment_link.paid` webhook); the rest of the flow stays the same.

---

## Step 8: Build the API endpoints

Folder: `server/src/routes/`

| File | Endpoints |
|---|---|
| `auth.js` | `POST /api/auth/register`, `/login`, `/logout`, `/change-password` |
| `me.js` | `GET /api/me`, `PUT /api/me/preferences` (own lines + preferences) |
| `users.js` | Admin team management: invite, change role/lines, disable, reset password |
| `products.js` | List, create, edit draft, live compliance check, publish, new version, archive |
| `quotes.js` | List (filtered by line and role), retail preview, create retail / SME, detail, **decision**, **issue** |
| `policies.js` | List, detail, cancel (detects free-look) |
| `pay.js` | Public customer payment page API (`/api/pay/:token`) |
| `analytics.js` | Dashboard numbers: GWP, conversion, STP rate, turnaround, monthly trend, top producers |
| `settings.js` | Underwriting rules, workflow and GST settings; reference lists |
| `integrations.js` | API keys and webhooks (admin) |
| `audit.js` | Audit log (admin) |
| `publicApi.js` | Partner API `/api/v1/*` with API-key auth and its own rate limit |

Rules applied across the API:
- **Lines:** a user can only see or create quotes and products for their own lines (`assertLine`).
- **Agents** only see quotes and policies they created themselves.
- Every important action is written to the **audit log**.
- Errors return clear messages; validation errors list each wrong field.

`server/src/app.js` wires it all together and also **serves the built React app**, so one server delivers both the website and the API.

---

## Step 9: Build the frontend

Folder: `web/src/`

1. **`api.js`**: a small `fetch` wrapper plus Indian formatting helpers (`₹17,736`, `₹10 L`, `₹1.2 Cr`, dates in `en-IN`).
2. **`auth.jsx`**: loads the signed-in user (`/api/me`), applies the user's theme and handles sign-out.
3. **`App.jsx`**: routes. Signed-out users see Login/Register; users with a temporary password must change it first; route guards hide screens for other roles or lines.
4. **`components/Layout.jsx`**: sidebar menu built from the user's role and lines, the referral counter badge, and a mobile menu.
5. **`components/ui.jsx`**: cards, fields, badges, error box, stats, loader, toast, step indicator, `useLoad` data hook.
6. **`components/Charts.jsx`**: SVG monthly chart and bar list.
7. **Pages:**

| Page | Purpose |
|---|---|
| `Auth.jsx` | Sign in, create organisation (with "which kinds of insurance do you work on?"), change password |
| `Dashboard.jsx` | KPIs, monthly trend, pipeline, by line, top producers, referral alert |
| `RetailQuote.jsx` | 4-step wizard: plan & members (live price) → health declaration → customer & KYC → review |
| `SmeQuote.jsx` | 4-step wizard: company → census CSV (upload/paste/template, validated in the browser) → plan per category → review |
| `QuoteDetail.jsx` | Underwriting result per member, price breakdown, **underwriter decision panel**, **payment & issue panel** |
| `Quotes.jsx` | Quote list with search and filters; also the **underwriting queue** |
| `Policies.jsx` | Policy list and printable **policy schedule** (Print / Save as PDF), cancellation |
| `Products.jsx`, `ProductEditor.jsx` | Product list with favourites; configurator with tabs and a **live compliance panel** |
| `Settings.jsx` | My preferences, password, underwriting & workflow rules, team, integrations & API, audit log |

8. **`styles.css`**: colour tokens with light and dark themes, responsive layout (sidebar becomes a slide-out menu under 760 px), and print styles for policy documents.

Build the frontend:

```bash
cd web && npm run build
```

---

## Step 10: Demo data

File: `server/src/seed.js`. It runs when `SEED_DEMO=true` and creates:
- **Demo Health Insurance Co.** (code `DEMO`) with four users: admin, underwriter, retail-only agent and SME-only agent (password `Demo@12345`).
- Sample quotes covering each outcome: a family policy issued straight-through, a diabetic customer accepted with loading, a senior couple referred to the underwriter, and an IT company's group policy issued.

---

## Step 11: Test everything

```bash
cd server && TEST_DATABASE_URL=postgres://user:pass@localhost:5432/healthstack_test npm test
```

- `test/engine.test.js` (12 tests): pricing maths, floater/co-pay/rider stacking, loadings, invalid inputs, every underwriting outcome, SME rating and group underwriting, GST, compliance pass/fail.
- `test/api.test.js` (15 tests, real PostgreSQL):
  - Registration and login, including wrong passwords and duplicate emails.
  - Forced password change for invited users.
  - A retail-only agent is blocked from SME.
  - Preferences are saved.
  - Instant preview.
  - Straight-through quote → issue, with no double issuance.
  - Field-level validation errors.
  - Referral → underwriter approval with loading and exclusions → issue.
  - SME quote with 18% GST.
  - Agent visibility and **tenant isolation**.
  - Product versioning blocked by compliance.
  - Settings changes take effect.
  - **Partner API + HMAC-signed webhook delivery.**
  - Analytics and audit log.

We also ran a full **browser walkthrough** with Playwright: an agent creates and issues a family policy, an admin reviews the dashboard, configurator, SME quote, rules and integrations, and the app is checked on a phone in dark mode. There were no browser errors.

---

## Step 12: Package for the cloud

- **`Dockerfile`** (multi-stage):
  1. Stage 1 builds the React app.
  2. Stage 2 installs only production server dependencies, copies the built UI, runs as the non-root `node` user and adds a `/healthz` health check.
- **`docker-compose.yml`**: app + PostgreSQL for running on a laptop or single server (`docker compose up --build`).
- **`.env.example`**: every setting (`DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET`, `SEED_DEMO`, `ALLOW_REGISTRATION`, …).
- **`render.yaml`**: one-click test deployment on Render with a free database.
- The server refuses to start in production without a strong `JWT_SECRET`, and shuts down gracefully on `SIGTERM` (needed by cloud platforms).

---

## Step 13: Deploy

- **For testing:** Render (New → Blueprint → this repo → Apply). See the README.
- **For real customers (India):** AWS Mumbai (App Runner/ECS + RDS PostgreSQL), GCP Mumbai (Cloud Run + Cloud SQL) or Azure Central India (Container Apps + PostgreSQL Flexible Server), with HTTPS, at least 2 instances, a WAF, backups and the secret in the cloud's secrets manager. See the README.

---

## Step 14: What to build next

See the README ("What's simulated") and `docs/INDIA-STRATEGY.md`:
- Real payments (Razorpay / UPI AutoPay)
- KYC (CKYC, DigiLocker, Aadhaar e-KYC)
- PDF documents and eSign
- WhatsApp / SMS / email notifications
- Local-language screens
- Renewals and portability
- Multi-insurer comparison
- Later: claims via NHCX and Bima Sugam listing

---

## How to add a new feature (recipe)

1. **Database:** add `server/migrations/002_<name>.sql`. It runs automatically on the next start.
2. **Logic:** put calculations in `server/src/engine/` (pure functions) and workflows in `server/src/services/`.
3. **API:** add or extend a file in `server/src/routes/`, validate input with a zod schema in `schemas.js`, check the role and line, write to the audit log.
4. **UI:** add a page in `web/src/pages/`, a route in `App.jsx` and a menu link in `Layout.jsx`.
5. **Test:** add cases to `server/test/` and run `npm test`.
6. **Ship:** push to `main`. Render redeploys automatically; for other clouds, rebuild and push the Docker image.
