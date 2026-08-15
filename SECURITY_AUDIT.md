# Security Audit

Date: 2026-08-15  
Scope: `skywin-bill` repository (Next.js 16 / React 19 / Drizzle / PostgreSQL).  
Method: static analysis of authentication, authorization, API routes, server actions, financial/inventory mutations, cookies, secrets, and headers. No production data was mutated.

## Executive Summary

Overall assessment:

```text
HIGH RISK (before) → MODERATE (after code fixes; deploy required)
```

The production cookie `skywin_session=2:admin` was an **unsigned `userId:role` string**. Changing the numeric ID impersonated any user. The role fragment was **not** used for database authorization (`getCurrentUser` loaded the user from PostgreSQL), but `proxy.ts` **did** trust the cookie role for page gating, so a dealer could open admin UI routes. Combined with several Server Actions that had no `requireUser()` / role checks, this was a practical privilege-escalation and impersonation issue.

After the fixes in this change set, sessions are HMAC-SHA256 signed, API keys fail closed, mutations enforce login and role, and customer-scoped queries deny unauthenticated HTTP access. **Old cookies stop working after deploy; every user must log in again.** Remaining risk is mainly business-logic (client-supplied POS rates), cookie-only logout (no server session store), default/shared API keys, and in-memory rate limits.

This is a **single-company** Skywin deployment, not multi-tenant SaaS. Isolation is by staff role → visible customer IDs, not `tenant_id`.

## Architecture

- **App:** Next.js 16.2.9 App Router, React 19, `output: "standalone"`. Edge gating is `proxy.ts` (not `middleware.ts`).
- **Auth:** Admin phone `9999999999` + `ADMIN_PASSWORD`. Other users: WhatsApp OTP (Interakt).
- **Sessions:** Cookie `skywin_session`. Now `userId.role.exp.hmac` (Web Crypto HMAC-SHA256). Role in the cookie is used only for route gating after signature verification. Identity and privileges are reloaded from `users`.
- **Roles:** `admin`, `regional_manager`, `sales_officer`, `dealer`.
- **Data scope:** `getVisibleCustomerIds()` / `getScopedCustomerIds()`. Admin = all customers. Dealer = linked customer. Officer/RM = mapped dealers.
- **Database:** PostgreSQL via Drizzle (`postgres` driver). Parameterized `sql` fragments. No Supabase, no Prisma.
- **APIs:** `/api/qwicks/*`, `/api/updateInventory/[merchantId]`, `/api/widget`. `proxy.ts` skips `/api/` — these use `x-api-key`.
- **Mutations:** Server Actions under `lib/actions/*`.
- **Trust boundary:** Browser is untrusted. Nginx terminates TLS. Do not trust `Host` / `X-Forwarded-*` from clients except via the reverse proxy.

## Findings

### SEC-001

Title: Client-controlled unsigned session cookie (`userId:role`)

Severity: Critical

Affected component: Authentication / `skywin_session`

Affected files: `lib/actions/auth.ts` (previous), `proxy.ts` (previous)

Description: The cookie was set to `` `${user.id}:${user.role}` `` with no MAC. `getCurrentUser` parsed the ID and loaded that row. `proxy.ts` split on `:` and trusted the role for `/users`, `/settings`, and dealer allowlists.

Impact: Any logged-in user (or anyone who obtained a cookie) could impersonate another user by changing the ID. Forging `:admin` opened admin pages.

Attack scenario: Set `skywin_session=2:admin` or `skywin_session=<victimId>:dealer`.

Remediation: HMAC-signed tokens in `lib/session.ts`. Legacy `2:admin` is rejected. Authorization uses the database user. Cookie flags: HttpOnly, Secure in production, SameSite=Lax, 7-day expiry.

Status: Fixed (requires deploy)

Verification: `npm run test:security` — rejects legacy cookie, forged role, swapped user id.

### SEC-002

Title: Qwicks/inventory API fail-open when API key unset

Severity: High

Affected component: `/api/qwicks/*`, `/api/updateInventory/*`, `/api/widget`

Affected files: previous route-local `verifyApiKey`; now `lib/api-auth.ts`

Description: `if (!configuredKey) return true` allowed unauthenticated inventory and order APIs when settings had an empty key.

Impact: Inventory dump, stock mutation, and order ingestion without a key.

Remediation: Fail closed. Compare SHA-256 digests with `timingSafeEqual`.

Status: Fixed

Verification: `lib/api-auth.test.ts`; routes call `verifyQwicksApiKey` / `verifyWidgetApiKey`.

### SEC-003

Title: Server Actions missing authentication and role checks

Severity: High

Affected component: Server Actions

Affected files: `lib/actions/sales.ts`, `billing.ts`, `products.ts`, `purchases.ts`, `purchase-orders.ts`, `quotations.ts`, `suppliers.ts`, `tally.ts`, `eway.ts`, `users.ts`

Description: Next.js Server Actions are callable without the UI. Several mutations had no `requireUser()`. `updateSettings` had no admin check. Dealers could theoretically call `adjustStock`, `createPurchase`, `deleteProduct` even though the UI hid those pages.

Impact: Unauthenticated or low-privilege callers could create sales, change stock, or change settings.

Remediation: `requireUser`, `requireAdmin`, `requireNonDealer`, `requirePurchasingAccess` aligned with `proxy.ts` UI rules. `createSale` / receipts / customer updates also call `assertCustomerAccess`.

Status: Fixed

Verification: Typecheck of action entry points; security tests cover session tokens. Full HTTP action tests are not in the repo (no request test harness).

### SEC-004

Title: Unauthenticated queries treated missing user as “see all customers”

Severity: High

Affected component: Customer-scoped reads

Affected files: `lib/queries/sales.ts`, `customers.ts`, `returns.ts`, `payments.ts`, `dashboard.ts`

Description: `if (user) { customerIds = getVisibleCustomerIds(user) }` left `customerIds === null` (admin/unscoped) when there was no session. Invoice PDF pages and lists could leak company-wide data if the action/page ran without a user.

Impact: IDOR-style disclosure of invoices/customers if auth on the page was skipped.

Remediation: `getScopedCustomerIds()` returns `[]` for unauthenticated HTTP requests, scoped IDs for staff, `null` (unscoped) only for CLI/scripts where `cookies()` throws. `getCustomerById` and `searchSalesForReturn` now apply the same scope.

Status: Fixed

Verification: Code review of query helpers. CLI smoke scripts still unscoped when run outside a Next request.

### SEC-005

Title: Cookie missing SameSite; logout is client-cookie only

Severity: Medium

Affected component: Session cookie

Affected files: `lib/actions/auth.ts`

Description: Production cookies had HttpOnly and Secure but no SameSite. Logout only deletes the cookie. There is no server-side session table, so a stolen cookie works until `exp`. Role changes are not fully effective until re-login for **route gating** (DB role is used for mutations). Disabled users: there is no `disabled` column; deleted users fail `getCurrentUser` (row missing).

Impact: Cross-site cookie sending (mitigated by SameSite=Lax now). Stolen cookies remain valid until expiry.

Remediation: SameSite=Lax added. Server-side revocation is **not** implemented (would need a sessions table).

Status: Partially fixed

Verification: Cookie options in `setSession`. Logout still cookie-delete only.

### SEC-006

Title: POS trusts client unit price and GST rate

Severity: Medium — REQUIRES BUSINESS DECISION

Affected component: `createSale`

Affected files: `lib/queries/sales.ts`, POS client

Description: Line `rate` and `gstRate` come from the client. Totals, tax split, and round-off are recalculated server-side from those lines (`calculateGstBreakdown`). Client `grandTotal` is not stored as-is. Discounts are capped 0–100% for percent type. Quantities must be positive. This is intentional for wholesale/custom lines.

Impact: A cashier can under-price inventory items.

Remediation: Not blindly forced to DB `saleRate` — would break negotiated wholesale and custom items.

Status: Open (business)

Verification: Schema `qty` positive, `rate` nonnegative, percent discount max 100. Totals from GST helper.

### SEC-007

Title: Default inventory PIN and hardcoded fallback API keys

Severity: Medium

Affected component: Settings defaults

Affected files: `lib/settings.ts`, `lib/widget-script.ts`

Description: Default PIN `1234`. Default Qwicks/widget keys exist in source as fallbacks if DB settings are empty. Widget JS embeds the widget key by design (shared secret for Scriptable).

Impact: If production still uses defaults, inventory PIN and widget/Qwicks APIs are guessable from git.

Remediation: Do not change live keys in this pass (would break Qwicks/widget). Rotate keys in Settings after deploy if they still match defaults. Require PIN change in production.

Status: Open (operational)

Verification: Defaults visible in `DEFAULT_SETTINGS`.

### SEC-008

Title: In-memory login/OTP rate limit; OTP stored in plaintext in DB

Severity: Medium

Affected component: Auth

Affected files: `lib/actions/auth.ts`

Description: ~8 attempts / 10 minutes per key in a process-local `Map` (resets on restart; not shared across instances). OTP is stored in `users.otp` in plaintext; comparison is hashed+timing-safe.

Impact: Brute force is slowed but not durable. DB readers can see active OTPs.

Remediation: Rate limit added. Hashing OTP at rest is not done (short-lived).

Status: Partially fixed

Verification: `tooManyAttempts` on admin login, send OTP, verify OTP.

### SEC-009

Title: Missing security headers (pre-fix)

Severity: Low

Affected component: HTTP responses

Affected files: `next.config.ts`

Description: No `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. CSP not set (Next.js inline scripts would need a nonce strategy).

Impact: Clickjacking, MIME sniffing. Camera permission is required for barcode scanning.

Remediation: Headers added; `camera=(self)` for the scanner. CSP deferred to avoid breaking Next hydration. HSTS belongs on Nginx.

Status: Partially fixed

Verification: `next.config.ts` `headers()`.

### SEC-010

Title: `.env.production` was not gitignored

Severity: Low (no committed env file found in the working tree)

Affected component: Secrets hygiene

Affected files: `.gitignore`

Description: `.env` and `.env*.local` were ignored; `.env.production` was not. A future commit could leak `DATABASE_URL` / `ADMIN_PASSWORD`.

Remediation: Ignore `.env.production` and `.env.development`. `.env.example` documents `SESSION_SECRET` without real secrets.

Status: Fixed

Verification: `.gitignore`; glob found only `.env.example`.

### SEC-011

Title: `xlsx` dependency known-vulnerable; no full CSP; Nginx version disclosure

Severity: Low

Affected component: Excel import, edge, reverse proxy

Affected files: `package.json` (`xlsx`), Nginx (not in repo)

Description: SheetJS `xlsx` 0.18.x has published prototype-pollution / ReDoS advisories. Import is admin/staff-only after `requireNonDealer`. Nginx `Server` version is informational. No repo Nginx config to harden.

Impact: Malicious spreadsheet could attack the Node process if a privileged user imports it.

Remediation: Not blindly upgraded (API breakage). Prefer `exceljs` in a later change. Hide Nginx version in ops.

Status: Open

Verification: `npm audit` (see verification section).

### SEC-012

Title: HMAC secret may fall back to `ADMIN_PASSWORD`

Severity: Low

Affected component: Sessions

Affected files: `lib/session.ts`

Description: Signing key is `SESSION_SECRET` or `ADMIN_PASSWORD`. Changing the admin password invalidates all sessions (good) but couples session crypto to the password.

Remediation: Set a dedicated `SESSION_SECRET` in production.

Status: Open (config)

Verification: `getSecret()` in `lib/session.ts`.

## Authorization matrix (intended, after fix)

| Operation | Admin | Regional manager | Sales officer | Dealer |
| --- | ---: | ---: | ---: | ---: |
| POS sale | yes | yes | yes | yes (own customer) |
| View invoices | all | scoped | scoped | scoped |
| Sale return | yes | yes | yes | no (action + UI) |
| Adjust stock / products mutate | yes | yes | yes | no |
| Purchases / suppliers | yes | yes | no | no |
| Users / settings / widget | yes | no | no | no |
| Tally / e-way export | yes | yes | yes | no |

Dealer creating arbitrary walk-in cash sales (no `customerId`) is allowed by POS design.

### SEC-013

Title: Next.js 16.2.9 published advisories (proxy bypass, Server Action DoS/SSRF)

Severity: High (dependency; not patched in this change)

Affected component: `next@16.2.9`

Affected files: `package.json`

Description: `npm audit` reports GHSA-6gpp-xcg3-4w24 (middleware/proxy bypass with Turbopack + single locale), Server Action DoS, and related cache/SSRF issues through 16.3.0-preview. Remediation in the advisory is `next@16.3.1`. This app uses `proxy.ts` for auth gating.

Impact: Depends on whether production uses Turbopack and a matching locale setup. Production `next start` of a standalone build is less likely to hit the Turbopack bypass; Server Action payload DoS remains relevant.

Remediation: Upgrade Next to 16.3.1 in a dedicated change and re-test login, POS, and proxy redirects. Not applied here to avoid an untested framework jump in the same session as session-cookie changes.

Status: Open

Verification: `npm audit --omit=dev`

## Checklist

- [x] Authentication verified (signed session; DB user load)
- [x] Secure session handling verified (HMAC, expiry, HttpOnly, Secure, SameSite=Lax)
- [ ] Logout invalidation verified (cookie deleted; no server revoke)
- [x] RBAC verified (actions aligned with proxy; DB role for mutations)
- [x] Admin endpoints protected (`requireAdmin` on users/settings)
- [x] IDOR protections verified (customer scope on invoices/customers/returns/receipts)
- [x] Tenant isolation verified (single company; staff/customer scope)
- [x] Database queries reviewed (Drizzle parameterized)
- [x] Input validation implemented (Zod on sales and several mutations; not every field globally)
- [ ] Financial calculations server-side (totals yes; unit price/GST rate still client — SEC-006)
- [x] Inventory operations protected (auth + non-dealer; transactional batch qty)
- [x] Payment verification protected (no payment gateway; cash/UPI/credit recorded by staff)
- [x] CSRF reviewed (SameSite=Lax + Server Actions origin; no custom CSRF tokens)
- [x] CORS reviewed (no credentialed `*` CORS layer in app)
- [x] XSS reviewed (no `dangerouslySetInnerHTML`)
- [x] SQL injection reviewed
- [x] SSRF reviewed (no user-URL fetch found)
- [x] File upload security reviewed (Excel import is parsed rows, not arbitrary filesystem writes)
- [x] Secrets reviewed (no `NEXT_PUBLIC_` secrets; widget key is intentionally public-to-device)
- [x] Environment files reviewed
- [x] Security headers reviewed (basic set; no CSP)
- [ ] CSP reviewed (not deployed — would need Next nonce work)
- [x] Rate limiting reviewed (login/OTP in-memory only)
- [x] Logging reviewed (OTP logged only in development)
- [ ] Dependency vulnerabilities reviewed (`xlsx` has no fix; Next 16.2.9 advisories — SEC-013)
- [x] Race conditions reviewed (sale insert uses SQL CTEs / transactions for stock)
- [ ] Idempotency reviewed (no idempotency keys on POS double-submit)
- [x] Automated security tests passing
- [ ] Existing tests passing (no general unit/integration suite)
- [x] Production build passing (`next build --webpack` on this machine; default `next build` needs native SWC)
