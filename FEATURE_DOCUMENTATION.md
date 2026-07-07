# Site Management, Mapping & Reseller Billing — Feature Documentation

Branch: `feature/site-management-billing`
Base: `main`
Scope: 25 files changed, ~3,109 insertions.

This document describes the site-management, dashboard-mapping, per-site reseller
billing, permission-inheritance, super-admin reseller view, user-to-site
assignment, and audit-log enhancements added to the Utiligent platform.

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
| `src/app/actions/sites.ts` | `createSite`, `updateSite`, `assignUserToSite`, `removeSiteMembership`. |
| `src/app/actions/billing.ts` | `saveSiteBillingConfig`. |
| `src/app/actions/admin.ts` | `requestEditAccess`. |

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
| `src/components/settings/users-tab.tsx` | Override modal greys out flags outside the org's permission caps. |
| `src/components/settings/permission-profiles-tab.tsx` | Create/edit profile modals grey out capped flags. |
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

Constraint: `unique (site_id, user_id)`. Indexes: `(site_id)`, `(user_id)`, `(organization_id)`.

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
| `site_billing_configs` | `can_access_org` OR `can_manage_org` | `can_manage_org` | `can_manage_org` | `can_manage_org` |
| `site_memberships` | `can_access_org` OR `can_manage_org` OR own row | `can_manage_org` | `can_manage_org` | `can_manage_org` |
| `admin_access_requests` | own request OR `is_platform_admin` OR `can_manage_org(target)` | requester = self | `is_platform_admin` OR `can_manage_org(target)` | `is_platform_admin` |

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

---

## 4. Server Action API Reference

All actions are `"use server"`, return a discriminated `{ success, error? }`
result (never throw across the boundary), and write an audit entry on success.

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
- **Behaviour**: upserts on `(site_id, user_id)`.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.member.assign`.

#### `removeSiteMembership(membershipId)`
- **Permission**: `site.member.manage` on the membership's org.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.member.remove`.

### `billing.ts`

#### `saveSiteBillingConfig(siteId, items, currency = "ZAR", notes = null)`
- **Permission**: `site.billing.manage` + active membership of the site's org.
- **Params**: `items: BillingItem[]` — sanitized server-side (whitelisted
  fields, numeric coercion, string length caps) before persisting.
- **Behaviour**: upserts on `(site_id)`; snapshots the previous config for audit.
- **Returns**: `{ success, error? }`.
- **Audit**: `site.billing.update` (before/after).

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
- Renders the editable billing table (Item, Qty, Base Price, Reseller Adj.,
  Client Price, Margin) with a totals footer. "Reset to defaults" regenerates
  line items from the live meter count; "Save Billing" calls
  `saveSiteBillingConfig`. Read-only when `canManage` is false.

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

---

## 7. Permission Inheritance Model

Chain: **Super Admin → Company (reseller cap) → Employee (profile / overrides)**.

The existing `reseller_permission_caps(organization_id, flag_id)` table defines
the ceiling of flags an organization may grant. The UI now enforces this cap so a
company cannot grant employees permissions beyond its own cap.

**Where enforced (client-side UI):**
- `components/settings/users-tab.tsx` — the per-user override modal.
- `components/settings/permission-profiles-tab.tsx` — the create & edit profile modals.

**Logic (`isFlagCapped`)**: a flag is *capped* (disabled + greyed + "Capped" badge)
when:
```
capsActive (the org has ≥1 cap row) AND (not platform admin) AND (flag not in cap set)
```
Capped checkboxes are `disabled`, forced unchecked, and their toggle handlers
early-return. Platform admins are never capped. When an org has **no** cap rows
configured, nothing is capped (all flags grantable).

> Note: this is UI-level enforcement of the inheritance rule (as specified).
> Server-side effective-permission resolution in `lib/permissions.ts` is
> unchanged; a future hardening step could also intersect overrides with caps at
> write time.

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
- **Health derivation** (`getMapSites` in `dashboard/page.tsx`): per site,
  `critical` if it has a triggered `critical`/`high` alert; else `warning` if it
  has any triggered alert, is `inactive`, or has an offline gateway; else `ok`.
  Alert→site linkage is best-effort (tolerates a missing `alerts.site_id`).
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
- **Alert→site health**: the `critical` pin tier relies on `alerts.site_id`. If
  alerts link to sites only via meters/gateways in your schema, tighten
  `getMapSites` once the linkage is confirmed.
- **User emails**: assigned-users, audit and org views show truncated user IDs
  (same limitation as the existing Users tab — no client-side `auth.users` join).
  A server action to resolve emails would improve all of them.
- **Permission caps are UI-enforced**; consider also intersecting overrides with
  caps server-side in `lib/permissions.ts` for defense-in-depth.
- **Lint baseline**: `npm run lint` reports pre-existing `no-explicit-any` errors
  repo-wide (`next build` does not run eslint). New code matches that established
  style.
