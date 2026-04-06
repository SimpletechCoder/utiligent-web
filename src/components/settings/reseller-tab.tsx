'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  org_type: 'platform' | 'reseller' | 'customer';
  parent_organization_id: string | null;
  billing_email: string;
  support_email: string;
  branding: Record<string, unknown> | null;
  max_child_orgs: number;
  max_users: number;
  max_meters: number;
  created_at: string;
  updated_at: string;
}

interface PermissionFlag {
  id: string;
  category: string;
  display_name: string;
  description: string;
  is_platform_only: boolean;
}

interface ResellerPermissionCap {
  organization_id: string;
  flag_id: string;
}

type FormMode = 'create-reseller' | 'create-customer' | 'edit' | null;

export function ResellerTab() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [permissionFlags, setPermissionFlags] = useState<PermissionFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    billing_email: '',
    support_email: '',
    max_child_orgs: 0,
    max_users: 10,
    max_meters: 100,
    branding: '{}',
    parent_organization_id: '',
  });

  const [resellerPermissionCaps, setResellerPermissionCaps] = useState<ResellerPermissionCap[]>([]);
  const [selectedCapFlags, setSelectedCapFlags] = useState<string[]>([]);
  const [savingCaps, setSavingCaps] = useState(false);

  // Fetch organizations and permission flags
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      // Fetch organizations
      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('org_type', { ascending: true })
        .order('name', { ascending: true });

      if (orgsError) throw orgsError;
      setOrganizations(orgsData || []);

      // Fetch non-platform-only permission flags
      const { data: flagsData, error: flagsError } = await supabase
        .from('permission_flags')
        .select('*')
        .eq('is_platform_only', false)
        .order('category', { ascending: true })
        .order('display_name', { ascending: true });

      if (flagsError) throw flagsError;
      setPermissionFlags(flagsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      billing_email: '',
      support_email: '',
      max_child_orgs: 0,
      max_users: 10,
      max_meters: 100,
      branding: '{}',
      parent_organization_id: '',
    });
    setFormMode(null);
    setEditingOrgId(null);
  };

  const handleCreateReseller = () => {
    resetForm();
    setFormMode('create-reseller');
  };

  const handleCreateCustomer = () => {
    resetForm();
    setFormMode('create-customer');
  };

  const handleEditOrg = (org: Organization) => {
    setFormData({
      name: org.name,
      slug: org.slug,
      billing_email: org.billing_email,
      support_email: org.support_email,
      max_child_orgs: org.max_child_orgs,
      max_users: org.max_users,
      max_meters: org.max_meters,
      branding: JSON.stringify(org.branding || {}),
      parent_organization_id: org.parent_organization_id || '',
    });
    setEditingOrgId(org.id);
    setFormMode('edit');
  };

  const handleSaveOrg = async () => {
    try {
      setError(null);
      const supabase = createClient();

      // Parse branding
      let branding = null;
      try {
        branding = formData.branding ? JSON.parse(formData.branding) : {};
      } catch {
        throw new Error('Invalid JSON in branding field');
      }

      if (formMode === 'create-reseller') {
        const { error: insertError } = await supabase.from('organizations').insert([
          {
            name: formData.name,
            slug: formData.slug,
            plan: 'reseller',
            status: 'active',
            org_type: 'reseller',
            parent_organization_id: null,
            billing_email: formData.billing_email,
            support_email: formData.support_email,
            branding,
            max_child_orgs: formData.max_child_orgs,
            max_users: formData.max_users,
            max_meters: formData.max_meters,
          },
        ]);

        if (insertError) throw insertError;
        setSuccess('Reseller organization created successfully');
      } else if (formMode === 'create-customer') {
        const { error: insertError } = await supabase.from('organizations').insert([
          {
            name: formData.name,
            slug: formData.slug,
            plan: 'customer',
            status: 'active',
            org_type: 'customer',
            parent_organization_id: formData.parent_organization_id || null,
            billing_email: formData.billing_email,
            support_email: formData.support_email,
            branding,
            max_child_orgs: formData.max_child_orgs,
            max_users: formData.max_users,
            max_meters: formData.max_meters,
          },
        ]);

        if (insertError) throw insertError;
        setSuccess('Customer organization created successfully');
      } else if (formMode === 'edit' && editingOrgId) {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            name: formData.name,
            slug: formData.slug,
            billing_email: formData.billing_email,
            support_email: formData.support_email,
            branding,
            max_child_orgs: formData.max_child_orgs,
            max_users: formData.max_users,
            max_meters: formData.max_meters,
          })
          .eq('id', editingOrgId);

        if (updateError) throw updateError;
        setSuccess('Organization updated successfully');
      }

      await fetchData();
      resetForm();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization');
    }
  };

  const handleExpandOrg = (orgId: string) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null);
    } else {
      setExpandedOrgId(orgId);
      if (organizations.find((o) => o.id === orgId)?.org_type === 'reseller') {
        loadResellerPermissionCaps(orgId);
      }
    }
  };

  const loadResellerPermissionCaps = async (orgId: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('reseller_permission_caps')
        .select('*')
        .eq('organization_id', orgId);

      if (error) throw error;
      setResellerPermissionCaps(data || []);
      setSelectedCapFlags((data || []).map((cap) => cap.flag_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission caps');
    }
  };

  const handleSavePermissionCaps = async () => {
    if (!expandedOrgId) return;

    try {
      setSavingCaps(true);
      setError(null);
      const supabase = createClient();

      // Delete all existing caps for this org
      const { error: deleteError } = await supabase
        .from('reseller_permission_caps')
        .delete()
        .eq('organization_id', expandedOrgId);

      if (deleteError) throw deleteError;

      // Insert new caps
      if (selectedCapFlags.length > 0) {
        const capsToInsert = selectedCapFlags.map((flagId) => ({
          organization_id: expandedOrgId,
          flag_id: flagId,
        }));

        const { error: insertError } = await supabase
          .from('reseller_permission_caps')
          .insert(capsToInsert);

        if (insertError) throw insertError;
      }

      setSuccess('Permission caps updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permission caps');
    } finally {
      setSavingCaps(false);
    }
  };

  const toggleCapFlag = (flagId: string) => {
    setSelectedCapFlags((prev) =>
      prev.includes(flagId) ? prev.filter((id) => id !== flagId) : [...prev, flagId]
    );
  };

  const getOrgTypeBadgeColor = (orgType: string) => {
    switch (orgType) {
      case 'platform':
        return 'bg-blue-100 text-blue-800';
      case 'reseller':
        return 'bg-purple-100 text-purple-800';
      case 'customer':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getParentOrgName = (parentId: string | null) => {
    if (!parentId) return 'Platform';
    return organizations.find((o) => o.id === parentId)?.name || 'Unknown';
  };

  const resellerOrgs = organizations.filter((o) => o.org_type === 'reseller');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading organizations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reseller & White-Label Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage reseller organizations and their permission capabilities
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCreateReseller}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            +
            Create Reseller
          </button>
          <button
            onClick={handleCreateCustomer}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            +
            Create Customer Org
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-green-600">✓</span>
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-600">⚠</span>
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Organizations Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Parent</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Users / Meters</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {organizations.map((org) => (
              <React.Fragment key={org.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => handleExpandOrg(org.id)}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{org.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{org.slug}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getOrgTypeBadgeColor(org.org_type)}`}>
                      {org.org_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{getParentOrgName(org.parent_organization_id)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {org.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {org.max_users} / {org.max_meters}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditOrg(org);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>

                {/* Expanded Row */}
                {expandedOrgId === org.id && (
                  <tr className="bg-gray-50 border-t-2 border-gray-100">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="space-y-4">
                        {/* Organization Details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-gray-700 uppercase">Billing Email</p>
                            <p className="text-sm text-gray-900">{org.billing_email}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-700 uppercase">Support Email</p>
                            <p className="text-sm text-gray-900">{org.support_email}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-700 uppercase">Max Child Orgs</p>
                            <p className="text-sm text-gray-900">{org.max_child_orgs}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-700 uppercase">Created</p>
                            <p className="text-sm text-gray-900">{new Date(org.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>

                        {/* Permission Caps (Reseller Only) */}
                        {org.org_type === 'reseller' && (
                          <div className="border-t pt-4">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Permission Caps</h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {permissionFlags.length === 0 ? (
                                <p className="text-sm text-gray-600">No permission flags available</p>
                              ) : (
                                permissionFlags.map((flag) => (
                                  <label key={flag.id} className="flex items-start gap-3 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedCapFlags.includes(flag.id)}
                                      onChange={() => toggleCapFlag(flag.id)}
                                      className="mt-1 rounded border-gray-300"
                                    />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{flag.display_name}</p>
                                      <p className="text-xs text-gray-600">{flag.description}</p>
                                      <p className="text-xs text-gray-500 mt-1">Category: {flag.category}</p>
                                    </div>
                                  </label>
                                ))
                              )}
                            </div>
                            <button
                              onClick={() => handleSavePermissionCaps()}
                              disabled={savingCaps}
                              className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingCaps ? 'Saving...' : 'Save Permission Caps'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {organizations.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">No organizations found. Create one to get started.</div>
          </div>
        )}
      </div>

      {/* Create/Edit Organization Modal */}
      {formMode !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {formMode === 'create-reseller' && 'Create Reseller Organization'}
            {formMode === 'create-customer' && 'Create Customer Organization'}
            {formMode === 'edit' && 'Edit Organization'}
          </h3>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., Acme Water Solutions"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., acme-water"
              />
            </div>

            {/* Parent Organization (Customer Only) */}
            {formMode === 'create-customer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Reseller</label>
                <select
                  value={formData.parent_organization_id}
                  onChange={(e) => setFormData({ ...formData, parent_organization_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Select a reseller...</option>
                  {resellerOrgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Billing Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email</label>
              <input
                type="email"
                value={formData.billing_email}
                onChange={(e) => setFormData({ ...formData, billing_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="billing@example.com"
              />
            </div>

            {/* Support Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
              <input
                type="email"
                value={formData.support_email}
                onChange={(e) => setFormData({ ...formData, support_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="support@example.com"
              />
            </div>

            {/* Limits */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Child Orgs</label>
                <input
                  type="number"
                  value={formData.max_child_orgs}
                  onChange={(e) => setFormData({ ...formData, max_child_orgs: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={formData.max_users}
                  onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Meters</label>
                <input
                  type="number"
                  value={formData.max_meters}
                  onChange={(e) => setFormData({ ...formData, max_meters: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="0"
                />
              </div>
            </div>

            {/* Branding JSON */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branding (JSON)</label>
              <textarea
                value={formData.branding}
                onChange={(e) => setFormData({ ...formData, branding: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                rows={4}
                placeholder='{"logo_url": "https://...", "primary_color": "#000000"}'
              />
              <p className="text-xs text-gray-500 mt-1">Optional: Include logo_url, primary_color, etc.</p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveOrg}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Save Organization
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
