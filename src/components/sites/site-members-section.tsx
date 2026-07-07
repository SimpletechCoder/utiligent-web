"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignUserToSite, removeSiteMembership } from "@/app/actions/sites";
import { SITE_MEMBER_ROLES, type SiteMemberRole } from "@/lib/types";

export interface SiteMemberRow {
  id: string;
  user_id: string;
  role: string;
}

interface OrgMemberOption {
  user_id: string;
  role: string;
}

interface SiteMembersSectionProps {
  siteId: string;
  canManage: boolean;
  members: SiteMemberRow[];
  orgMembers: OrgMemberOption[];
}

export function SiteMembersSection({
  siteId,
  canManage,
  members,
  orgMembers,
}: SiteMembersSectionProps) {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<SiteMemberRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedIds = new Set(members.map((m) => m.user_id));
  const assignable = orgMembers.filter((m) => !assignedIds.has(m.user_id));

  async function handleAssign() {
    if (!selectedUser) return;
    setBusy(true);
    setError(null);
    try {
      const result = await assignUserToSite(siteId, selectedUser, selectedRole);
      if (!result.success) {
        setError(result.error ?? "Failed to assign user");
        return;
      }
      setSelectedUser("");
      setSelectedRole("viewer");
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(membershipId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await removeSiteMembership(membershipId);
      if (!result.success) {
        setError(result.error ?? "Failed to remove");
        return;
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border">
      <div className="px-6 py-4 border-b border-border-light">
        <h2 className="text-lg font-semibold text-text">Assigned Users</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          {members.length} user{members.length !== 1 ? "s" : ""} assigned to this site
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="p-6 space-y-4">
        {members.length === 0 ? (
          <p className="text-sm text-text-secondary">No users assigned yet.</p>
        ) : (
          <ul className="divide-y divide-border-light">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-text">
                    {m.user_id.slice(0, 8)}…
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-hover text-text capitalize">
                    {m.role.replace("_", " ")}
                  </span>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={busy}
                    className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-border-light">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Organization member
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">Select a user…</option>
                {assignable.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id.slice(0, 8)}… ({m.role.replace("_", " ")})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Site role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as SiteMemberRole)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand capitalize"
              >
                {SITE_MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAssign}
              disabled={busy || !selectedUser}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              Assign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
