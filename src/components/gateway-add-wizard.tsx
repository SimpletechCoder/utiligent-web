"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface GatewayProfile {
  id: string;
  manufacturer: string;
  model: string;
  display_name: string;
  description: string;
  image_url: string | null;
}

interface SetupInstruction {
  step_number: number;
  title: string;
  content: string;
  image_url: string | null;
  is_advanced: boolean;
}

interface GatewayAddWizardProps {
  profiles: GatewayProfile[];
  sites: { id: string; name: string }[];
  organizationId: string;
}

export function GatewayAddWizard({
  profiles,
  sites,
  organizationId,
}: GatewayAddWizardProps) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<SetupInstruction[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate API key on the fly
  const generateApiKey = () => {
    return "sk_" + Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  };

  // Load instructions when profile is selected
  const handleProfileSelect = async (profileId: string) => {
    setSelectedProfile(profileId);
    setCurrentStep(0);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from("gateway_setup_instructions")
        .select("*")
        .eq("gateway_profile_id", profileId)
        .order("step_number", { ascending: true });

      if (err) throw err;
      setInstructions(data || []);
    } catch (err) {
      console.error("Failed to load instructions:", err);
      setError("Failed to load setup instructions");
    }
  };

  const visibleInstructions = showAdvanced
    ? instructions
    : instructions.filter((i) => !i.is_advanced);

  const handleCreateGateway = async () => {
    if (!selectedProfile) return;

    setLoading(true);
    setError(null);

    try {
      const profile = profiles.find((p) => p.id === selectedProfile);
      const apiKey = generateApiKey();

      const { error: err } = await supabase.from("gateways").insert({
        organization_id: organizationId,
        name: `${profile?.display_name} ${new Date().toLocaleDateString()}`,
        serial_number: `SN-${Date.now()}`,
        api_key: apiKey,
        firmware_version: "1.0.0",
        status: "pending",
        gateway_profile_id: selectedProfile,
      });

      if (err) throw err;

      router.push("/dashboard/gateways");
      router.refresh();
    } catch (err) {
      console.error("Failed to create gateway:", err);
      setError("Failed to create gateway. Please try again.");
      setLoading(false);
    }
  };

  // Guided mode
  if (mode === "guided") {
    if (!selectedProfile) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Select Gateway Profile
            </h2>
            <p className="text-gray-500">
              Choose from approved gateway profiles to get started with guided setup.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleProfileSelect(profile.id)}
                className="text-left bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-md transition-all"
              >
                {profile.image_url && (
                  <div className="mb-4 h-32 bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={profile.image_url}
                      alt={profile.display_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <h3 className="font-semibold text-gray-900">
                  {profile.display_name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {profile.manufacturer} {profile.model}
                </p>
                <p className="text-sm text-gray-600 mt-3">{profile.description}</p>
              </button>
            ))}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={() => setMode("advanced")}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Switch to Advanced Mode
            </button>
          </div>
        </div>
      );
    }

    // Show setup wizard
    if (instructions.length === 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-6 py-4 rounded-lg">
          <p className="font-medium">No setup instructions available</p>
          <p className="text-sm mt-1">
            This gateway profile does not have setup instructions yet.
          </p>
          <button
            onClick={() => setSelectedProfile(null)}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm mt-3"
          >
            Back to profiles
          </button>
        </div>
      );
    }

    const instruction = visibleInstructions[currentStep];
    const apiKey = generateApiKey();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Step {currentStep + 1} of {visibleInstructions.length}
            </h2>
            <p className="text-gray-500 mt-1">{instruction.title}</p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {showAdvanced ? "Hide" : "Show"} advanced steps
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div
            className="bg-blue-600 h-1 rounded-full transition-all"
            style={{
              width: `${((currentStep + 1) / visibleInstructions.length) * 100}%`,
            }}
          />
        </div>

        {instruction.image_url && (
          <div className="bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={instruction.image_url}
              alt={instruction.title}
              className="w-full h-auto"
            />
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="prose prose-sm max-w-none text-gray-700">
            {instruction.content}
          </div>
        </div>

        {/* Ingest URL and API Key */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">Configuration Details</p>
          <div>
            <label className="block text-xs text-blue-800 font-medium mb-1">
              Ingest URL
            </label>
            <input
              type="text"
              readOnly
              value="https://ehysifztspotxmmmkuyc.supabase.co/functions/v1/ingest"
              className="w-full px-3 py-2 bg-white border border-blue-200 rounded text-sm font-mono text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs text-blue-800 font-medium mb-1">
              API Key
            </label>
            <input
              type="text"
              readOnly
              value={apiKey}
              className="w-full px-3 py-2 bg-white border border-blue-200 rounded text-sm font-mono text-gray-700"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() =>
              setCurrentStep(Math.max(0, currentStep - 1))
            }
            disabled={currentStep === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {currentStep < visibleInstructions.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreateGateway}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Create Gateway"}
            </button>
          )}
        </div>

        <button
          onClick={() => setSelectedProfile(null)}
          className="text-blue-600 hover:text-blue-700 font-medium text-sm"
        >
          Back to profiles
        </button>
      </div>
    );
  }

  // Advanced mode form
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Advanced Gateway Setup
        </h2>
        <p className="text-gray-500">
          Enter all gateway details manually.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Gateway Name
          </label>
          <input
            type="text"
            placeholder="e.g., Main Building Gateway"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Serial Number
          </label>
          <input
            type="text"
            placeholder="e.g., UG56-12345678"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Site
          </label>
          <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900">
            <option value="">Select a site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Gateway Profile
          </label>
          <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900">
            <option value="">Select a profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Firmware Version
          </label>
          <input
            type="text"
            placeholder="e.g., 1.0.0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setMode("guided")}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Guided Mode
        </button>
        <button
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Gateway"}
        </button>
      </div>
    </div>
  );
}
