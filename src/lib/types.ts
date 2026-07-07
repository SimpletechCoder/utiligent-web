/**
 * Shared domain enums. These mirror the CHECK constraints in
 * migrations/001_site_billing.sql so the TypeScript and the database agree on
 * the allowed values.
 */

/** Site lifecycle status. */
export type SiteStatus = "active" | "inactive" | "pending" | "suspended";
export const SITE_STATUSES: SiteStatus[] = ["active", "inactive", "pending", "suspended"];

/** Organization-level membership role. */
export type MembershipRole = "org_admin" | "site_manager" | "viewer" | "tenant";
export const MEMBERSHIP_ROLES: MembershipRole[] = [
  "org_admin",
  "site_manager",
  "viewer",
  "tenant",
];

/** Per-site membership role (a subset of the org roles). */
export type SiteMemberRole = "site_manager" | "viewer" | "tenant";
export const SITE_MEMBER_ROLES: SiteMemberRole[] = ["site_manager", "viewer", "tenant"];
