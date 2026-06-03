"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface OrgSettingsTabProps {
  org: any;
  membership: any;
  user: any;
  permissions: string[];
}

export function OrgSettingsTab({ org, membership, user, permissions }: OrgSettingsTabProps) {
  const permSet = new Set(permissions);
  const canEdit = permSet.has("settings.edit");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: org?.name ?? "",
    billing_email: org?.billing_email ?? "",
    support_email: org?.support_email ?? "",
  });

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          billing_email: form.billing_email || null,
          support_email: form.support_email || null,
        })
        .eq("id", org.id);

      if (error) throw error;
      setMessage({ type: "success", text: "Organization updated successfully" });
      setEditing(false);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Failed to update" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      {/* Organization details */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Organization</h2>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-brand hover:text-brand-dark font-medium"
            >
              Edit
            </button>
          )}
        </div>
        <div className="px-6 py-5 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-text mb-1">Organization Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-border-input rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Billing Email</label>
                  <input
                    type="email"
                    value={form.billing_email}
                    onChange={(e) => setForm({ ...form, billing_email: e.target.value })}
                    className="w-full px-3 py-2 border border-border-input rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="billing@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">Support Email</label>
                  <input
                    type="email"
                    value={form.support_email}
                    onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                    className="w-full px-3 py-2 border border-border-input rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    placeholder="support@example.com"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => { setEditing(false); setForm({ name: org?.name ?? "", billing_email: org?.billing_email ?? "", support_email: org?.support_email ?? "" }); }}
                  className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Name</label>
                  <p className="mt-1 text-sm text-text">{org?.name ?? "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Slug</label>
                  <p className="mt-1 text-sm text-text font-mono">{org?.slug ?? "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Status</label>
                  <p className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      org?.status === "active" ? "bg-green-50 text-green-700" : "bg-surface-hover text-text-secondary"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${org?.status === "active" ? "bg-green-500" : "bg-text-muted"}`} />
                      <span className="capitalize">{org?.status ?? "—"}</span>
                    </span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Billing Email</label>
                  <p className="mt-1 text-sm text-text">{org?.billing_email ?? "Not set"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Support Email</label>
                  <p className="mt-1 text-sm text-text">{org?.support_email ?? "Not set"}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Plan</label>
                  <p className="mt-1 text-sm text-text capitalize">{org?.plan ?? "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Type</label>
                  <p className="mt-1 text-sm text-text capitalize">{org?.org_type ?? "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Created</label>
                  <p className="mt-1 text-sm text-text">{org?.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Account info */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-semibold text-text">Your Account</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Email</label>
              <p className="mt-1 text-sm text-text">{user?.email ?? "—"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Role</label>
              <p className="mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-light text-brand-dark capitalize">
                  {membership?.role?.replace("_", " ") ?? "—"}
                </span>
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Permission Profile</label>
              <p className="mt-1 text-sm text-text">{membership?.permission_profiles?.name ?? "—"}</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">User ID</label>
            <p className="mt-1 text-xs text-text-muted font-mono">{user?.id ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Org limits (read-only) */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-semibold text-text">Limits</h2>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Max Users</label>
              <p className="mt-1 text-sm text-text">{org?.max_users ?? "Unlimited"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Max Meters</label>
              <p className="mt-1 text-sm text-text">{org?.max_meters ?? "Unlimited"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Max Child Orgs</label>
              <p className="mt-1 text-sm text-text">{org?.max_child_orgs ?? "Unlimited"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Password reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-800">Password change</p>
            <p className="text-xs text-amber-600 mt-1">
              To change your password, use the Forgot Password flow on the login page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
