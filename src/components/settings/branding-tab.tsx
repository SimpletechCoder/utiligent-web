'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/theme-provider';
import { createClient } from '@/lib/supabase/client';

interface BrandingTabProps {
  orgId: string;
  currentBranding: any;
}

const PRESET_PALETTES = [
  {
    name: 'Utiligent Blue',
    primary: '#2563eb',
    accent: '#7c3aed',
  },
  {
    name: 'Ocean Teal',
    primary: '#0d9488',
    accent: '#0284c7',
  },
  {
    name: 'Forest Green',
    primary: '#16a34a',
    accent: '#ca8a04',
  },
  {
    name: 'Sunset Orange',
    primary: '#ea580c',
    accent: '#dc2626',
  },
  {
    name: 'Royal Purple',
    primary: '#7c3aed',
    accent: '#ec4899',
  },
  {
    name: 'Slate Dark',
    primary: '#475569',
    accent: '#0ea5e9',
  },
  {
    name: 'Corporate Navy',
    primary: '#1e3a5f',
    accent: '#059669',
  },
];

const DEFAULT_BRANDING = {
  appName: 'Utiligent',
  logoUrl: '',
  primaryColor: '#2563eb',
  accentColor: '#7c3aed',
};

export function BrandingTab({ orgId, currentBranding }: BrandingTabProps) {
  const { setBranding } = useTheme();
  const [formData, setFormData] = useState({
    appName: DEFAULT_BRANDING.appName,
    logoUrl: '',
    primaryColor: DEFAULT_BRANDING.primaryColor,
    accentColor: DEFAULT_BRANDING.accentColor,
  });

  const [previewData, setPreviewData] = useState(formData);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoError, setLogoError] = useState(false);

  // Load initial branding values
  useEffect(() => {
    if (currentBranding) {
      const merged = {
        appName: currentBranding.appName || DEFAULT_BRANDING.appName,
        logoUrl: currentBranding.logoUrl || '',
        primaryColor: currentBranding.primaryColor || DEFAULT_BRANDING.primaryColor,
        accentColor: currentBranding.accentColor || DEFAULT_BRANDING.accentColor,
      };
      setFormData(merged);
      setPreviewData(merged);
    }
  }, [currentBranding]);

  // Update preview as form changes
  useEffect(() => {
    setPreviewData(formData);
  }, [formData]);

  const handleColorChange = (field: 'primaryColor' | 'accentColor', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePresetSelect = (palette: typeof PRESET_PALETTES[0]) => {
    setFormData(prev => ({
      ...prev,
      primaryColor: palette.primary,
      accentColor: palette.accent,
    }));
  };

  const handleTextChange = (field: 'appName' | 'logoUrl', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    if (field === 'logoUrl') {
      setLogoError(false);
    }
  };

  const handleApply = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const supabase = createClient();

      // Save to Supabase
      const { error } = await supabase
        .from('organizations')
        .update({
          branding: {
            appName: formData.appName,
            logoUrl: formData.logoUrl,
            primaryColor: formData.primaryColor,
            accentColor: formData.accentColor,
          },
        })
        .eq('id', orgId);

      if (error) {
        setMessage({
          type: 'error',
          text: `Error saving branding: ${error.message}`,
        });
        return;
      }

      // Apply to theme context
      setBranding({
        appName: formData.appName,
        logoUrl: formData.logoUrl,
        primary: formData.primaryColor,
        accent: formData.accentColor,
      });

      setMessage({
        type: 'success',
        text: 'Branding updated successfully',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const supabase = createClient();

      // Reset in Supabase
      const { error } = await supabase
        .from('organizations')
        .update({
          branding: null,
        })
        .eq('id', orgId);

      if (error) {
        setMessage({
          type: 'error',
          text: `Error resetting branding: ${error.message}`,
        });
        return;
      }

      // Reset form and theme
      setFormData(DEFAULT_BRANDING);
      setPreviewData(DEFAULT_BRANDING);
      setBranding({});

      setMessage({
        type: 'success',
        text: 'Branding reset to defaults',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const validateLogoUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text">Branding</h2>
        <p className="text-text-secondary mt-1">
          Customize your platform's appearance and identity
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Branding Section */}
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-text">Brand Identity</h3>

            {/* App Name */}
            <div>
              <label htmlFor="appName" className="block text-sm font-medium text-text mb-2">
                App Name
              </label>
              <input
                id="appName"
                type="text"
                value={formData.appName}
                onChange={e => handleTextChange('appName', e.target.value)}
                placeholder="e.g., Utiligent"
                className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-text-secondary mt-1">
                Displayed in the sidebar and window title
              </p>
            </div>

            {/* Logo URL */}
            <div>
              <label htmlFor="logoUrl" className="block text-sm font-medium text-text mb-2">
                Logo URL
              </label>
              <input
                id="logoUrl"
                type="url"
                value={formData.logoUrl}
                onChange={e => handleTextChange('logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
                className={`w-full px-4 py-2 border rounded-lg bg-surface text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  logoError ? 'border-red-500' : 'border-border'
                }`}
              />
              <p className="text-xs text-text-secondary mt-1">
                Must be a valid HTTPS URL to an image file
              </p>
            </div>
          </div>

          {/* Color Palette Section */}
          <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
            <h3 className="text-lg font-semibold text-text">Color Palette</h3>

            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-text mb-3">Primary Color</label>
              <div className="flex gap-3 items-start">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={e => handleColorChange('primaryColor', e.target.value)}
                  className="w-16 h-10 border border-border rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.primaryColor}
                  onChange={e => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      handleColorChange('primaryColor', val);
                    }
                  }}
                  placeholder="#000000"
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Used for buttons, active states, and primary UI elements
              </p>
            </div>

            {/* Accent Color */}
            <div>
              <label className="block text-sm font-medium text-text mb-3">Accent Color</label>
              <div className="flex gap-3 items-start">
                <input
                  type="color"
                  value={formData.accentColor}
                  onChange={e => handleColorChange('accentColor', e.target.value)}
                  className="w-16 h-10 border border-border rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.accentColor}
                  onChange={e => {
                    const val = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                      handleColorChange('accentColor', val);
                    }
                  }}
                  placeholder="#000000"
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Used for secondary highlights and hover states
              </p>
            </div>

            {/* Preset Palettes */}
            <div>
              <label className="block text-sm font-medium text-text mb-3">Preset Palettes</label>
              <div className="grid grid-cols-2 gap-3">
                {PRESET_PALETTES.map(palette => (
                  <button
                    key={palette.name}
                    onClick={() => handlePresetSelect(palette)}
                    className="p-3 rounded-lg border border-border hover:border-text-secondary transition text-left hover:bg-opacity-50"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: palette.primary }}
                      />
                      <div
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: palette.accent }}
                      />
                    </div>
                    <p className="text-sm font-medium text-text">{palette.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="lg:col-span-1">
          <div className="bg-surface border border-border rounded-lg p-6 sticky top-4 space-y-4">
            <h3 className="text-lg font-semibold text-text">Live Preview</h3>

            {/* Sidebar Preview */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div
                className="p-4 text-white space-y-3"
                style={{ backgroundColor: previewData.primaryColor }}
              >
                {previewData.logoUrl && !logoError ? (
                  <div className="flex items-center justify-center h-10 mb-2">
                    <img
                      src={previewData.logoUrl}
                      alt="Logo preview"
                      className="max-h-10 max-w-full"
                      onError={() => setLogoError(true)}
                    />
                  </div>
                ) : (
                  <div className="h-10 flex items-center justify-center font-bold text-sm">
                    {previewData.appName.substring(0, 3).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1 pt-2 border-t border-white border-opacity-30">
                  <div className="h-2 rounded bg-white bg-opacity-30" />
                  <div className="h-2 rounded bg-white bg-opacity-20" />
                  <div className="h-2 rounded bg-white bg-opacity-20" />
                </div>
              </div>
              <div className="bg-surface-secondary p-4 space-y-2">
                <p className="text-xs text-text-secondary">Sidebar preview</p>
                <p className="text-sm text-text truncate">{previewData.appName}</p>
              </div>
            </div>

            {/* Button Preview */}
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">Button preview</p>
              <button
                disabled
                style={{
                  backgroundColor: previewData.primaryColor,
                  color: 'white',
                }}
                className="w-full py-2 rounded-lg font-medium text-sm opacity-100 hover:opacity-90 transition"
              >
                Primary Button
              </button>
              <button
                disabled
                style={{
                  backgroundColor: previewData.accentColor,
                  color: 'white',
                }}
                className="w-full py-2 rounded-lg font-medium text-sm opacity-100 hover:opacity-90 transition"
              >
                Accent Button
              </button>
            </div>

            {/* Color Display */}
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-text-secondary mb-1">Primary</p>
                <p className="text-text font-mono">{previewData.primaryColor}</p>
              </div>
              <div>
                <p className="text-text-secondary mb-1">Accent</p>
                <p className="text-text font-mono">{previewData.accentColor}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-6 border-t border-border">
        <button
          onClick={handleApply}
          disabled={isSaving}
          style={
            !isSaving
              ? {
                  backgroundColor: formData.primaryColor,
                  color: 'white',
                }
              : {}
          }
          className="px-6 py-2 rounded-lg font-medium transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Apply Branding'}
        </button>
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-6 py-2 rounded-lg font-medium border border-border text-text hover:bg-surface-secondary transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset to Default
        </button>
      </div>
    </div>
  );
}
