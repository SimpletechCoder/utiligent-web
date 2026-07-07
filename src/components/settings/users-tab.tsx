"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { inviteUser } from "@/app/actions/users";
import { saveUserOverrides } from "@/app/actions/permissions";

interface UsersTabProps {
  orgId: string;
  permissions: string[];
  isPlatformAdmin: boolean;
}

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  status: string;
  permission_profile_id: string | null;
  created_at: string;
  permission_profiles: { id: string; name: string } | null;
  user_email?: string;
}

interface ProfileOption {
  id: string;
  name: string;
}

export function UsersTab({ orgId, permissions, isPlatformAdmin }: UsersTabProps) {
  const permSet = new Set(permissions);
  const canInvite = permSet.has("user.invite") || isPlatformAdmin;
  const canEdit = permSet.has("user.edit") || isPlatformAdmin;
  const canRemove = permSet.has("user.remove") || isPlatformAdmin;
  const canOverride = permSet.has("user.permission.override") || isPlatformAdmin;

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteProfile, setInviteProfile] = useState("");
  const [inviting, setInviting] = useState(false);

  // Edit modal state
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [editProfile, setEditProfile] = useState("");
  const [editRole, setEditRole] = useState("");

  // Override modal state
  const [overrideMember, setOverrideMember] = useState<MemberRow | null>(null);
  const [allFlags, setAllFlags] = useState<any[]>([]);
  const [profileFlags, setProfileFlags] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  // Permission inheritance: flags the parent (company/reseller cap) permits.
  // When caps are configured, employees cannot be granted flags outside them.
  const [cappedFlags, setCappedFlags] = useState<Set<string>>(new Set());
  const [capsActive, setCapsActive] = useState(false);

  const fetchMembers = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("memberships")
      .select("id, user_id, role, status, permission_profile_id, created_at, permission_profiles(id, name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("members fetch error:", error);
      return;
    }

    // Fetch emails from auth - we can't join auth.users from client, so we'll display user_id
    // In a real app, you'd have a server action or edge function for this
    setMembers((data ?? []) as any);
    setLoading(false);
  }, [orgId]);

  const fetchProfiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("permission_profiles")
      .select("id, name")
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .order("name");
    setProfiles((data ?? []) as any);
  }, [orgId]);

  useEffect(() => {
    fetchMembers();
    fetchProfiles();
  }, [fetchMembers, fetchProfiles]);

  async function handleInvite() {
    setInviting(true);
    setMessage(null);
    try {
      const result = await inviteUser(
        inviteEmail,
        inviteRole,
        inviteProfile || null,
        orgId
      );

      if (!result.success) {
        setMessage({ type: "error", text: result.error ?? "Failed to invite user" });
      } else {
        setMessage({ type: "success", text: `User ${inviteEmail} invited successfully.` });
        setShowInvite(false);
        setInviteEmail("");
        setInviteRole("viewer");
        setInviteProfile("");
        fetchMembers();
      }
      return;
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setInviting(false);
    }
  }

  async function handleUpdateMember() {
    if (!editingMember) return;
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("memberships")
        .update({
          role: editRole,
          permission_profile_id: editProfile || null,
        })
        .eq("id", editingMember.id);

      if (error) throw error;
      setMessage({ type: "success", text: "Member updated successfully" });
      setEditingMember(null);
      fetchMembers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("memberships")
        .update({ status: "inactive" })
        .eq("id", memberId);

      if (error) throw error;
      setMessage({ type: "success", text: "Member removed" });
      fetchMembers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function openOverrideModal(member: MemberRow) {
    setOverrideMember(member);
    setLoadingOverrides(true);

    const supabase = createClient();

    // Fetch all permission flags
    const { data: flags } = await supabase
      .from("permission_flags")
      .select("id, flag, category, display_name, description, is_platform_only")
      .order("category, flag");

    // Fetch profile flags for this member's profile
    const { data: pFlags } = member.permission_profile_id
      ? await supabase
          .from("permission_profile_flags")
          .select("flag_id")
          .eq("profile_id", member.permission_profile_id)
      : { data: [] };

    // Fetch existing overrides for this member
    const { data: existingOverrides } = await supabase
      .from("user_permission_overrides")
      .select("flag_id, granted")
      .eq("membership_id", member.id);

    // Fetch the org's permission caps (set by the parent reseller / super admin).
    // When any cap rows exist, they define the ceiling for this company's users.
    const { data: caps } = await supabase
      .from("reseller_permission_caps")
      .select("flag_id")
      .eq("organization_id", orgId);

    setCapsActive((caps ?? []).length > 0);
    setCappedFlags(new Set((caps ?? []).map((c: any) => c.flag_id)));

    setAllFlags(flags ?? []);
    setProfileFlags(new Set((pFlags ?? []).map((f: any) => f.flag_id)));

    const overrideMap: Record<string, boolean> = {};
    (existingOverrides ?? []).forEach((o: any) => {
      overrideMap[o.flag_id] = o.granted;
    });
    setOverrides(overrideMap);
    setLoadingOverrides(false);
  }

  async function handleSaveOverrides() {
    if (!overrideMember) return;
    setMessage(null);
    try {
      // Persist through the server action, which enforces the org's permission
      // caps and platform-only rules on the write path (defense-in-depth beyond
      // the greyed-out checkboxes).
      const result = await saveUserOverrides(
        overrideMember.id,
        Object.entries(overrides).map(([flagId, granted]) => ({ flagId, granted }))
      );
      if (!result.success) {
        setMessage({ type: "error", text: result.error ?? "Failed to save overrides" });
        return;
      }
      setMessage({ type: "success", text: "Permission overrides saved" });
      setOverrideMember(null);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  // A flag is "capped" (uneditable) when the org has permission caps configured
  // and this flag falls outside them. Platform admins are never capped.
  function isFlagCapped(flagId: string): boolean {
    return capsActive && !isPlatformAdmin && !cappedFlags.has(flagId);
  }

  function toggleOverride(flagId: string, profileHasFlag: boolean) {
    if (isFlagCapped(flagId)) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (flagId in next) {
        // Remove override (revert to profile default)
        delete next[flagId];
      } else {
        // Add override (opposite of profile default)
        next[flagId] = !profileHasFlag;
      }
      return next;
    });
  }

  const roleStyles: Record<string, string> = {
    org_admin: "bg-purple-50 text-purple-700",
    site_manager: "bg-blue-50 text-blue-700",
    viewer: "bg-surface-hover text-text",
    tenant: "bg-green-50 text-green-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {/* Header with invite button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Team Members</h2>
          <p className="text-sm text-text-secondary mt-0.5">{members.filter(m => m.status === "active").length} active member{members.filter(m => m.status === "active").length !== 1 ? "s" : ""}</p>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite User
          </button>
        )}
      </div>

      {/* Members table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">User</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Role</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Permission Profile</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Status</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Joined</th>
                {(canEdit || canOverride || canRemove) && (
                  <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm text-text font-mono">{member.user_id.slice(0, 8)}...</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleStyles[member.role] ?? "bg-surface-hover text-text"}`}>
                      {member.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text">
                    {member.permission_profiles?.name ?? "None"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      member.status === "active" ? "bg-green-50 text-green-700" : "bg-surface-hover text-text-secondary"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${member.status === "active" ? "bg-green-500" : "bg-text-muted"}`} />
                      <span className="capitalize">{member.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  {(canEdit || canOverride || canRemove) && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {canEdit && (
                          <button
                            onClick={() => { setEditingMember(member); setEditProfile(member.permission_profile_id ?? ""); setEditRole(member.role); }}
                            className="text-xs text-brand hover:text-brand-dark font-medium"
                          >
                            Edit
                          </button>
                        )}
                        {canOverride && (
                          <button
                            onClick={() => openOverrideModal(member)}
                            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                          >
                            Flags
                          </button>
                        )}
                        {canRemove && member.status === "active" && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-text mb-4">Invite User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">Email Address</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand">
                  <option value="org_admin">Organization Admin</option>
                  <option value="site_manager">Site Manager</option>
                  <option value="viewer">Viewer</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Permission Profile</label>
                <select value={inviteProfile} onChange={(e) => setInviteProfile(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand">
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleInvite} disabled={inviting || !inviteEmail}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors">
                {inviting ? "Inviting..." : "Send Invite"}
              </button>
              <button onClick={() => setShowInvite(false)}
                className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-text mb-4">Edit Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand">
                  <option value="org_admin">Organization Admin</option>
                  <option value="site_manager">Site Manager</option>
                  <option value="viewer">Viewer</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Permission Profile</label>
                <select value={editProfile} onChange={(e) => setEditProfile(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand">
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleUpdateMember}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors">
                Save
              </button>
              <button onClick={() => setEditingMember(null)}
                className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Override Modal */}
      {overrideMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-text mb-1">Permission Overrides</h3>
            <p className="text-sm text-text-secondary mb-4">
              Profile: <strong>{overrideMember.permission_profiles?.name ?? "None"}</strong> —
              Toggle flags to grant or revoke individually. Overridden flags show in purple.
            </p>

            {loadingOverrides ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  allFlags.reduce((acc: Record<string, any[]>, flag: any) => {
                    if (!isPlatformAdmin && flag.is_platform_only) return acc;
                    const cat = flag.category;
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(flag);
                    return acc;
                  }, {})
                ).map(([category, flags]) => (
                  <div key={category}>
                    <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 capitalize">{category}</h4>
                    <div className="space-y-1">
                      {flags.map((flag: any) => {
                        const fromProfile = profileFlags.has(flag.id);
                        const hasOverride = flag.id in overrides;
                        const capped = isFlagCapped(flag.id);
                        const effectiveGrant = capped
                          ? false
                          : hasOverride
                          ? overrides[flag.id]
                          : fromProfile;

                        return (
                          <label
                            key={flag.id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                              capped
                                ? "opacity-50 cursor-not-allowed"
                                : hasOverride
                                ? "bg-purple-50 cursor-pointer"
                                : "hover:bg-surface-hover cursor-pointer"
                            }`}
                            title={
                              capped
                                ? "This permission exceeds the organization's cap and cannot be granted"
                                : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              checked={effectiveGrant}
                              disabled={capped}
                              onChange={() => toggleOverride(flag.id, fromProfile)}
                              className="w-4 h-4 text-brand border-border rounded focus:ring-brand disabled:cursor-not-allowed"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-text">{flag.display_name}</span>
                              {flag.description && (
                                <span className="text-xs text-text-muted ml-2">{flag.description}</span>
                              )}
                            </div>
                            {capped && (
                              <span className="text-xs font-medium text-amber-600 px-2 py-0.5 bg-amber-100 rounded-full">Capped</span>
                            )}
                            {!capped && hasOverride && (
                              <span className="text-xs font-medium text-purple-600 px-2 py-0.5 bg-purple-100 rounded-full">Override</span>
                            )}
                            {!capped && fromProfile && !hasOverride && (
                              <span className="text-xs text-text-muted">From profile</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={handleSaveOverrides}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors">
                Save Overrides
              </button>
              <button onClick={() => setOverrideMember(null)}
                className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
