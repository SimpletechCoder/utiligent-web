'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Protocol = 'lorawan_http' | 'lorawan_mqtt' | 'nb_iot' | 'sigfox' | 'wifi' | 'cellular' | 'other';
type DecoderType = 'javascript' | 'json_path' | 'binary_template';

interface GatewayProfile {
  id: string;
  manufacturer: string;
  model: string;
  protocol: Protocol;
  display_name: string;
  description: string | null;
  image_url: string | null;
  default_config: Record<string, unknown> | null;
  payload_decoder_id: string | null;
  supported_frequency_bands: string[];
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IntegrationDriver {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  protocol: Protocol;
  decoder_type: DecoderType;
  decoder_config: Record<string, unknown> | null;
  decoder_script: string | null;
  http_path_pattern: string | null;
  http_auth_type: string | null;
  http_payload_format: string | null;
  field_mapping: Record<string, unknown> | null;
  supported_meter_types: string[];
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GatewaySetupInstruction {
  id: string;
  gateway_profile_id: string;
  step_number: number;
  title: string;
  content: string;
  image_url: string | null;
  is_advanced: boolean;
  created_at: string;
  updated_at: string;
}

interface GatewayProfilesTabProps {
  isPlatformAdmin: boolean;
}

type TabType = 'profiles' | 'drivers' | 'instructions';

export function GatewayProfilesTab({ isPlatformAdmin }: GatewayProfilesTabProps) {
  const [activeTab, setActiveTab] = useState<TabType>('profiles');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Gateway Profiles state
  const [profiles, setProfiles] = useState<GatewayProfile[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<GatewayProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    manufacturer: '',
    model: '',
    display_name: '',
    description: '',
    protocol: 'lorawan_http' as Protocol,
    frequency_bands: '',
    payload_decoder_id: '',
  });

  // Integration Drivers state
  const [drivers, setDrivers] = useState<IntegrationDriver[]>([]);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<IntegrationDriver | null>(null);
  const [driverForm, setDriverForm] = useState({
    name: '',
    display_name: '',
    description: '',
    protocol: 'lorawan_http' as Protocol,
    decoder_type: 'javascript' as DecoderType,
    decoder_script: '',
    field_mapping: '{}',
    version: '1.0.0',
  });

  // Setup Instructions state
  const [instructions, setInstructions] = useState<GatewaySetupInstruction[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<GatewaySetupInstruction | null>(null);
  const [instructionForm, setInstructionForm] = useState({
    title: '',
    content: '',
    step_number: 1,
    is_advanced: false,
  });

  // Load data on mount
  useEffect(() => {
    if (isPlatformAdmin) {
      loadProfiles();
      loadDrivers();
    }
  }, [isPlatformAdmin]);

  // Load instructions when profile is selected
  useEffect(() => {
    if (selectedProfileId && isPlatformAdmin) {
      loadInstructions(selectedProfileId);
    }
  }, [selectedProfileId, isPlatformAdmin]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('gateway_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      showMessage('error', `Failed to load gateway profiles: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadDrivers = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('integration_drivers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      showMessage('error', `Failed to load integration drivers: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadInstructions = async (profileId: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('gateway_setup_instructions')
        .select('*')
        .eq('gateway_profile_id', profileId)
        .order('step_number', { ascending: true });

      if (error) throw error;
      setInstructions(data || []);
    } catch (err) {
      showMessage('error', `Failed to load setup instructions: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Gateway Profiles handlers
  const handleSaveProfile = async () => {
    try {
      if (!profileForm.manufacturer || !profileForm.model || !profileForm.display_name) {
        showMessage('error', 'Please fill in required fields');
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const frequencyBands = profileForm.frequency_bands
        .split(',')
        .map((b) => b.trim())
        .filter((b) => b);

      const payload = {
        manufacturer: profileForm.manufacturer,
        model: profileForm.model,
        display_name: profileForm.display_name,
        description: profileForm.description || null,
        protocol: profileForm.protocol,
        supported_frequency_bands: frequencyBands,
        payload_decoder_id: profileForm.payload_decoder_id || null,
      };

      if (editingProfile) {
        const { error } = await supabase
          .from('gateway_profiles')
          .update(payload)
          .eq('id', editingProfile.id);

        if (error) throw error;
        showMessage('success', 'Profile updated successfully');
      } else {
        const { error } = await supabase.from('gateway_profiles').insert([payload]);

        if (error) throw error;
        showMessage('success', 'Profile created successfully');
      }

      setShowProfileModal(false);
      setEditingProfile(null);
      resetProfileForm();
      loadProfiles();
    } catch (err) {
      showMessage('error', `Failed to save profile: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this gateway profile?')) return;

    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.from('gateway_profiles').delete().eq('id', id);

      if (error) throw error;
      showMessage('success', 'Profile deleted successfully');
      loadProfiles();
    } catch (err) {
      showMessage('error', `Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApprove = async (profile: GatewayProfile) => {
    try {
      setLoading(true);
      const supabase = createClient();
      const newApprovedStatus = !profile.is_approved;
      const payload = newApprovedStatus
        ? {
            is_approved: true,
            approved_by: 'current-user-id', // In real app, get from auth context
            approved_at: new Date().toISOString(),
          }
        : {
            is_approved: false,
            approved_by: null,
            approved_at: null,
          };

      const { error } = await supabase
        .from('gateway_profiles')
        .update(payload)
        .eq('id', profile.id);

      if (error) throw error;
      showMessage('success', `Profile ${newApprovedStatus ? 'approved' : 'unapproved'} successfully`);
      loadProfiles();
    } catch (err) {
      showMessage('error', `Failed to update approval status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const resetProfileForm = () => {
    setProfileForm({
      manufacturer: '',
      model: '',
      display_name: '',
      description: '',
      protocol: 'lorawan_http',
      frequency_bands: '',
      payload_decoder_id: '',
    });
  };

  const openEditProfile = (profile: GatewayProfile) => {
    setEditingProfile(profile);
    setProfileForm({
      manufacturer: profile.manufacturer,
      model: profile.model,
      display_name: profile.display_name,
      description: profile.description || '',
      protocol: profile.protocol,
      frequency_bands: profile.supported_frequency_bands.join(', '),
      payload_decoder_id: profile.payload_decoder_id || '',
    });
    setShowProfileModal(true);
  };

  // Integration Drivers handlers
  const handleSaveDriver = async () => {
    try {
      if (!driverForm.name || !driverForm.display_name) {
        showMessage('error', 'Please fill in required fields');
        return;
      }

      setLoading(true);
      const supabase = createClient();
      let fieldMapping = {};
      try {
        fieldMapping = JSON.parse(driverForm.field_mapping);
      } catch {
        showMessage('error', 'Invalid JSON in field mapping');
        setLoading(false);
        return;
      }

      const payload = {
        name: driverForm.name,
        display_name: driverForm.display_name,
        description: driverForm.description || null,
        protocol: driverForm.protocol,
        decoder_type: driverForm.decoder_type,
        decoder_script: driverForm.decoder_script || null,
        field_mapping: fieldMapping,
        version: driverForm.version,
      };

      if (editingDriver) {
        const { error } = await supabase
          .from('integration_drivers')
          .update(payload)
          .eq('id', editingDriver.id);

        if (error) throw error;
        showMessage('success', 'Driver updated successfully');
      } else {
        const { error } = await supabase.from('integration_drivers').insert([payload]);

        if (error) throw error;
        showMessage('success', 'Driver created successfully');
      }

      setShowDriverModal(false);
      setEditingDriver(null);
      resetDriverForm();
      loadDrivers();
    } catch (err) {
      showMessage('error', `Failed to save driver: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDriver = async (driver: IntegrationDriver) => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase
        .from('integration_drivers')
        .update({ is_active: !driver.is_active })
        .eq('id', driver.id);

      if (error) throw error;
      showMessage('success', `Driver ${!driver.is_active ? 'activated' : 'deactivated'} successfully`);
      loadDrivers();
    } catch (err) {
      showMessage('error', `Failed to toggle driver: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const resetDriverForm = () => {
    setDriverForm({
      name: '',
      display_name: '',
      description: '',
      protocol: 'lorawan_http',
      decoder_type: 'javascript',
      decoder_script: '',
      field_mapping: '{}',
      version: '1.0.0',
    });
  };

  const openEditDriver = (driver: IntegrationDriver) => {
    setEditingDriver(driver);
    setDriverForm({
      name: driver.name,
      display_name: driver.display_name,
      description: driver.description || '',
      protocol: driver.protocol,
      decoder_type: driver.decoder_type,
      decoder_script: driver.decoder_script || '',
      field_mapping: JSON.stringify(driver.field_mapping || {}, null, 2),
      version: driver.version,
    });
    setShowDriverModal(true);
  };

  // Setup Instructions handlers
  const handleSaveInstruction = async () => {
    try {
      if (!selectedProfileId || !instructionForm.title || !instructionForm.content) {
        showMessage('error', 'Please fill in required fields');
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const payload = {
        gateway_profile_id: selectedProfileId,
        title: instructionForm.title,
        content: instructionForm.content,
        step_number: instructionForm.step_number,
        is_advanced: instructionForm.is_advanced,
      };

      if (editingInstruction) {
        const { error } = await supabase
          .from('gateway_setup_instructions')
          .update(payload)
          .eq('id', editingInstruction.id);

        if (error) throw error;
        showMessage('success', 'Instruction updated successfully');
      } else {
        const { error } = await supabase.from('gateway_setup_instructions').insert([payload]);

        if (error) throw error;
        showMessage('success', 'Instruction created successfully');
      }

      setShowInstructionModal(false);
      setEditingInstruction(null);
      resetInstructionForm();
      loadInstructions(selectedProfileId);
    } catch (err) {
      showMessage('error', `Failed to save instruction: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInstruction = async (id: string) => {
    if (!confirm('Are you sure you want to delete this instruction?')) return;

    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.from('gateway_setup_instructions').delete().eq('id', id);

      if (error) throw error;
      showMessage('success', 'Instruction deleted successfully');
      if (selectedProfileId) loadInstructions(selectedProfileId);
    } catch (err) {
      showMessage('error', `Failed to delete instruction: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const resetInstructionForm = () => {
    setInstructionForm({
      title: '',
      content: '',
      step_number: Math.max(0, ...instructions.map((i) => i.step_number), 0) + 1,
      is_advanced: false,
    });
  };

  const openEditInstruction = (instruction: GatewaySetupInstruction) => {
    setEditingInstruction(instruction);
    setInstructionForm({
      title: instruction.title,
      content: instruction.content,
      step_number: instruction.step_number,
      is_advanced: instruction.is_advanced,
    });
    setShowInstructionModal(true);
  };

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <span className="text-4xl block mb-4">⚠</span>
          <p className="text-gray-700">You do not have permission to access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2">
        {(['profiles', 'drivers', 'instructions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {tab === 'profiles' && 'Gateway Profiles'}
            {tab === 'drivers' && 'Integration Drivers'}
            {tab === 'instructions' && 'Setup Instructions'}
          </button>
        ))}
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.type === 'success' ? '✓' : '⚠'}</span>
          <p>{message.text}</p>
        </div>
      )}

      {/* Gateway Profiles Tab */}
      {activeTab === 'profiles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Gateway Profiles</h3>
            <button
              onClick={() => {
                resetProfileForm();
                setEditingProfile(null);
                setShowProfileModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              +
              Add Profile
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{profile.display_name}</h4>
                    <p className="text-sm text-gray-600">
                      {profile.manufacturer} {profile.model}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                      profile.is_approved
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {profile.is_approved ? (
                      <>
                        ✓ Approved
                      </>
                    ) : (
                      <>
                        ⏱ Pending
                      </>
                    )}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-3">{profile.description}</p>

                <div className="space-y-2 mb-4 text-sm">
                  <p className="text-gray-700">
                    <span className="font-medium">Protocol:</span> {profile.protocol}
                  </p>
                  {profile.supported_frequency_bands.length > 0 && (
                    <p className="text-gray-700">
                      <span className="font-medium">Bands:</span>{' '}
                      {profile.supported_frequency_bands.join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditProfile(profile)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleApprove(profile)}
                    className={`flex-1 px-3 py-2 rounded transition-colors ${
                      profile.is_approved
                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    {profile.is_approved ? 'Unapprove' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No gateway profiles yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Integration Drivers Tab */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Integration Drivers</h3>
            <button
              onClick={() => {
                resetDriverForm();
                setEditingDriver(null);
                setShowDriverModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              +
              Add Driver
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Protocol</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Decoder Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Version</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Active</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      <div>
                        <p className="font-medium">{driver.display_name}</p>
                        <p className="text-gray-600 text-xs">{driver.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{driver.protocol}</td>
                    <td className="px-4 py-3 text-gray-700">{driver.decoder_type}</td>
                    <td className="px-4 py-3 text-gray-700">{driver.version}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleDriver(driver)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          driver.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEditDriver(driver)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {drivers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No integration drivers yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Setup Instructions Tab */}
      {activeTab === 'instructions' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="font-medium text-gray-700">Select Gateway Profile:</label>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select a profile --</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </div>

          {selectedProfileId && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Setup Steps</h3>
                <button
                  onClick={() => {
                    resetInstructionForm();
                    setEditingInstruction(null);
                    setShowInstructionModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  +
                  Add Step
                </button>
              </div>

              <div className="space-y-3">
                {instructions.length > 0 ? (
                  instructions.map((instruction) => (
                    <div
                      key={instruction.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                              {instruction.step_number}
                            </span>
                            <h4 className="font-semibold text-gray-900">{instruction.title}</h4>
                            {instruction.is_advanced && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                Advanced
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditInstruction(instruction)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInstruction(instruction.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap line-clamp-3">
                        {instruction.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No setup instructions for this profile yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!selectedProfileId && (
            <div className="text-center py-8 text-gray-500">
              <p>Select a gateway profile to view and manage setup instructions.</p>
            </div>
          )}
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <Modal
          title={editingProfile ? 'Edit Gateway Profile' : 'Add Gateway Profile'}
          onClose={() => {
            setShowProfileModal(false);
            setEditingProfile(null);
            resetProfileForm();
          }}
          onSubmit={handleSaveProfile}
          isLoading={loading}
        >
          <div className="space-y-4">
            <FormField
              label="Manufacturer *"
              value={profileForm.manufacturer}
              onChange={(e) => setProfileForm({ ...profileForm, manufacturer: e.target.value })}
            />
            <FormField
              label="Model *"
              value={profileForm.model}
              onChange={(e) => setProfileForm({ ...profileForm, model: e.target.value })}
            />
            <FormField
              label="Display Name *"
              value={profileForm.display_name}
              onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })}
            />
            <FormField
              label="Description"
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              isTextarea
            />
            <FormSelect
              label="Protocol *"
              value={profileForm.protocol}
              onChange={(e) => setProfileForm({ ...profileForm, protocol: e.target.value as Protocol })}
              options={[
                { value: 'lorawan_http', label: 'LoRaWAN HTTP' },
                { value: 'lorawan_mqtt', label: 'LoRaWAN MQTT' },
                { value: 'nb_iot', label: 'NB-IoT' },
                { value: 'sigfox', label: 'Sigfox' },
                { value: 'wifi', label: 'WiFi' },
                { value: 'cellular', label: 'Cellular' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <FormField
              label="Frequency Bands (comma-separated)"
              value={profileForm.frequency_bands}
              onChange={(e) => setProfileForm({ ...profileForm, frequency_bands: e.target.value })}
              placeholder="e.g., 868 MHz, 915 MHz"
            />
            <FormSelect
              label="Integration Driver"
              value={profileForm.payload_decoder_id}
              onChange={(e) => setProfileForm({ ...profileForm, payload_decoder_id: e.target.value })}
              options={[
                { value: '', label: '-- None --' },
                ...drivers.map((d) => ({ value: d.id, label: d.display_name })),
              ]}
            />
          </div>
        </Modal>
      )}

      {/* Driver Modal */}
      {showDriverModal && (
        <Modal
          title={editingDriver ? 'Edit Integration Driver' : 'Add Integration Driver'}
          onClose={() => {
            setShowDriverModal(false);
            setEditingDriver(null);
            resetDriverForm();
          }}
          onSubmit={handleSaveDriver}
          isLoading={loading}
          size="lg"
        >
          <div className="space-y-4">
            <FormField
              label="Name *"
              value={driverForm.name}
              onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
              placeholder="e.g., milesight_ug56_http"
            />
            <FormField
              label="Display Name *"
              value={driverForm.display_name}
              onChange={(e) => setDriverForm({ ...driverForm, display_name: e.target.value })}
              placeholder="e.g., Milesight UG56 HTTP Forward"
            />
            <FormField
              label="Description"
              value={driverForm.description}
              onChange={(e) => setDriverForm({ ...driverForm, description: e.target.value })}
              isTextarea
            />
            <FormSelect
              label="Protocol *"
              value={driverForm.protocol}
              onChange={(e) => setDriverForm({ ...driverForm, protocol: e.target.value as Protocol })}
              options={[
                { value: 'lorawan_http', label: 'LoRaWAN HTTP' },
                { value: 'lorawan_mqtt', label: 'LoRaWAN MQTT' },
                { value: 'nb_iot', label: 'NB-IoT' },
                { value: 'sigfox', label: 'Sigfox' },
                { value: 'wifi', label: 'WiFi' },
                { value: 'cellular', label: 'Cellular' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <FormSelect
              label="Decoder Type *"
              value={driverForm.decoder_type}
              onChange={(e) => setDriverForm({ ...driverForm, decoder_type: e.target.value as DecoderType })}
              options={[
                { value: 'javascript', label: 'JavaScript' },
                { value: 'json_path', label: 'JSON Path' },
                { value: 'binary_template', label: 'Binary Template' },
              ]}
            />
            {driverForm.decoder_type === 'javascript' && (
              <FormField
                label="Decoder Script"
                value={driverForm.decoder_script}
                onChange={(e) => setDriverForm({ ...driverForm, decoder_script: e.target.value })}
                isTextarea
                placeholder="function decode(payload) { ... }"
              />
            )}
            <FormField
              label="Field Mapping (JSON)"
              value={driverForm.field_mapping}
              onChange={(e) => setDriverForm({ ...driverForm, field_mapping: e.target.value })}
              isTextarea
              placeholder='{ "volume": "$.data.volume" }'
            />
            <FormField
              label="Version"
              value={driverForm.version}
              onChange={(e) => setDriverForm({ ...driverForm, version: e.target.value })}
              placeholder="1.0.0"
            />
          </div>
        </Modal>
      )}

      {/* Instruction Modal */}
      {showInstructionModal && (
        <Modal
          title={editingInstruction ? 'Edit Setup Instruction' : 'Add Setup Instruction'}
          onClose={() => {
            setShowInstructionModal(false);
            setEditingInstruction(null);
            resetInstructionForm();
          }}
          onSubmit={handleSaveInstruction}
          isLoading={loading}
          size="lg"
        >
          <div className="space-y-4">
            <FormField
              label="Title *"
              value={instructionForm.title}
              onChange={(e) => setInstructionForm({ ...instructionForm, title: e.target.value })}
              placeholder="e.g., Connect Gateway to Power"
            />
            <FormField
              label="Content (Markdown) *"
              value={instructionForm.content}
              onChange={(e) => setInstructionForm({ ...instructionForm, content: e.target.value })}
              isTextarea
              placeholder="Detailed instructions here..."
            />
            <FormField
              label="Step Number"
              type="number"
              value={String(instructionForm.step_number)}
              onChange={(e) => setInstructionForm({ ...instructionForm, step_number: parseInt(e.target.value) || 1 })}
            />
            <FormCheckbox
              label="Mark as Advanced"
              checked={instructionForm.is_advanced}
              onChange={(e) => setInstructionForm({ ...instructionForm, is_advanced: e.target.checked })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// Modal Component
interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
  isLoading?: boolean;
  size?: 'md' | 'lg';
}

function Modal({
  title,
  onClose,
  onSubmit,
  children,
  isLoading = false,
  size = 'md',
}: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-lg max-w-${size === 'lg' ? '2xl' : 'md'} w-full`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">{children}</div>

        <div className="flex gap-3 justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Form Components
interface FormFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  isTextarea?: boolean;
  type?: string;
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  isTextarea = false,
  type = 'text',
}: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          rows={4}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );
}

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
}

function FormSelect({ label, value, onChange, options }: FormSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function FormCheckbox({ label, checked, onChange }: FormCheckboxProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <label className="text-sm font-medium text-gray-700">{label}</label>
    </div>
  );
}
