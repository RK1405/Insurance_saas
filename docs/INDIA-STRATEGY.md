# Using HealthStack to our advantage in India

*Written November 2026. Regulatory points reflect IRDAI and GST rules as I know them. Confirm every one with a compliance adviser before launch, because IRDAI issues circulars frequently.*

## 1. Why India, why now

- **Huge, under-insured market.** Health is the largest non-life insurance segment in India, but a large "missing middle" is still uninsured: people too well-off for government schemes such as Ayushman Bharat PM-JAY, but without employer cover. NITI Aayog estimated about 30% of the population, around 40 crore people, in its 2021 report. IRDAI's stated goal is "Insurance for All by 2047".
- **Regulation now rewards speed and digital journeys:**
  - **Use-and-file product regime.** Insurers can launch most health products without waiting for prior IRDAI approval. The bottleneck moves from the regulator to the insurer's own IT. A configurator that launches a product in days is exactly what they lack.
  - **Master Circular on Health Insurance (May 2024):**
    - No upper entry-age limit, which opens up senior citizens.
    - Pre-existing disease waiting period of at most 3 years.
    - Moratorium of 5 years.
    - AYUSH treatment covered up to the sum insured.
    - A Customer Information Sheet for every policy.
    - Faster cashless approvals.

    Insurers must re-tool their products for this, and our compliance engine checks it automatically.
  - **GST removed on individual health premiums from 22 Sep 2025** (previously 18%). Retail health became about 15% cheaper overnight, demand rose, and insurers want more digital retail capacity. Group policies stay at 18%, which an employer can usually claim back as input credit. The platform handles both.
  - **Open architecture in distribution.** Corporate agents (banks, NBFCs) may tie up with several insurers per line, and brokers are multi-insurer by design. They need one system that can quote many insurers' products, which is exactly what our multi-tenant configurator and partner API provide.
  - **Liberalisation is bringing new entrants.** Parliament passed insurance law amendments in late 2025 that included 100% FDI (verify the current status). New or expanding health insurers need a front office quickly and cannot wait 12–18 months for a core-system project.
  - **Bima Sugam**, IRDAI's planned digital insurance marketplace, will reward insurers and distributors whose products can be quoted and issued through APIs.

## 2. Where HealthStack fits

We are **front-office SaaS** (quote → underwrite → issue), *not* a core policy-admin replacement. Incumbent cores such as TCS BaNCS, Sapiens, Majesco and Duck Creek are slow, costly projects. We sit in front of them and push issued policies into them through webhooks or the API.

| Our feature | Indian pain it solves |
|---|---|
| Product configurator + versioning | Use-and-file means faster launches; insurers can't afford IT release cycles for every rate change |
| IRDAI compliance checks on publish | Product teams re-filing for the May 2024 master circular; prevents non-compliant plans going live |
| Digital health underwriting (configurable rules, STP) | Most retail proposals are clean; automating them cuts turnaround from days to minutes and frees underwriters for the 10–20% that need judgement |
| Age with no blanket cap, senior referral rules | Senior-citizen cover is now mandated and underserved; rules route seniors to medicals instead of declining them |
| City-tier pricing, mobile-first UI | Growth is in tier 2/3 towns, sold by agents and bank staff on phones |
| SME census upload + group rating | About 6 crore registered MSMEs; most offer no health cover. Employees above the ESIC wage ceiling are often uninsured. Group health also gets GST input credit |
| Partner API + webhooks | Banks, NBFCs, micro-finance lenders, HRMS/payroll and fintech apps want to embed health insurance at checkout |
| Per-user lines & roles | Distributors have separate retail and SME teams; each sees only their own work |
| Audit trail, data in India, tenant isolation | IRDAI cyber-security guidelines, DPDP Act readiness, insurer IT due diligence |

## 3. Who to sell to (in priority order)

1. **Brokers and corporate agents doing SME group health** *(fastest win)*. Today they quote from Excel and email insurers. Give them census upload, multi-insurer rate cards and instant quotes. Revenue: a monthly SaaS fee per seat or per broker branch.
2. **HRMS, payroll and fintech platforms** *(embedded distribution)*. They plug into `/api/v1/quotes/sme` and offer "add health insurance for your team" inside their product. They need a licensed partner (a broker or insurer) on the other side; we connect the two.
3. **Mid-sized general insurers and standalone health insurers** *(bigger contracts, slower sales)*. Retail digital underwriting and the configurator, white-labelled. Revenue: setup fee plus a per-policy or per-life fee, or a small percentage of premium. Example levels to test: ₹50–150 per retail policy, ₹10–30 per SME life per year.
4. **New entrants** that need a full front office from day one.

## 4. Regulatory guard-rails for *us* (important)

- **Stay a technology provider.** Without an IRDAI licence (broker, corporate agent or web aggregator) we must **not** solicit customers, sell policies or take commission or lead fees linked to premium. Charge insurers and distributors a **technology fee**, or partner with a licensed intermediary. If we later want distribution revenue, apply for a broker or web-aggregator licence.
- **Insurers keep the underwriting decision.** IRDAI's outsourcing rules don't let insurers outsource core functions such as underwriting decisions. Our engine applies **the insurer's own rules** and the insurer's underwriters decide referred cases. That's how the product works today; keep it that way in contracts and marketing.
- **Data protection:**
  - Host in India (AWS Mumbai/Hyderabad, GCP Mumbai/Delhi, Azure Central/South India).
  - Follow the **IRDAI Information & Cyber Security Guidelines 2023** and **CERT-In** rules: report incidents within 6 hours, keep logs for 180 days.
  - Prepare for the **DPDP Act 2023 / DPDP Rules 2025**: explicit consent for health data, purpose limitation, breach notification and deletion on request. We are a *processor* for insurers, so sign data processing agreements with them.
  - Never store full Aadhaar numbers. The app already stores only the last 4 digits.
- **Rates are the insurer's.** The starter rates in the app are illustrative only. Each insurer enters its Appointed Actuary-approved, filed rates.
- **Certifications to plan for:** ISO 27001, SOC 2 Type II, annual VAPT by a CERT-In empanelled auditor. Large insurers ask for these in procurement.

## 5. India-specific roadmap (next 3–6 months)

1. **Payments:** Razorpay, PayU or Cashfree payment links with automatic confirmation; **UPI AutoPay** for monthly/EMI premiums and renewals.
2. **KYC:** CKYC search and download; DigiLocker and Aadhaar OTP e-KYC through a licensed KUA partner; PAN verification; GSTIN validation for SME.
3. **Documents:** server-side PDF policy schedule, **Customer Information Sheet**, **Aadhaar eSign** of the proposal form, Section 80D premium certificate.
4. **Communication:** WhatsApp Business API quote and policy delivery; SMS through DLT-registered templates; **vernacular UI** (Hindi, Marathi, Tamil, Telugu, Bengali, Kannada) for tier 2/3 agents.
5. **Data pre-fill:** PIN code → city tier mapping; optional ABHA / ABDM health records (with consent) to pre-fill declarations and reduce non-disclosure.
6. **Renewals and portability:** renewal reminders, no-claim bonus carry-forward, and porting from another insurer (waiting-period credit), all of which IRDAI requires insurers to honour.
7. **Multi-insurer comparison for brokers:** one census goes to several insurers' products and comes back as a comparison sheet.
8. **Later:** claims intimation and pre-authorisation through **NHCX**, the National Health Claims Exchange, and listing on **Bima Sugam**.

## 6. 90-day go-to-market plan

| Weeks | Goal |
|---|---|
| 1–3 | Deploy to the Mumbai region; add Razorpay + PDF + WhatsApp; legal: terms, DPA, privacy policy (DPDP); start ISO 27001 gap assessment |
| 3–6 | 3 design partners: one SME broker, one HRMS/fintech, one mid-size insurer's retail team. Load their real rate cards into the configurator |
| 6–10 | Pilot live quotes. Track the dashboard numbers that sell the product: **straight-through rate, quote-to-policy time, conversion** |
| 10–13 | Publish case studies ("SME quote in 2 minutes instead of 2 days", "70% of retail proposals auto-approved"); start pricing per policy or per life; begin SOC 2 |

**The pitch in one line:** *"Launch an IRDAI-compliant health product in days, quote a family or a 50-employee company in under two minutes, and auto-approve most proposals, without replacing your core system."*
