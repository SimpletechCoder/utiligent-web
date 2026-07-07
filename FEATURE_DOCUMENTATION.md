# Site Management, Mapping & Reseller Billing — Feature Documentation

Branch: `feature/site-management-billing`
Base: `main`

This document describes the site-management, dashboard-mapping, per-site reseller
billing, permission-inheritance, super-admin reseller view, user-to-site
assignment, and audit-log enhancements added to the Utiligent platform.

---

## Code-Review Hardening (post-review)

Six review findings were fixed on this branch. Summary (details in the relevant
sections below):

1. **Billing server authority (CRITICAL)** — `saveSiteBillingConfig` no longer
   trusts client base prices. It reads the live meter count, computes base
   prices server-side, and accepts only the reseller adjustment (validated ≥ 0)
   plus the add-on's meter coverage. The UI shows base price read-only.
   → [§4](#4-server-action-api-reference), [§6](#6-billing-pricing-logic).
2. **Admin-access-request RLS (HIGH)** — the INSERT policy now requires
   `app.is_platform_admin()` (was: any authenticated user). → [§3.6](#36-rls-policies).
3. **Site-membership integrity (HIGH)** — a `BEFORE INSERT/UPDATE` trigger
   enforces that the site belongs to the stated org and the user is an active
   member of it; `assignUserToSite` also verifies this. → [§3.4](#34-site_memberships--new-table).
4. **Permission caps enforced server-side (MEDIUM)** — new `permissions.ts`
   server actions (`saveProfileFlags`, `saveUserOverrides`) reject grants that
   exceed the org's caps (or are platform-only); the profile/override UIs now
   write through them. → [§4](#4-server-action-api-reference), [§7](#7-permission-inheritance-model).
5. **Billing RLS tightened (MEDIUM)** — `site_billing_configs` SELECT now
   requires the `site.billing.view` flag (or org-manage); the site page gates
   the billing section on it. → [§3.6](#36-rls-policies).
6. **Filtered queries (MEDIUM)** — the organizations pages now scope queries
   with `.in()`/`.eq()` and count aggregates instead of fetching whole tables.
   → [§10](#10-known-limitations--follow-ups).

---

## Code-Review Hardening — Round 2

A second review round fixed seven more findings:

1. **Org-scoped permission resolution (CRITICAL)** — `getUserPermissions()` and
   `userHasPermission()` now **require an `organizationId`** and resolve the
   caller's *active* membership in that specific org. Previously they took the
   first membership found, so a multi-org user could get the wrong org's
   permissions. Every call site passes the target org (the org that owns the
   site/gateway, or `getCurrentOrgId()` for "my-org" pages). → [§4](#4-server-action-api-reference), [§7](#7-permission-inheritance-model).
2. **All membership/permission writes go through server actions (HIGH)** — the
   Users, Permission-Profiles and Reseller settings tabs no longer write to
   `memberships` / `permission_profiles` / `permission_profile_flags` /
   `reseller_permission_caps` directly. New actions `createProfile`,
   `updateProfileMeta`, `deleteProfile`, `saveResellerCaps` (plus existing
   `updateMember`/`removeMember`) enforce authz, caps and audit. → [§4](#4-server-action-api-reference).
3. **Secure invite flow (HIGH)** — `inviteUser` now calls
   `admin.auth.admin.inviteUserByEmail()` (magic-link, user sets own password).
   The temporary-password / `email_confirm: true` path is removed. → [§4](#4-server-action-api-reference).
4. **Dashboard map perf (MEDIUM)** — new `getDashboardMapData()` server action
   returns a lightweight summary via a **single query with embedded
   `meters(count)` / `alerts(count)` aggregates** instead of fetching full
   datasets. → [§4](#4-server-action-api-reference), [§8](#8-map-integration-details).
5. **Typed enums + CHECK constraints (MEDIUM)** — `src/lib/types.ts` adds
   `SiteStatus`, `MembershipRole`, `SiteMemberRole`; the migration adds matching
   `CHECK` constraints on `sites.status`, `memberships.role`,
   `site_memberships.role`. → [§3.8](#38-enum-check-constraints).
6. **Audit failures logged (MEDIUM)** — `writeAudit` now `console.error`s on
   failure (still non-fatal) so silent drops are visible in server logs.
7. **No billing query without access (LOW)** — the site detail page checks
   `site.billing.view` (or manage) **before** querying `site_billing_configs`.
   → [§7](#7-permission-inheritance-model).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File-by-File Changes](#2-file-by-file-changes)
3. [SQL Migration Explained](#3-sql-migration-explained)
4. [Server Action API Reference](#4-server-action-api-reference)
5. [Component Reference](#5-component-reference)
6. [Billing Pricing Logic](#6-billing-pricing-logic)
7. [Permission Inheritance Model](#7-permission-inheritance-model)
8. [Map Integration Details](#8-map-integration-details)
9. [Setup & Deployment](#9-setup--deployment)
10. [Known Limitations & Follow-ups](#10-known-limitations--follow-ups)

---

## 1. Architecture Overview

All work builds on the existing Utiligent conventions and does not introduce new
architectural patterns:

- **Database**: Supabase, everything in the **`app` schema**. Row Level Security
  (RLS) is the enforcement boundary; the browser/server clients use the anon key
  with `{ db: { schema: "app" } }`.
- **Reads**: Server Components fetch data directly through the RLS-scoped client
  (`src/lib/supabase/server.ts`); Client Components use the browser client
  (`src/lib/supabase/client.ts`).
- **Mutations**: `"use server"` server actions that **self-authorize** — they
  verify the caller is authenticated, holds the required permission flag, and is
  an active member of the target organization — before writing. Every mutation
  emits an audit-log entry.
- **Authorization**: `permission_flags.id` is the flag string itself (e.g.
  `"site.edit"`). `userHasPermission("site.edit")` checks the caller's effective
  flag set (profile flags + per-user overrides; platform admins get all flags).
- **Theming**: Tailwind v4 tokens (`bg-surface`, `text-text`, `border-border`,
  `bg-brand`, …) that automatically adapt to dark mode via the `.dark` class and
  `useTheme()`.

### Feature map

| Feature | Entry points |
|---|---|
| Site CRUD | `actions/sites.ts`, `components/sites/site-form.tsx`, `dashboard/sites/[id]/page.tsx` |
| Dashboard map | `components/map/*`, wired into `dashboard/page.tsx` |
| Per-site billing | `lib/billing.ts`, `actions/billing.ts`, `components/sites/site-billing-section.tsx` |
| Permission inheritance | `components/settings/users-tab.tsx`, `components/settings/permission-profiles-tab.tsx` |
| Super Admin reseller view | `dashboard/organizations/*`, `actions/admin.ts`, `components/organizations/request-access-button.tsx` |
| User-to-site assignment | `components/sites/site-members-section.tsx`, `actions/sites.ts` |
| Audit log | `components/audit-log-client.tsx`, `lib/audit.ts` |
| Schema | `migrations/001_site_billing.sql` |

---

## 2. File-by-File Changes

### New — server & libraries

| File | Purpose |
|---|---|
| `migrations/001_site_billing.sql` | All new tables, RLS policies, indexes, sites GPS columns, `audit_logs` POPIA columns, seeded permission flags. |
| `src/lib/audit.ts` | `writeAudit()` — ISO/POPIA-compliant audit writer (resolves actor IP from proxy headers; non-fatal on failure). `server-only`. |
| `src/lib/billing.ts` | Pure, isomorphic pricing helpers (tiers, line-item computation, totals, formatting). Shared by UI and server action. |
| `src/lib/platform-admin.ts` | `isPlatformAdmin()` server-side helper. |
| `src/app/actions/sites.ts` | `createSite`, `updateSite`, `assignUserToSite` (verifies target org membership), `removeSiteMembership`. |
| `src/app/actions/billing.ts` | `saveSiteBillingConfig` (server-authoritative base pricing). |
| `src/app/actions/admin.ts` | `requestEditAccess`. |
| `src/app/actions/permissions.ts` | `saveProfileFlags`, `saveUserOverrides` — cap-enforcing write paths for permission flags. |

### New — pages & components

| File | Purpose |
|---|---|
| `src/app/dashboard/sites/[id]/page.tsx` | Site detail page (buildings, units, meters, gateways, billing, members, edit). Server Component. |
| `src/app/dashboard/organizations/page.tsx` | Platform-admin reseller/customer overview cards. Server Component. |
| `src/app/dashboard/organizations/[id]/page.tsx` | Read-only org drill-down + request-edit-access. Server Component. |
| `src/components/sites/site-form.tsx` | `SiteFormModal`, `AddSiteButton`, `EditSiteButton`. |
| `src/components/sites/site-billing-section.tsx` | Editable per-site billing table with totals. |
| `src/components/sites/site-members-section.tsx` | Assign/remove users to a site. |
| `src/components/map/map-types.ts` | Shared `MapSite`/`SiteHealth` types and colour/label maps. |
| `src/components/map/dashboard-map.tsx` | Map wrapper: search side panel, legend, dark-mode CSS, dynamic import. |
| `src/components/map/site-map-inner.tsx` | Leaflet `MapContainer` (client-only, `ssr:false`). |
| `src/components/organizations/request-access-button.tsx` | "Request Edit Access" button + modal. |

### Modified

| File | Change |
|---|---|
| `src/app/dashboard/page.tsx` | Added `getMapSites()` (per-site meter/gateway/alert rollup → health) and rendered `<DashboardMap>` under the stat cards. |
| `src/app/dashboard/sites/page.tsx` | Added `site.add` permission + org lookup, "Add Site" button, cards now link to detail pages. |
| `src/components/audit-log-client.tsx` | Added User + Entity ID filters; expanded row now shows IP and Before/After JSON from the new columns. |
| `src/components/settings/users-tab.tsx` | Override modal greys out flags outside the org's permission caps; saves through the cap-enforcing `saveUserOverrides` action. |
| `src/components/settings/permission-profiles-tab.tsx` | Create/edit profile modals grey out capped flags; flag writes go through the cap-enforcing `saveProfileFlags` action. |
| `src/components/sidebar.tsx` | Client-side platform-admin check adds an "Organizations" nav item. |
| `package.json` / `package-lock.json` | Added `leaflet`, `react-leaflet`, `@types/leaflet`. |

---

## 3. SQL Migration Explained

File: `migrations/001_site_billing.sql`. Wrapped in a single `begin; … commit;`
transaction and idempotent where practical (`IF NOT EXISTS`, `ON CONFLICT`).

### 3.1 `sites` — added columns

```sql
alter table app.sites
  add column if not exists latitude  numeric(10, 7),
  add column if not exists longitude numeric(10, 7);
```

WGS84 coordinates that drive the dashboard-map pins. Nullable — sites without
coordinates are listed in the side panel but not plotted.

### 3.2 `audit_logs` — POPIA/ISO columns

```sql
alter table app.audit_logs
  add column if not exists ip_address inet,
  add column if not exists old_value  jsonb,
  add column if not exists new_value  jsonb;
```

Adds structured before/after snapshots and the actor's source IP alongside the
existing `action / actor_user_id / entity_type / entity_id / created_at`. The
before/after payload is also mirrored into the existing `details` JSONB for
backward compatibility with the old audit viewer.

### 3.3 `site_billing_configs` — new table

Per-site billing config; `items` is a JSONB array of monitored line items.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `site_id` | uuid FK → `app.sites` | `on delete cascade`, **unique** (one config per site) |
| `organization_id` | uuid FK → `app.organizations` | `on delete cascade`; drives RLS |
| `currency` | text | default `'ZAR'` |
| `items` | jsonb | default `'[]'`; `[{key,label,basePrice,resellerAdjustment,quantity,addon}]` |
| `notes` | text | optional |
| `created_at` / `updated_at` | timestamptz | default `now()` |
| `updated_by` | uuid | actor who last saved |

Indexes: `(site_id)`, `(organization_id)`.

### 3.4 `site_memberships` — new table

Explicit user-to-site assignments.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `site_id` | uuid FK → `app.sites` | `on delete cascade` |
| `user_id` | uuid FK → `auth.users` | `on delete cascade` |
| `organization_id` | uuid FK → `app.organizations` | `on delete cascade`; drives RLS |
| `role` | text | default `'viewer'` |
| `created_at` | timestamptz | default `now()` |
| `created_by` | uuid | |

Constraint: `unique (site_id, user_id)`. Foreign keys: `site_id → app.sites`,
`user_id → auth.users`, `organization_id → app.organizations` (all
`ON DELETE CASCADE`). Indexes: `(site_id)`, `(user_id)`, `(organization_id)`.

**Integrity trigger** `app.validate_site_membership()` (BEFORE INSERT/UPDATE):
a cross-table CHECK is not possible, so this SECURITY DEFINER trigger rejects any
row where (a) the site's `organization_id` ≠ the row's `organization_id`, or
(b) the user is not an **active** member of that organization. `EXECUTE` is
revoked from `PUBLIC` (it fires by mechanism). The `assignUserToSite` action
performs the same membership check first for a friendlier error message.

### 3.5 `admin_access_requests` — new table

Cross-org edit-access requests raised from the read-only super-admin drill-down.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `requester_user_id` | uuid | default `auth.uid()` |
| `requester_org_id` | uuid FK → `app.organizations` | `on delete set null` |
| `target_organization_id` | uuid FK → `app.organizations` | `on delete cascade`; drives RLS |
| `reason` | text | optional |
| `status` | text | default `'pending'`, `check in ('pending','approved','denied','revoked')` |
| `created_at` | timestamptz | default `now()` |
| `resolved_at` | timestamptz | |
| `resolved_by` | uuid | |

Indexes: `(target_organization_id)`, `(requester_user_id)`, `(status)`.

### 3.6 RLS policies

RLS is **enabled on all three new tables**, following the repo's
one-policy-per-action convention (see `SECURITY.md`) using the existing
SECURITY DEFINER helper predicates. `auth.uid()` is wrapped as `(select auth.uid())`
so it evaluates once per query (InitPlan).

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `site_billing_configs` | (`can_access_org` AND `has_permission('site.billing.view')`) OR `can_manage_org` | `can_manage_org` | `can_manage_org` | `can_manage_org` |
| `site_memberships` | `can_access_org` OR `can_manage_org` OR own row | `can_manage_org` | `can_manage_org` | `can_manage_org` |
| `admin_access_requests` | own request OR `is_platform_admin` OR `can_manage_org(target)` | **`is_platform_admin` AND requester = self** | `is_platform_admin` OR `can_manage_org(target)` | `is_platform_admin` |

Two policies were tightened during review:
- **`site_billing_configs` SELECT** requires the `site.billing.view` flag (in
  addition to org access) because billing is commercially sensitive; org
  managers/platform admins retain access via `can_manage_org`. Uses the
  platform's `app.has_permission(text)` current-user predicate.
- **`admin_access_requests` INSERT** requires `app.is_platform_admin()` — raising
  a cross-org edit-access request is a platform-admin capability, not something a
  regular authenticated user may initiate.

### 3.7 Seeded permission flags

Because `permission_flags.id` is the flag string, new flags are inserted as rows
(`ON CONFLICT (id) DO NOTHING`) so that platform admins — who receive *all* flags
— pick them up, and so they can be assigned to profiles:

| Flag | Category | Platform-only |
|---|---|---|
| `site.add` | sites | no |
| `site.edit` | sites | no |
| `site.delete` | sites | no |
| `site.billing.view` | billing | no |
| `site.billing.manage` | billing | no |
| `site.member.manage` | sites | no |
| `org.reseller.view` | organizations | **yes** |

### 3.8 Enum CHECK constraints

Idempotent `CHECK` constraints keep the DB in sync with the TypeScript unions in
`src/lib/types.ts`:

| Constraint | Column | Allowed values | Validation |
|---|---|---|---|
| `sites_status_check` | `sites.status` | active, inactive, pending, suspended | `NOT VALID` (legacy-safe) |
| `memberships_role_check` | `memberships.role` | org_admin, site_manager, viewer, tenant | `NOT VALID` (legacy-safe) |
| `site_memberships_role_check` | `site_memberships.role` | site_manager, viewer, tenant | validated (new table) |

For the pre-existing `sites`/`memberships` tables the constraints are added
`NOT VALID` so the migration can't fail on legacy rows — new/updated rows are
still checked. Run `VALIDATE CONSTRAINT` after any backfill to enforce
retroactively.

---

## 4. Server Action API Reference

All actions are `"use server"`, return a discriminated `{ success, error? }`
result (never throw across the boundary), and write an audit entry on success.

> **Permission scoping (Round 2):** `userHasPermission(flag, organizationId)` and
> `getUserPermissions(organizationId)` now require the org. Actions pass the org
> that owns the resource (site/gateway/profile/membership); pages that are
> inherently "my org" use `getCurrentOrgId()`.

### `sites.ts`

#### `createSite(organizationId, input)`
- **Permission**: `site.add` + active membership of `organizationId`.
- **Params**: `organizationId: string`, `input: SiteInput` (`name`, `code`,
  `address?`, `latitude?`, `longitude?`, `timezone?`, `status?`).
- **Validation**: name & code required; lat ∈ [-90, 90]; lng ∈ [-180, 180].
- **Returns**: `{ success: boolean; error?: string; siteId?: string }`.
- **Audit**: `site.create`.

#### `updateSite(siteId, input)`
- **Permission**: `site.edit`. Org is resolved from the site row (not a
  client-supplied value) then authorized against.
- **Returns**: `{ success, error?, siteId? }`.
- **Audit**: `site.update` (with before/after snapshot).

#### `assignUserToSite(siteId, userId, role = "viewer")`
- **Permission**: `site.member.manage` on the site's org.
- **Integrity**: verifies the target user is an **active member of the site's
  organization** before assigning (also enforced by the DB trigger).
- **Behaviour**: upserts on `(site_id, user_id)`.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.member.assign`.

#### `removeSiteMembership(membershipId)`
- **Permission**: `site.member.manage` on the membership's org.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.member.remove`.

### `billing.ts`

#### `saveSiteBillingConfig(siteId, adjustments, currency = "ZAR", notes = null)`
- **Permission**: `site.billing.manage` + active membership of the site's org.
- **Params**: `adjustments: BillingAdjustmentInput[]` where
  `BillingAdjustmentInput = { key: string; resellerAdjustment: number; quantity?: number }`.
  The client sends **only** the reseller margin (and the add-on's meter coverage).
- **Server authority**: base prices, labels, the pricing tier and the metering
  quantity are all computed server-side from the site's live meter count. The
  client's `basePrice` is never trusted. `resellerAdjustment` is validated ≥ 0
  (rejected otherwise); the add-on `quantity` is clamped to `[0, meterCount]`.
- **Behaviour**: upserts on `(site_id)`; snapshots the previous config for audit.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.billing.update` (before/after).

### `permissions.ts`

#### `saveProfileFlags(profileId, flagIds)`
- **Permission**: `user.permission.override` + active membership of the profile's
  org (system profiles require platform admin).
- **Enforcement**: rejects unknown flags, platform-only flags (for non-admins),
  and any flag outside the org's `reseller_permission_caps` when a cap is set.
  Platform admins bypass caps/platform-only.
- **Behaviour**: replaces the profile's flag set (delete-then-insert).
- **Returns**: `{ success, error? }`. **Audit**: `permission.profile.flags.update`.

#### `saveUserOverrides(membershipId, overrides)`
- **Params**: `overrides: { flagId: string; granted: boolean }[]`.
- **Permission**: `user.permission.override` + active membership of the
  membership's org (or platform admin).
- **Enforcement**: only *granted* flags are cap-checked (revocations are always
  allowed); granted flags must be within caps and non-platform-only for non-admins.
- **Behaviour**: replaces the membership's overrides (delete-then-insert).
- **Returns**: `{ success, error? }`. **Audit**: `permission.override.update`.

#### `createProfile(organizationId, name, description, flagIds)` · `updateProfileMeta(profileId, name, description)` · `deleteProfile(profileId)`
- **Permission**: `user.permission.override` in the profile's org (system
  profiles are platform-admin only). `createProfile` also cap-validates the
  initial flag set.
- Replace the direct client-side `permission_profiles` writes the settings UI
  used to do. **Returns**: `{ success, error?, profileId? }`.
  **Audit**: `permission.profile.{create,update,delete}`.

#### `saveResellerCaps(organizationId, flagIds)`
- **Permission**: **platform admin only** (caps are the super-admin control point).
- **Behaviour**: replaces the org's `reseller_permission_caps` (delete-then-insert).
- **Returns**: `{ success, error? }`. **Audit**: `permission.caps.update`.

### `dashboard.ts`

#### `getDashboardMapData()`
- Read-only server action returning `MapSite[]` for the dashboard map.
- **One query** using PostgREST embedded aggregates
  (`sites … meters(count), alerts(count)` filtered to triggered), with a
  meters-only fallback if the `alerts` relationship isn't available. Health:
  `critical` if any active alert, `warning` if the site isn't `active`, else `ok`.

### `admin.ts`

#### `requestEditAccess(targetOrganizationId, reason = null)`
- **Permission**: caller must be a **platform admin**.
- **Behaviour**: reuses an existing `pending` request for the same target rather
  than duplicating; otherwise inserts a new `admin_access_requests` row.
- **Returns**: `{ success, error?, requestId? }`.
- **Audit**: `admin.access.request`.

### `lib/audit.ts`

#### `writeAudit(supabase, entry)` — not a server action, a helper
- **Params**: `entry: { organizationId, actorUserId, action, entityType,
  entityId, oldValue?, newValue? }`.
- Resolves IP from `x-forwarded-for` / `x-real-ip`, writes `ip_address`,
  `old_value`, `new_value`, and mirrors old/new into `details`.
- Intentionally **non-fatal**: an audit failure never breaks the already-applied
  mutation.

---

## 5. Component Reference

### Sites

**`SiteFormModal` / `AddSiteButton` / `EditSiteButton`** — `components/sites/site-form.tsx` (`"use client"`)
- Reusable create/edit modal. Fields: name, code, address (street/city/province/
  country/postal), latitude, longitude, timezone (SA-region select), status.
- `AddSiteButton({ organizationId })` → create mode; `EditSiteButton({ siteId, initial })` → edit mode.
- Calls `createSite`/`updateSite`, shows inline errors, `router.refresh()` on success.

**`SiteBillingSection`** — `components/sites/site-billing-section.tsx` (`"use client"`)
- Props: `siteId`, `canManage`, `currency`, `meterCount`, `initialItems`.
- Renders the billing table (Item, Qty, Base Price, Reseller Adj., Client Price,
  Margin) with a totals footer. **Base price and the metering quantity are
  read-only** (server-authoritative); only the reseller adjustment and the
  add-on's meter coverage are editable. "Reset margins" zeroes the adjustments;
  "Save Billing" sends only `{ key, resellerAdjustment, quantity? }` to
  `saveSiteBillingConfig`. Read-only when `canManage` is false. Rendered on the
  site page only when the viewer holds `site.billing.view` (or can manage).

**`SiteMembersSection`** — `components/sites/site-members-section.tsx` (`"use client"`)
- Props: `siteId`, `canManage`, `members`, `orgMembers`.
- Lists assigned users, and (when `canManage`) a picker of unassigned org members
  + a site role to assign. Calls `assignUserToSite` / `removeSiteMembership`.

### Map

**`DashboardMap`** — `components/map/dashboard-map.tsx` (`"use client"`)
- Props: `sites: MapSite[]`.
- Searchable side panel (name/code/address, sorted by health then name), legend,
  scoped dark-mode tile CSS, and the dynamically imported inner map. Clicking a
  panel row flies the map to that site (via a monotonic `focusKey` ref).

**`SiteMapInner`** (default export) — `components/map/site-map-inner.tsx` (`"use client"`)
- `react-leaflet` `MapContainer` + OSM `TileLayer`. Colored `divIcon` pins
  (no external marker images), popups with name/code/address/meter count/detail
  link, `FitBounds` (fit to sites on mount) and `FocusController` (fly-to on select).

**`map-types.ts`** — shared `SiteHealth` (`ok|warning|critical`), `MapSite`,
`HEALTH_COLORS`, `HEALTH_LABELS`.

### Organizations

**`RequestAccessButton`** — `components/organizations/request-access-button.tsx` (`"use client"`)
- Props: `organizationId`, `existingStatus?`. Opens a reason modal, calls
  `requestEditAccess`, and shows an "Edit access requested" pill when pending.

---

## 6. Billing Pricing Logic

Implemented in `src/lib/billing.ts` (pure functions, no server-only imports, so
the UI and the save action share one source of truth).

### Base price tiers (per meter, by the site's meter count)

| Meters | Price/meter | Tier label |
|---|---|---|
| 1–9 | **R145** | Standard |
| 10–99 | **R65** | Volume ("10+") |
| 100+ | **R50** | Bulk |

Plus the **Valve + Leak Detection** add-on at a flat **R95 / meter**
(`VALVE_LEAK_ADDON_PRICE`).

### Default line items

`defaultBillingItems(meterCount)` seeds two rows for a site with no saved config:
1. **Metering & Monitoring** — `basePrice = basePricePerMeter(count)`, `quantity = count`.
2. **Valve + Leak Detection** (add-on) — `basePrice = 95`, `quantity = 0` (opt-in).

### Per-line and totals maths

For each line item (`computeItem`):
- `clientPrice = basePrice + resellerAdjustment` (per unit)
- `baseTotal = basePrice × quantity`
- `clientTotal = clientPrice × quantity`
- `margin = resellerAdjustment × quantity`

`computeTotals(items)` sums `baseTotal`, `clientTotal`, and `margin` across rows.
All values are rounded to 2 decimals (`round2`, EPSILON-guarded).
`formatCurrency(amount, "ZAR")` renders `R#.##`.

**Reseller model**: base price is the cost the reseller pays; the editable
"Reseller Adjustment" is the per-unit margin the reseller adds; "Client Price" is
what the end customer pays. Margin totals surface the reseller's monthly uplift.

**Server authority (review fix #1)**: base prices are **never** accepted from the
client. `saveSiteBillingConfig` reads the site's live meter count, applies the
tier and the fixed add-on price server-side, and takes only the reseller
adjustment (validated ≥ 0) and the add-on's meter coverage (clamped to the meter
count). In the UI, base price and the metering quantity are read-only; only the
margin (and the add-on quantity) are editable. This prevents a reseller from
writing a zero/negative base cost.

---

## 7. Permission Inheritance Model

Chain: **Super Admin → Company (reseller cap) → Employee (profile / overrides)**.

The existing `reseller_permission_caps(organization_id, flag_id)` table defines
the ceiling of flags an organization may grant. The UI now enforces this cap so a
company cannot grant employees permissions beyond its own cap.

**Enforced at two layers:**

1. **UI (client)** — `users-tab.tsx` and `permission-profiles-tab.tsx` grey out,
   disable and badge ("Capped") any flag outside the cap. Logic (`isFlagCapped`):
   ```
   capsActive (the org has ≥1 cap row) AND (not platform admin) AND (flag not in cap set)
   ```
   Platform admins are never capped; with no cap rows, nothing is capped.

2. **Server write path (review fix #4)** — the flag writes go through the
   `permissions.ts` server actions (`saveProfileFlags`, `saveUserOverrides`,
   `createProfile`, `updateProfileMeta`, `deleteProfile`), which re-validate
   every *granted* flag against the org's caps (and reject platform-only flags
   for non-admins) before persisting. This closes the gap where a crafted
   request could bypass the greyed-out UI. Revocations are never blocked.
   Platform admins bypass caps.

**Org-scoped resolution (Round 2 fix #1):** effective permissions are always
resolved against the caller's **active membership in a specific organization**
(`getUserPermissions(orgId)`), never "the first membership found". A multi-org
user viewing a site in org B is evaluated against their org-B membership, not
org A. The permission-cap write checks in the actions above are likewise scoped
to the profile/membership's own org.

**Billing access (Round 2 fix #7):** the site detail page checks
`site.billing.view` (or `site.billing.manage`) *before* it queries
`site_billing_configs` — no billing data is fetched for users who can't see it,
complementing the tightened RLS SELECT policy.

---

## 8. Map Integration Details

- **Libraries**: `leaflet@^1.9`, `react-leaflet@^5`, `@types/leaflet`.
- **Client-only**: Leaflet touches `window`, so the inner map is imported with
  `next/dynamic(() => import("./site-map-inner"), { ssr: false })` **inside a
  Client Component** (`ssr:false` is not permitted in Server Components in this
  Next.js version). A spinner is shown while it loads.
- **Tiles**: OpenStreetMap raster tiles (`https://{s}.tile.openstreetmap.org/...`)
  with proper attribution. No API key required.
- **Pins**: `L.divIcon` with inline HTML (colored circle) — avoids the missing
  default-marker-image problem and lets pin colour encode health:
  green `#16a34a` (OK), amber `#d97706` (warning/offline), red `#dc2626` (critical).
- **Data source (Round 2 fix #4)**: the dashboard calls the
  `getDashboardMapData()` server action, which returns the map summary from a
  **single query** with embedded `meters(count)` / `alerts(count)` aggregates
  (falling back to meters-only if the alerts relationship is absent) — instead
  of fetching full meter/gateway/alert datasets and counting in memory.
- **Health derivation**: `critical` if the site has any active (triggered)
  alert, else `warning` if the site status isn't `active`, else `ok`.
- **Interactions**: click a pin → popup (name, code, address, meter count, "View
  site →"); search the side panel and click a row → map flies to that site;
  sites without coordinates are listed but non-clickable.
- **Dark mode**: `useTheme().isDark` toggles a `utiligent-map-dark` class that
  applies a CSS filter to `.leaflet-tile` and themes popups/attribution.
- **Responsive**: side panel stacks above the map on small screens; map height
  adapts (`h-[300px] lg:h-[480px]`).

---

## 9. Setup & Deployment

### 9.1 Install dependencies

```bash
npm install
```

New runtime deps: `leaflet`, `react-leaflet`, `@types/leaflet` (already added to
`package.json` / `package-lock.json`).

### 9.2 Apply the database migration

The migration targets the Supabase `app` schema. Apply
`migrations/001_site_billing.sql` via your preferred path — Supabase SQL editor,
`psql`, or the Supabase CLI:

```bash
# psql (service-role / db owner connection)
psql "$SUPABASE_DB_URL" -f migrations/001_site_billing.sql
```

The script is transactional and idempotent, so re-running is safe.

### 9.3 Grant the new permission flags

Platform admins receive the new flags automatically. For everyone else, add the
relevant flags to the appropriate **permission profiles** (Settings → Permission
Profiles), or via per-user overrides:
`site.add`, `site.edit`, `site.delete`, `site.billing.view`,
`site.billing.manage`, `site.member.manage`. `org.reseller.view` is platform-only.

### 9.4 Environment variables

No new variables. Existing ones remain required:

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server/middleware clients (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin operations (user invites) — unchanged |

The map uses public OpenStreetMap tiles and needs no key.

### 9.5 Build

```bash
npm run build   # Next.js 16.2.2 / Turbopack — verified passing
```

---

## 10. Known Limitations & Follow-ups

- **Run the migration before deploying** — the app expects `sites.latitude/longitude`,
  the three new tables, the `audit_logs` columns, and the seeded flags.
- **`middleware` → `proxy`**: the build warns `src/middleware.ts` uses a deprecated
  convention. Left untouched (pre-existing, out of scope); worth migrating separately.
- **Alert→site health**: the active-alert count in `getDashboardMapData()` relies
  on an `alerts → sites` relationship (embedded `alerts(count)` filtered to
  triggered). If alerts link to sites only via meters/gateways in your schema,
  the query falls back to meters-only (alert count 0) — tighten once the linkage
  is confirmed.
- **Invite email template**: the secure invite flow uses
  `inviteUserByEmail`, so the Supabase **"Invite user" email template** and the
  project **Site URL / redirect** must be configured for invitations to arrive.
- **User emails**: assigned-users, audit and org views show truncated user IDs
  (same limitation as the existing Users tab — no client-side `auth.users` join).
  A server action to resolve emails would improve all of them.
- **`app.has_permission(text)` signature**: the tightened billing SELECT policy
  assumes the platform's current-user permission predicate is `app.has_permission(text)`
  (per SECURITY.md). If the deployed helper differs, adjust that one policy line.
- **Reseller-view query scaling**: the organizations pages now scope every query
  with `.in()`/`.eq()` and use count aggregates. For very large tenant counts a
  dedicated SQL view or RPC returning per-org roll-ups in a single round trip
  would scale better still.
- **Lint baseline**: `npm run lint` reports pre-existing `no-explicit-any` errors
  repo-wide (`next build` does not run eslint). New code matches that established
  style.
