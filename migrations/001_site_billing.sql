-- ============================================================================
-- 001_site_billing.sql
-- Site management, per-site reseller billing, site memberships, cross-org admin
-- access requests, and ISO/POPIA audit-log enhancements.
--
-- Conventions (see SECURITY.md):
--   * All application data lives in the `app` schema.
--   * RLS is ENABLED on every table; policies follow the one-policy-per-action
--     shape: <table>_sel / _ins / _upd / _del.
--   * Access is scoped through the existing SECURITY DEFINER helper predicates
--     app.can_access_org / app.can_manage_org / app.is_platform_admin.
--   * auth.uid() is wrapped as (select auth.uid()) so it evaluates once (InitPlan).
--
-- This migration is idempotent where practical (IF NOT EXISTS / ON CONFLICT).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. sites: add GPS coordinates for the dashboard map.
--    (name/code/timezone/status/address already exist.)
-- ----------------------------------------------------------------------------
alter table app.sites
  add column if not exists latitude  numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

comment on column app.sites.latitude  is 'WGS84 latitude for the dashboard map pin.';
comment on column app.sites.longitude is 'WGS84 longitude for the dashboard map pin.';

-- ----------------------------------------------------------------------------
-- 2. audit_logs: ISO/POPIA fields. The existing table already carries
--    action / actor_user_id / entity_type / entity_id / created_at; we add the
--    request IP and structured before/after snapshots.
-- ----------------------------------------------------------------------------
alter table app.audit_logs
  add column if not exists ip_address inet,
  add column if not exists old_value  jsonb,
  add column if not exists new_value  jsonb;

comment on column app.audit_logs.ip_address is 'Source IP of the actor request (POPIA processing record).';
comment on column app.audit_logs.old_value  is 'Entity state before the change.';
comment on column app.audit_logs.new_value  is 'Entity state after the change.';

-- ----------------------------------------------------------------------------
-- 3. site_billing_configs: per-site reseller billing configuration.
--    `items` is a JSONB array of monitored line items:
--      [{ "key": "meter", "label": "Metering", "basePrice": 65,
--         "resellerAdjustment": 20, "quantity": 12 }, ...]
--    Base price is derived from the site's meter count tier at edit time;
--    the reseller margin is `resellerAdjustment` per unit.
-- ----------------------------------------------------------------------------
create table if not exists app.site_billing_configs (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references app.sites(id) on delete cascade,
  organization_id uuid not null references app.organizations(id) on delete cascade,
  currency        text not null default 'ZAR',
  items           jsonb not null default '[]'::jsonb,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (site_id)
);

comment on table app.site_billing_configs is 'Per-site billing configuration with reseller margin adjustments.';

create index if not exists site_billing_configs_site_idx
  on app.site_billing_configs (site_id);
create index if not exists site_billing_configs_org_idx
  on app.site_billing_configs (organization_id);

alter table app.site_billing_configs enable row level security;

-- Billing is commercially sensitive: plain org access is NOT enough to read it.
-- A reader must additionally hold the `site.billing.view` flag; org managers
-- (which includes platform admins via can_manage_org) always retain access.
-- NOTE: app.has_permission(text) is the platform's current-user flag predicate
-- documented in SECURITY.md.
drop policy if exists site_billing_configs_sel on app.site_billing_configs;
create policy site_billing_configs_sel on app.site_billing_configs
  for select using (
    (app.can_access_org(organization_id) and app.has_permission('site.billing.view'))
    or app.can_manage_org(organization_id)
  );

drop policy if exists site_billing_configs_ins on app.site_billing_configs;
create policy site_billing_configs_ins on app.site_billing_configs
  for insert with check (app.can_manage_org(organization_id));

drop policy if exists site_billing_configs_upd on app.site_billing_configs;
create policy site_billing_configs_upd on app.site_billing_configs
  for update using (app.can_manage_org(organization_id))
  with check (app.can_manage_org(organization_id));

drop policy if exists site_billing_configs_del on app.site_billing_configs;
create policy site_billing_configs_del on app.site_billing_configs
  for delete using (app.can_manage_org(organization_id));

-- ----------------------------------------------------------------------------
-- 4. site_memberships: assign specific users to specific sites.
-- ----------------------------------------------------------------------------
create table if not exists app.site_memberships (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references app.sites(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references app.organizations(id) on delete cascade,
  role            text not null default 'viewer',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (site_id, user_id)
);

comment on table app.site_memberships is 'Explicit user-to-site assignments within an organization.';

create index if not exists site_memberships_site_idx on app.site_memberships (site_id);
create index if not exists site_memberships_user_idx on app.site_memberships (user_id);
create index if not exists site_memberships_org_idx  on app.site_memberships (organization_id);

alter table app.site_memberships enable row level security;

drop policy if exists site_memberships_sel on app.site_memberships;
create policy site_memberships_sel on app.site_memberships
  for select using (
    app.can_access_org(organization_id)
    or app.can_manage_org(organization_id)
    or user_id = (select auth.uid())
  );

drop policy if exists site_memberships_ins on app.site_memberships;
create policy site_memberships_ins on app.site_memberships
  for insert with check (app.can_manage_org(organization_id));

drop policy if exists site_memberships_upd on app.site_memberships;
create policy site_memberships_upd on app.site_memberships
  for update using (app.can_manage_org(organization_id))
  with check (app.can_manage_org(organization_id));

drop policy if exists site_memberships_del on app.site_memberships;
create policy site_memberships_del on app.site_memberships
  for delete using (app.can_manage_org(organization_id));

-- Integrity trigger: a CHECK constraint cannot cross tables, so we enforce with
-- a BEFORE INSERT/UPDATE trigger that the assignment is internally consistent —
--   (a) the site belongs to the stated organization, and
--   (b) the user is an ACTIVE member of that same organization.
-- SECURITY DEFINER so it can read sites/memberships regardless of the caller's
-- RLS view; EXECUTE is revoked from PUBLIC per SECURITY.md (fires by mechanism).
create or replace function app.validate_site_membership()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_site_org uuid;
  v_is_member boolean;
begin
  select organization_id into v_site_org from app.sites where id = new.site_id;

  if v_site_org is null then
    raise exception 'Site % does not exist', new.site_id;
  end if;

  if v_site_org <> new.organization_id then
    raise exception 'Site % does not belong to organization %', new.site_id, new.organization_id
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1
    from app.memberships m
    where m.user_id = new.user_id
      and m.organization_id = new.organization_id
      and m.status = 'active'
  ) into v_is_member;

  if not v_is_member then
    raise exception 'User % is not an active member of organization %', new.user_id, new.organization_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function app.validate_site_membership() from public;

drop trigger if exists site_memberships_validate on app.site_memberships;
create trigger site_memberships_validate
  before insert or update on app.site_memberships
  for each row execute function app.validate_site_membership();

-- ----------------------------------------------------------------------------
-- 5. admin_access_requests: a platform/reseller admin requests edit access to
--    another organization's data (read-only drill-down otherwise).
-- ----------------------------------------------------------------------------
create table if not exists app.admin_access_requests (
  id                   uuid primary key default gen_random_uuid(),
  requester_user_id    uuid not null default auth.uid(),
  requester_org_id     uuid references app.organizations(id) on delete set null,
  target_organization_id uuid not null references app.organizations(id) on delete cascade,
  reason               text,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'denied', 'revoked')),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  resolved_by          uuid
);

comment on table app.admin_access_requests is 'Requests by admins to gain edit access to another org (audit-tracked).';

create index if not exists admin_access_requests_target_idx
  on app.admin_access_requests (target_organization_id);
create index if not exists admin_access_requests_requester_idx
  on app.admin_access_requests (requester_user_id);
create index if not exists admin_access_requests_status_idx
  on app.admin_access_requests (status);

alter table app.admin_access_requests enable row level security;

-- A requester can see their own requests; platform admins and managers of the
-- target org can see requests against them.
drop policy if exists admin_access_requests_sel on app.admin_access_requests;
create policy admin_access_requests_sel on app.admin_access_requests
  for select using (
    requester_user_id = (select auth.uid())
    or app.is_platform_admin()
    or app.can_manage_org(target_organization_id)
  );

-- Only platform admins may file an access request, and only as themselves.
-- (Edit-access to another org is a platform-admin capability, not something a
-- regular authenticated user may initiate.)
drop policy if exists admin_access_requests_ins on app.admin_access_requests;
create policy admin_access_requests_ins on app.admin_access_requests
  for insert with check (
    app.is_platform_admin() and requester_user_id = (select auth.uid())
  );

-- Only platform admins or a manager of the target org may resolve a request.
drop policy if exists admin_access_requests_upd on app.admin_access_requests;
create policy admin_access_requests_upd on app.admin_access_requests
  for update using (
    app.is_platform_admin() or app.can_manage_org(target_organization_id)
  )
  with check (
    app.is_platform_admin() or app.can_manage_org(target_organization_id)
  );

drop policy if exists admin_access_requests_del on app.admin_access_requests;
create policy admin_access_requests_del on app.admin_access_requests
  for delete using (app.is_platform_admin());

-- ----------------------------------------------------------------------------
-- 6. permission_flags: seed the flags used by the new features.
--    permission_flags.id is the string flag itself (e.g. 'site.edit'), matching
--    how userHasPermission() checks membership of the effective-flag set.
-- ----------------------------------------------------------------------------
insert into app.permission_flags (id, flag, category, display_name, description, is_platform_only)
values
  ('site.add',            'site.add',            'sites',         'Add Sites',              'Create new sites',                              false),
  ('site.edit',           'site.edit',           'sites',         'Edit Sites',             'Edit site details and configuration',           false),
  ('site.delete',         'site.delete',         'sites',         'Delete Sites',           'Delete sites',                                  false),
  ('site.billing.view',   'site.billing.view',   'billing',       'View Site Billing',      'View per-site billing configuration',           false),
  ('site.billing.manage', 'site.billing.manage', 'billing',       'Manage Site Billing',    'Edit reseller billing margins per site',        false),
  ('site.member.manage',  'site.member.manage',  'sites',         'Manage Site Members',    'Assign and remove users from sites',            false),
  ('org.reseller.view',   'org.reseller.view',   'organizations', 'View Reseller Accounts', 'View all reseller organizations (platform)',    true)
on conflict (id) do nothing;

commit;
