# HealthStack: Health Insurance SaaS (cloud-only)

A multi-tenant web platform for **health insurance underwriting and distribution**, built for India. It has two lines of business:

| Line | What it does |
|---|---|
| **Individual & Family Health** | Flexible product setup · live quoting (individual / family floater) · **digital health underwriting** with straight-through approval · underwriter workbench for referred cases · payment capture · policy issuance |
| **Small Business Health** | **Product configurator** · employee census upload (CSV) · category-wise sums insured · group rating and group underwriting · **analytics dashboard** · **IRDAI compliance checks** · end-to-end quote → issue |

Claims are out of scope, as in the product this is modelled on. The platform covers quoting, underwriting and policy issuance.

---

## Features

**Login and per-user insurance preferences**
- Email/password sign-in with secure `httpOnly` session cookies, bcrypt-hashed passwords and login rate-limiting.
- Self sign-up creates a new **organisation** (insurer, broker, corporate agent or TPA) with its first admin. Each organisation's data is fully isolated from every other.
- **Every user picks their own kinds of insurance** (Individual & Family, Small Business or both). Menus, dashboards, quotes, policies and products show only those lines, and the server enforces the same rule.
- Personal defaults: sum insured, cover type, city tier, home line, favourite products, dashboard period, and light/dark/system theme.
- Roles: **Admin** (everything), **Underwriter** (products, rules view, referral decisions), **Agent / Broker** (sells; sees only their own quotes and policies).
- Admins invite team members with a one-time temporary password, which must be changed at first sign-in. They can also disable users and reset passwords.

**Product configurator (low-code)**
- Age-band rates (₹ per lakh of sum insured), sum insured options, city-tier factors, floater discounts, sum insured discounts, co-pay options, riders, benefits, waiting periods, free-look, grace and moratorium. SME products add industry factors, group-size discounts, minimum lives and optional benefits.
- Draft → **publish** → new version workflow. Published versions are locked, and issued policies keep a snapshot of the version they were sold on.
- A **live IRDAI compliance panel** blocks publishing when a rule is broken. Rule pack: free-look ≥ 30 days, PED waiting ≤ 36 months, moratorium ≤ 60 months, AYUSH covered, grace ≥ 30 days, contiguous age bands, no blanket 65+ cut-off, and more.

**Digital health underwriting (custom workflows)**
- Health declaration per member covers height/weight (BMI), tobacco use, 11 medical conditions, hospitalisation and medication.
- Rules are configurable per organisation: what each condition does (accept / load % / refer / decline / treat as pre-existing disease), BMI bands, tobacco loading, the age above which cases are referred, the auto-approve limit on sum insured, and the maximum automatic loading.
- Outcomes: **accept**, **accept with loading** (both straight-through), **refer** (underwriter queue) or **decline**. Underwriters can approve with their own loadings and exclusions. Every decision is recorded in the audit trail.
- SME group underwriting looks at group size, average-age loading and the share of parents (anti-selection).

**Issuance**
- **Three-stage issuance:** ① generate a payment link and share it by WhatsApp, SMS, email or copy → ② the customer pays on a public, mobile-friendly payment page (test mode, no real money) and the agent's screen updates automatically → ③ issue the policy with the payment reference filled in. Offline payments (NEFT / cheque) can still be recorded by hand.
- Policy number generation, and a printable **policy schedule** that includes members, benefits, waiting periods, declared pre-existing diseases, exclusions and a Section 80D note.
- GST is configurable: **0% on individual health (exempt from 22 Sep 2025)** and **18% on group health** by default.
- Free-look cancellation is detected automatically.

**Integrations**
- **Partner REST API** using `x-api-key` keys (only a hash of each key is stored). Partners can list products, quote retail or SME, check status and issue. This is the hook for embedded distribution through banks, aggregators and HRMS/payroll apps.
- **Webhooks** (`quote.created`, `quote.referred`, `quote.approved`, `policy.issued`, ...) signed with HMAC-SHA256, with a delivery log.

**Analytics and audit**
- Premium written, quotes, conversion, straight-through rate, quote-to-policy time, monthly trend, pipeline, by line, and top producers. Agents see only their own numbers.
- A full **audit log** covering logins, settings, product changes, decisions and issuance.

---

## Architecture

```
Browser (React SPA) ──HTTPS──► Node.js / Express API ──► PostgreSQL
                                 │  ├─ /api/*      session-cookie auth (portal)
                                 │  ├─ /api/v1/*   API-key auth (partners)
                                 │  └─ serves the built React app
                                 └─► Webhooks (signed) to partner systems
```

- **One Docker image** (API + UI) plus **managed PostgreSQL**. The app is stateless, so you can run as many copies as you need behind a load balancer.
- Database migrations run automatically on start-up, and a lock keeps several instances from running them at once.
- Code layout:
  - `server/src/engine/`: pure rating, underwriting and compliance engines (unit-tested).
  - `server/src/services/quotes.js`: quote → decision → issue workflow, shared by the portal and the partner API.
  - `server/migrations/`: SQL schema.
  - `web/src/pages/`: UI screens.

---

## Run locally

**Option A: Docker Compose** (simplest)

```bash
docker compose up --build
```

Open http://localhost:8080 and sign in with a demo account (password `Demo@12345`):

| Email | Role | Lines |
|---|---|---|
| admin@demo.in | Admin | both |
| underwriter@demo.in | Underwriter | both |
| agent@demo.in | Agent | Individual & Family only |
| sme@demo.in | Agent | Small Business only |

**Option B: Node 20+ and PostgreSQL 14+**

```bash
cd server && npm install && cd ../web && npm install && npm run build && cd ..
```

```bash
cd server && DATABASE_URL=postgres://user:pass@localhost:5432/healthstack SEED_DEMO=true npm start
```

For UI development with hot reload, run the server on port 8080 and `npm run dev` in `web/` (port 5173 proxies `/api`).

**Tests** (needs a scratch PostgreSQL database):

```bash
cd server && TEST_DATABASE_URL=postgres://user:pass@localhost:5432/healthstack_test npm test
```

---

## Test deployment (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/RK1405/Insurance_saas)

`render.yaml` creates a free PostgreSQL database and the web service, builds it from the Dockerfile, and loads the demo accounts above. Every push to `main` redeploys automatically. On the free plan the first request after about 15 minutes of inactivity takes up to a minute while the service wakes up, and the free database expires after 30 days. It runs in Singapore, so use it for **testing with demo data only**.

## Deploy to the cloud (India region)

Keep **all data in India**: IRDAI's Information & Cyber Security Guidelines (2023) require insurers' data to be stored in India, and your customers will ask for it. Use:

| Cloud | Region | App | Database |
|---|---|---|---|
| AWS | `ap-south-1` Mumbai (DR: `ap-south-2` Hyderabad) | App Runner or ECS Fargate | RDS / Aurora PostgreSQL (Multi-AZ) |
| Google Cloud | `asia-south1` Mumbai (DR: `asia-south2` Delhi) | Cloud Run | Cloud SQL for PostgreSQL (HA) |
| Azure | Central India (DR: South India) | Container Apps | Azure Database for PostgreSQL Flexible Server |

Steps (the same on any cloud):
1. Create a managed PostgreSQL database (private networking, automated backups, encryption at rest).
2. Build and push the image to the cloud's registry (ECR / Artifact Registry / ACR).

   ```bash
   docker build -t healthstack .
   ```

3. Run the container with these environment variables (see `.env.example`):
   - `NODE_ENV=production` (already set in the image)
   - `DATABASE_URL=...`
   - `DATABASE_SSL=true`
   - `JWT_SECRET=<openssl rand -base64 48>`, kept in the cloud's secrets manager
   - `SEED_DEMO=false`
   - `ALLOW_REGISTRATION=true|false`
4. Put it behind HTTPS (the managed service's TLS, or a load balancer with an ACM / managed certificate). Point the health check at `/healthz`.
5. Scale to at least 2 instances. Add a WAF (AWS WAF / Cloud Armor / Front Door) and send logs to the cloud's logging service.

There's no desktop app. Everything runs in the browser, including on phones (the layout is responsive, with a dark mode).

---

## What's simulated, and what to plug in next

| Area | Today | Production integration (India) |
|---|---|---|
| Payment | **Dummy payment links**: agent generates a link (copy / WhatsApp / SMS / email), the customer pays on a test page, then the policy is issued with the payment reference filled in. Offline NEFT/cheque can still be recorded manually | Replace the dummy gateway in `server/src/services/payments.js` with Razorpay / PayU / Cashfree; add UPI AutoPay e-mandates for renewals |
| KYC | PAN + last 4 digits of Aadhaar captured (full Aadhaar is never stored) | CKYC lookup, DigiLocker, Aadhaar OTP e-KYC through a licensed KUA, video KYC |
| Documents | Printable HTML schedule (browser "Save as PDF") | Server-side PDF, Aadhaar eSign, policy wording and Customer Information Sheet attached |
| Notifications | None (admins share temporary passwords themselves) | Email (SES / SendGrid), SMS (DLT-registered templates), WhatsApp Business API |
| Rates | Illustrative starter rates | Each insurer's actuarially certified, IRDAI-filed rates, entered in the configurator |
| Claims | Out of scope | Possible later: NHCX (National Health Claims Exchange) integration |

See [`docs/BUILD-GUIDE.md`](docs/BUILD-GUIDE.md) for a step-by-step account of how the platform was built, and [`docs/INDIA-STRATEGY.md`](docs/INDIA-STRATEGY.md) for how to take it to market in India.
