# Security

This document records the security model of the Utiligent platform and the
hardening applied to its Supabase backend.

- **Supabase project:** Utiligent Core (`ehysifztspotxmmmkuyc`)
- **Database schema:** all application data lives in the `app` schema (not `public`).
- **Last hardening pass:** 2026-06-03

---

## Architecture & trust model

| Surface | Role used | Enforcement |
|---|---|---|
| Web app reads (`.from(...)`) | `authenticated` (user session) | Row Level Security (RLS) |
| Web app, logged-out | `anon` | Middleware redirects to `/login`; RLS denies data |
| Device telemetry | `ingest` edge function → `service_role` | In-function HMAC + replay/nonce checks; bypasses RLS |
| Mutations (alerts, commands, gateways) | SECURITY DEFINER RPCs | Each function self-authorizes (`can_manage_org` / `can_control_device`) |

Key points:

- The browser/server/middleware Supabase clients all use the **anon key** with
  `{ db: { schema: "app" } }`. The anon key is public by design — **RLS is the
  enforcement boundary**, not the key.
- The `service_role` key is used **only** server-side in the `ingest` edge
  function. It must never be exposed to the browser.
- `app.readings` is a **partitioned** table (monthly `readings_YYYY_MM`). RLS
  policies live on the parent; partitions inherit them.

---

## RLS policy conventions

Every table in `app` has RLS enabled. Policies follow a **one-policy-per-action**
shape (do not reintroduce a single `FOR ALL` policy alongside a `SELECT` policy —
that triggers the `multiple_permissive_policies` linter):

- `<table>_sel` — `FOR SELECT USING (access_expr OR manage_expr)`
- `<table>_ins` — `FOR INSERT WITH CHECK (manage_expr)`
- `<table>_upd` — `FOR UPDATE USING (manage_expr) WITH CHECK (manage_expr)`
- `<table>_del` — `FOR DELETE USING (manage_expr)`

Helper predicates (`app.can_access_org`, `app.can_manage_org`, `app.can_access_site`,
`app.can_access_building`, `app.can_access_unit`, `app.can_control_device`,
`app.has_permission`, `app.user_has_permission`, `app.is_platform_admin`,
`app.is_org_descendant`):

- Are `SECURITY DEFINER` and **must remain executable by `anon` and `authenticated`** —
  RLS evaluation calls them, and revoking would make anon REST reads error (500)
  instead of returning an empty set. The advisor warning on these is expected.
- Invariant relied on: `can_manage_org ⊆ can_access_org` (a manager is always an
  active member).

Always wrap `auth.uid()` as `(select auth.uid())` inside policy expressions so it
is evaluated once per query (InitPlan), not per row.

---

## Function EXECUTE grants (least privilege)

| Category | anon | authenticated | Notes |
|---|---|---|---|
| RLS helper predicates | ✅ | ✅ | Required for RLS; safe boolean predicates |
| User-facing RPCs (`acknowledge_alert`, `resolve_alert`, `issue_command`, `provision_gateway`, `revoke_gateway`) | ❌ | ✅ | Self-authorize internally |
| Internal cron/maintenance + `verify_gateway_secret` | ❌ | ❌ | Run by pg_cron / service_role only |
| Trigger & event-trigger functions | ❌ | ❌ | Fire by mechanism; never call via REST |

> **Gotcha:** some trigger functions carried a default `PUBLIC` EXECUTE grant.
> `REVOKE ... FROM anon, authenticated` is a no-op in that case — you must
> `REVOKE ... FROM PUBLIC`.

When adding a new SECURITY DEFINER RPC that mutates data, `REVOKE EXECUTE ... FROM anon`
and authorize inside the function.

---

## Readings partitions

The monthly pg_cron job `app.ensure_future_reading_partitions(6)` creates future
partitions via `app.create_readings_partition_for_month`, which **enables RLS on
each new partition**. If you edit that function, keep the
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` line — otherwise new partitions are
created publicly readable/writable via the anon key.

---

## Manual configuration checklist (Supabase Dashboard)

These are platform/Auth settings — they are **not** in the database and cannot be
set via SQL/migrations. Configure them in the Dashboard for project
`ehysifztspotxmmmkuyc`:

- [ ] **Authentication → Sign In / Providers → Email:** enable **"Prevent use of
      leaked passwords"** (HaveIBeenPwned check).
- [ ] **Authentication → Sign In / Providers → Email:** set **minimum password
      length ≥ 10** and require strong passwords.
- [ ] **Authentication → Multi-Factor Authentication:** enable **TOTP** (consider
      requiring it for platform admins).
- [ ] **Authentication → Settings (Advanced) → Database connections:** switch from
      a fixed connection count to **percentage-based**.

---

## Verifying security state

Run the advisors regularly (especially after DDL changes):

```
get_advisors(project_id, type='security')      # expect: no rls_disabled errors
get_advisors(project_id, type='performance')   # expect: no multiple_permissive / initplan
```

Expected, benign findings:
- `rls_enabled_no_policy` on `readings_YYYY_MM` partitions — they inherit parent policies.
- `*_security_definer_function_executable` on RLS helper predicates and user-facing RPCs — intentional.
- `unused_index` — not meaningful until there is production query history.

If a `readings` partition ever shows RLS **disabled**, that is a real exposure —
remediate immediately.
