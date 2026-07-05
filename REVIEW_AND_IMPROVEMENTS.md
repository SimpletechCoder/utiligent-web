# Utiligent Platform — Review & Improvements

**Date:** 2026-07-05
**Branch:** `improvement/full-review-july-2026`
**Reviewer:** full-stack review of the Next.js web app + Supabase backend model

> Scope note: this pass reviewed the application source and the documented
> Supabase security model (`SECURITY.md`). The Supabase MCP backend was **not
> reachable** in this session, so RLS policies, indexes, and edge functions
> could not be inspected live — findings that depend on the database are called
> out as **"verify against DB"**. `node_modules` was not installed, so
> `next build` / `eslint` / `tsc` were **not run**; changes were made carefully
> by hand and should be validated with a build before merge.

---

## 1. Current state

A multi-tenant utilities-management dashboard built on **Next.js 16 (App Router,
React 19)** with **Supabase** (Postgres in the `app` schema, RLS-first security,
an `ingest` edge function for device telemetry).

### What's working (wired to live data)
- **Auth**: email/password login, self-service signup with email verification,
  password reset. Middleware refreshes the session and gates all non-auth routes.
- **Dashboard**: KPI cards, recent alerts, recent audit activity — all live.
- **Meters / Sites / Gateways / Alerts** list pages — live reads.
- **Gateway detail** page with linked meters and setup instructions.
- **Settings**: org settings, users & invites, permission profiles, gateway
  profiles/drivers/instructions, reseller management, branding/white-label.
- **Theming**: dark mode + per-org branding (colors, logo, app name) via CSS
  variables and a React context, persisted to `localStorage`.

### What's stubbed / incomplete
- **Billing**: a **mockup**. Shows a hardcoded `R35/meter` flat rate; the spec
  requires **R145 / R65 / R50 tiers + R95 add-on**. **No Peach Payments
  integration** exists (no SDK, no payment methods, no webhook handler).
- **Leak detection**: not present in the app (may exist as alerts data only).
- **Valve control / device commands**: **not implemented** — there is no
  `issue_command` path anywhere in the UI.
- **PWA**: **not implemented** — no `manifest`, no service worker, no offline
  support.
- **Gateway "advanced" add mode**: was a dead form (now wired — see §2).
- **Org switcher / true multi-tenant UX**: the app assumes **one org per user**
  and leans entirely on RLS + `.limit(1).single()` to pick "the" organization.

### Architecture observations
- **Mutations bypass the documented RPC layer.** `SECURITY.md` describes
  `SECURITY DEFINER` RPCs (`provision_gateway`, `revoke_gateway`,
  `issue_command`, `acknowledge_alert`, `resolve_alert`) as the mutation path.
  **The app calls none of them** (`grep -r '.rpc(' src` → 0 hits). Every write is
  a direct client-side table write relying solely on RLS. That is acceptable
  *only if* RLS is airtight; it also means alert ack/resolve and device commands
  are simply absent.
- **Server-side auth boundary was thin.** Only one server action existed
  (`inviteUser`) and it used the **service-role key** with no permission check.

---

## 2. What was fixed in this branch

| # | Area | Change | File(s) |
|---|------|--------|---------|
| 1 | **Security headers** | Added CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; disabled `x-powered-by`. | `next.config.ts` |
| 2 | **Broken access control (critical)** | `inviteUser` created auth accounts via the **service-role key** after only an `if (!caller)` check. Now requires the caller to hold `user.invite` **and** be an active member of the target org. Added the same org-scoped authorization to `updateMember` / `removeMember`. | `src/app/actions/users.ts` |
| 3 | **Insecure gateway secret (critical)** | The API key was generated **client-side with `Math.random()`**, regenerated on every render (so the key shown never matched the key stored), and inserted directly. Replaced with a server action `createGateway` that mints the key with `crypto.randomBytes`, enforces `gateway.add` + org membership, and returns the key **once**. | `src/app/actions/gateways.ts`, `src/components/gateway-add-wizard.tsx` |
| 4 | **Open redirect** | `next` param in the auth callback is now validated to be a same-origin relative path (rejects `//host`, `/\host`, absolute URLs). | `src/app/auth/callback/route.ts` |
| 5 | **Missing permission check** | The audit log page had a *commented-out* `audit.view` check with a `TODO`. Split into a server guard (`page.tsx`) that enforces `audit.view` + a client component. | `src/app/dashboard/audit/page.tsx`, `src/components/audit-log-client.tsx` |
| 6 | **Logic bug** | Editing a permission profile never removed flags — the diff compared `editingProfile.flags` against itself. Rewrote as delete-all-then-insert of the desired set. | `src/components/settings/permission-profiles-tab.tsx` |
| 7 | **Broken advanced gateway form** | The "advanced mode" Create button had no handler and inputs were uncontrolled. Wired to controlled state + the new `createGateway` action. | `src/components/gateway-add-wizard.tsx` |
| 8 | **Incorrect audit trail** | Gateway approval wrote `approved_by: 'current-user-id'` (a literal string). Now uses the real authenticated user id. | `src/components/settings/gateway-profiles-tab.tsx` |
| 9 | **Account enumeration** | Forgot-password surfaced per-email errors. Now always shows the same neutral success screen. | `src/app/auth/forgot-password/page.tsx` |
| 10 | **Theme flash (FOUC)** | Dark-mode users saw a light flash on load. Added a pre-hydration inline script + explicit `viewport` export. | `src/app/layout.tsx` |

---

## 3. Still needs work (prioritized)

### P0 — Security, verify/act before production
1. **Audit the RLS policies against the direct-write surface (verify against DB).**
   Every settings mutation (`memberships`, `permission_profiles`,
   `permission_profile_flags`, `user_permission_overrides`, `organizations`,
   `reseller_permission_caps`, `gateway_profiles`, `integration_drivers`,
   `gateways`) is a **direct client write**. If any policy is missing or too
   loose, a user could e.g. grant themselves flags via
   `user_permission_overrides` or edit another org's data. This is the single
   most important thing to confirm.
2. **Move privileged mutations to the documented RPCs.** Provision/revoke
   gateways, issue commands, and ack/resolve alerts should go through the
   `SECURITY DEFINER` RPCs in `SECURITY.md` (the gateway RPC also mints the HMAC
   `signing_key` the ingest function expects — the current stopgap only sets
   `api_key`).
3. **Complete the Supabase Auth hardening checklist** in `SECURITY.md` (leaked-
   password protection, min length ≥ 10, TOTP MFA) — these are dashboard
   settings, not code.
4. **Add CAPTCHA / bot protection to signup** (open self-registration today).

### P1 — Feature completeness (spec gaps)
5. **Billing**: replace the hardcoded `R35/meter` mock with the real tier model
   (**R145 / R65 / R50 + R95 add-on**) and integrate **Peach Payments**
   (checkout + **webhook signature verification** + payment-method management).
   Store the tier on the organization, not in the component.
6. **Valve control / device commands** UI backed by `issue_command`.
7. **Alert lifecycle**: acknowledge / resolve actions (RPCs exist per docs).
8. **Leak-detection** surfacing (rules + dashboard).
9. **PWA**: add `manifest.webmanifest`, icons, and a service worker.

### P2 — Correctness, UX, quality
10. **Multi-tenant correctness**: introduce an explicit "current organization"
    (org switcher / context) instead of `.limit(1).single()`; users in multiple
    orgs currently get an arbitrary one.
11. **Reseller tab defense-in-depth**: gate `ResellerTab` on `isPlatformAdmin`
    inside the component (currently relies only on parent tab routing).
12. **Email display for members**: `users-tab` shows `user_id.slice(0,8)…`
    because it can't join `auth.users` from the client — add a server action to
    resolve emails.
13. **Typing & logs**: replace `any` types in list pages and settings tabs;
    demote stray `console.error` calls or route them to real logging.
14. **Performance (verify against DB)**: confirm indexes on hot filter columns
    (`alerts.status`, `audit_logs.created_at`, `gateways.organization_id`,
    `meters.gateway_id`, etc.); `sites` page fetches all buildings/meters and
    filters in memory — push aggregation to the query.
15. **CSP hardening**: upgrade from `'unsafe-inline'` scripts to a nonce-based
    policy (requires threading a nonce through middleware).

---

## 4. How to verify these changes

```bash
npm install
npm run build      # confirm the app compiles (not run in this session)
npm run lint
npm run dev        # smoke-test: login, add a gateway (guided + advanced),
                   # edit a permission profile's flags, open the audit log
                   # as a user without audit.view
```

Also confirm the security headers are present:
`curl -sI http://localhost:3000/login | grep -i 'content-security-policy\|strict-transport\|x-frame'`.
