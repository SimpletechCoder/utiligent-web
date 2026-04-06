'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PermissionProfile {
  id: string;
  organization_id: string | null;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface PermissionFlag {
  id: string;
  flag: string;
  category: string;
  display_name: string;
  description: string;
  is_platform_only: boolean;
}

interface ProfileWithFlags extends PermissionProfile {
  flags: PermissionFlag[];
}

interface PermissionProfilesTabProps {
  orgId: string;
  isPlatformAdmin: boolean;
}

export function PermissionProfilesTab({
  orgId,
  isPlatformAdmin,
}: PermissionProfilesTabProps) {
  const [profiles, setProfiles] = useState<ProfileWithFlags[]>([]);
  const [allFlags, setAllFlags] = useState<PermissionFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileWithFlags | null>(null);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    description: '',
    selectedFlags: new Set<string>(),
  });

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      // Fetch all permission flags
      const { data: flagsData, error: flagsError } = await supabase
        .from('permission_flags')
        .select('*');

      if (flagsError) throw flagsError;
      setAllFlags(flagsData || []);

      // Fetch profiles (system + org-specific)
      const { data: profilesData, error: profilesError } = await supabase
        .from('permission_profiles')
        .select('*')
        .or(`is_system.eq.true,organization_id.eq.${orgId}`);

      if (profilesError) throw profilesError;

      // Fetch profile-flag relationships
      const { data: profileFlagsData, error: profileFlagsError } = await supabase
        .from('permission_profile_flags')
        .select('*');

      if (profileFlagsError) throw profileFlagsError;

      // Build a map of profile_id -> flag_ids
      const profileFlagMap = new Map<string, string[]>();
      (profileFlagsData || []).forEach((pf) => {
        if (!profileFlagMap.has(pf.profile_id)) {
          profileFlagMap.set(pf.profile_id, []);
        }
        profileFlagMap.get(pf.profile_id)!.push(pf.flag_id);
      });

      // Merge profiles with their flags
      const profilesWithFlags = (profilesData || []).map((profile) => ({
        ...profile,
        flags: (profileFlagMap.get(profile.id) || [])
          .map((flagId) => flagsData.find((f) => f.id === flagId))
          .filter(Boolean) as PermissionFlag[],
      }));

      // Sort: system profiles first, then by name
      profilesWithFlags.sort((a, b) => {
        if (a.is_system !== b.is_system) {
          return b.is_system ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });

      setProfiles(profilesWithFlags);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    try {
      setError(null);
      const supabase = createClient();

      if (!createFormData.name.trim()) {
        setError('Profile name is required');
        return;
      }

      // Create profile
      const { data: newProfile, error: createError } = await supabase
        .from('permission_profiles')
        .insert({
          organization_id: orgId,
          name: createFormData.name,
          description: createFormData.description,
          is_system: false,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Insert flag associations
      if (createFormData.selectedFlags.size > 0) {
        const flagAssociations = Array.from(createFormData.selectedFlags).map(
          (flagId) => ({
            profile_id: newProfile.id,
            flag_id: flagId,
          })
        );

        const { error: flagError } = await supabase
          .from('permission_profile_flags')
          .insert(flagAssociations);

        if (flagError) throw flagError;
      }

      setSuccess('Profile created successfully');
      setShowCreateModal(false);
      setCreateFormData({ name: '', description: '', selectedFlags: new Set() });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    }
  };

  const handleEditProfile = async () => {
    if (!editingProfile) return;

    try {
      setError(null);
      const supabase = createClient();

      if (!editingProfile.name.trim()) {
        setError('Profile name is required');
        return;
      }

      // Update profile
      const { error: updateError } = await supabase
        .from('permission_profiles')
        .update({
          name: editingProfile.name,
          description: editingProfile.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingProfile.id);

      if (updateError) throw updateError;

      // Get current flag associations
      const currentFlagIds = new Set(editingProfile.flags.map((f) => f.id));
      const newFlagIds = new Set(editingProfile.flags.map((f) => f.id));

      // Delete removed flags
      const flagsToDelete = Array.from(currentFlagIds).filter(
        (f) => !newFlagIds.has(f)
      );
      if (flagsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('permission_profile_flags')
          .delete()
          .eq('profile_id', editingProfile.id)
          .in('flag_id', flagsToDelete);

        if (deleteError) throw deleteError;
      }

      // Add new flags
      const flagsToAdd = Array.from(newFlagIds).filter(
        (f) => !currentFlagIds.has(f)
      );
      if (flagsToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('permission_profile_flags')
          .insert(
            flagsToAdd.map((flagId) => ({
              profile_id: editingProfile.id,
              flag_id: flagId,
            }))
          );

        if (insertError) throw insertError;
      }

      setSuccess('Profile updated successfully');
      setShowEditModal(false);
      setEditingProfile(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const handleDeleteProfile = async (profile: PermissionProfile) => {
    if (!confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      const supabase = createClient();

      // Delete flag associations
      const { error: flagError } = await supabase
        .from('permission_profile_flags')
        .delete()
        .eq('profile_id', profile.id);

      if (flagError) throw flagError;

      // Delete profile
      const { error: deleteError } = await supabase
        .from('permission_profiles')
        .delete()
        .eq('id', profile.id);

      if (deleteError) throw deleteError;

      setSuccess('Profile deleted successfully');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile');
    }
  };

  const getVisibleFlags = (flags: PermissionFlag[]) => {
    if (isPlatformAdmin) return flags;
    return flags.filter((f) => !f.is_platform_only);
  };

  const groupFlagsByCategory = (flags: PermissionFlag[]) => {
    const grouped: { [key: string]: PermissionFlag[] } = {};
    flags.forEach((flag) => {
      if (!grouped[flag.category]) {
        grouped[flag.category] = [];
      }
      grouped[flag.category].push(flag);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading profiles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-red-800 border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-4 text-green-800 border border-green-200">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Permission Profiles
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Manage user roles and permissions
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setCreateFormData({ name: '', description: '', selectedFlags: new Set() });
          }}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
        >
          +
          Create Profile
        </button>
      </div>

      {/* Profiles List */}
      <div className="space-y-3">
        {profiles.length === 0 ? (
          <div className="rounded-md bg-gray-50 p-8 text-center text-gray-500">
            No profiles available
          </div>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors"
            >
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() =>
                  setExpandedProfile(
                    expandedProfile === profile.id ? null : profile.id
                  )
                }
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-medium text-gray-900">
                      {profile.name}
                    </h4>
                    {profile.is_system && (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        System
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {profile.flags.length} permissions
                    </span>
                  </div>
                  {profile.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {profile.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!profile.is_system && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProfile(profile);
                          setShowEditModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                        title="Edit profile"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(profile);
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete profile"
                      >
                        Delete
                      </button>
                    </>
                  )}

                  <span className="text-gray-400">
                    {expandedProfile === profile.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Expanded Flags View */}
              {expandedProfile === profile.id && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  {profile.flags.length === 0 ? (
                    <p className="text-sm text-gray-500">No permissions assigned</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(groupFlagsByCategory(profile.flags)).map(
                        ([category, categoryFlags]) => (
                          <div key={category}>
                            <h5 className="text-xs font-semibold uppercase text-gray-700 mb-2">
                              {category}
                            </h5>
                            <div className="space-y-2">
                              {categoryFlags.map((flag) => (
                                <div key={flag.id} className="text-sm">
                                  <div className="font-medium text-gray-900">
                                    {flag.display_name}
                                    {flag.is_platform_only && (
                                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                        Platform Only
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-600">
                                    {flag.description}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Create Profile</h3>

            <input
              type="text"
              placeholder="Profile name"
              value={createFormData.name}
              onChange={(e) =>
                setCreateFormData({ ...createFormData, name: e.target.value })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <textarea
              placeholder="Description (optional)"
              value={createFormData.description}
              onChange={(e) =>
                setCreateFormData({
                  ...createFormData,
                  description: e.target.value,
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Permissions
              </label>
              <div className="space-y-4 max-h-80 overflow-y-auto border border-gray-200 rounded-md p-4 bg-gray-50">
                {Object.entries(
                  groupFlagsByCategory(
                    getVisibleFlags(allFlags)
                  )
                ).map(([category, categoryFlags]) => (
                  <div key={category}>
                    <h5 className="text-xs font-semibold uppercase text-gray-700 mb-2">
                      {category}
                    </h5>
                    <div className="space-y-2 ml-2">
                      {categoryFlags.map((flag) => (
                        <label
                          key={flag.id}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={createFormData.selectedFlags.has(flag.id)}
                            onChange={(e) => {
                              const newFlags = new Set(
                                createFormData.selectedFlags
                              );
                              if (e.target.checked) {
                                newFlags.add(flag.id);
                              } else {
                                newFlags.delete(flag.id);
                              }
                              setCreateFormData({
                                ...createFormData,
                                selectedFlags: newFlags,
                              });
                            }}
                            className="mt-1 rounded border-gray-300"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {flag.display_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {flag.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProfile && (
        <Modal onClose={() => setShowEditModal(false)}>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Profile: {editingProfile.name}
            </h3>

            <input
              type="text"
              placeholder="Profile name"
              value={editingProfile.name}
              onChange={(e) =>
                setEditingProfile({
                  ...editingProfile,
                  name: e.target.value,
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <textarea
              placeholder="Description (optional)"
              value={editingProfile.description}
              onChange={(e) =>
                setEditingProfile({
                  ...editingProfile,
                  description: e.target.value,
                })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Permissions
              </label>
              <div className="space-y-4 max-h-80 overflow-y-auto border border-gray-200 rounded-md p-4 bg-gray-50">
                {Object.entries(
                  groupFlagsByCategory(
                    getVisibleFlags(allFlags)
                  )
                ).map(([category, categoryFlags]) => (
                  <div key={category}>
                    <h5 className="text-xs font-semibold uppercase text-gray-700 mb-2">
                      {category}
                    </h5>
                    <div className="space-y-2 ml-2">
                      {categoryFlags.map((flag) => {
                        const isAssigned = editingProfile.flags.some(
                          (f) => f.id === flag.id
                        );
                        return (
                          <label
                            key={flag.id}
                            className="flex items-start gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={(e) => {
                                const newFlags = e.target.checked
                                  ? [...editingProfile.flags, flag]
                                  : editingProfile.flags.filter(
                                      (f) => f.id !== flag.id
                                    );
                                setEditingProfile({
                                  ...editingProfile,
                                  flags: newFlags,
                                });
                              }}
                              className="mt-1 rounded border-gray-300"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {flag.display_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {flag.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditProfile}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Simple modal component for dialogs
 */
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Center modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold" />
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
