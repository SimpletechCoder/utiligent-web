"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createGateway } from "@/app/actions/gateways";

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
  // The API key is minted server-side and returned exactly once on creation.
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);

  // Advanced-mode form fields (controlled)
  const [advName, setAdvName] = useState("");
  const [advSerial, setAdvSerial] = useState("");
  const [advSite, setAdvSite] = useState("");
  const [advProfile, setAdvProfile] = useState("");

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

    const profile = profiles.find((p) => p.id === selectedProfile);
    const result = await createGateway({
      organizationId,
      gatewayProfileId: selectedProfile,
      name: profile?.display_name
        ? `${profile.display_name} ${new Date().toLocaleDateString()}`
        : undefined,
    });

    if (!result.success) {
      setError(result.error ?? "Failed to create gateway. Please try again.");
      setLoading(false);
      return;
    }

    setCreatedApiKey(result.apiKey ?? "");
    setLoading(false);
  };

  const handleCreateGatewayAdvanced = async () => {
    if (!advProfile) {
      setError("Please select a gateway profile.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createGateway({
      organizationId,
      gatewayProfileId: advProfile,
      name: advName || undefined,
      serialNumber: advSerial || undefined,
      siteId: advSite || null,
    });

    if (!result.success) {
      setError(result.error ?? "Failed to create gateway. Please try again.");
      setLoading(false);
      return;
    }

    setCreatedApiKey(result.apiKey ?? "");
    setLoading(false);
  };

  // Success screen — the API key is shown only once, right after creation.
  if (createdApiKey !== null) {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-green-800 mb-2">
            Gateway created
          </h2>
          <p className="text-sm text-green-700">
            Copy the API key below now — for security it is shown only once and
            cannot be retrieved again.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary font-medium mb-1">
              Ingest URL
            </label>
            <input
              type="text"
              readOnly
              value="https://ehysifztspotxmmmkuyc.supabase.co/functions/v1/ingest"
              className="w-full px-3 py-2 bg-surface-secondary border border-border rounded text-sm font-mono text-text"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary font-medium mb-1">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={createdApiKey}
                className="flex-1 px-3 py-2 bg-surface-secondary border border-border rounded text-sm font-mono text-text"
              />
              <button
                onClick={() => navigator.clipboard?.writeText(createdApiKey)}
                className="px-3 py-2 bg-surface-hover hover:bg-surface rounded text-xs font-medium text-text-secondary"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            router.push("/dashboard/gateways");
            router.refresh();
          }}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark"
        >
          Done
        </button>
      </div>
    );
  }

  // Guided mode
  if (mode === "guided") {
    if (!selectedProfile) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-text mb-2">
              Select Gateway Profile
            </h2>
            <p className="text-text-secondary">
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
                className="text-left bg-surface border-2 border-border rounded-xl p-6 hover:border-blue-400 hover:shadow-md transition-all"
              >
                {profile.image_url && (
                  <div className="mb-4 h-32 bg-surface-hover rounded-lg overflow-hidden">
                    <img
                      src={profile.image_url}
                      alt={profile.display_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <h3 className="font-semibold text-text">
                  {profile.display_name}
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  {profile.manufacturer} {profile.model}
                </p>
                <p className="text-sm text-text-secondary mt-3">{profile.description}</p>
              </button>
            ))}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={() => setMode("advanced")}
              className="text-brand hover:text-brand-dark font-medium text-sm"
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
            className="text-brand hover:text-brand-dark font-medium text-sm mt-3"
          >
            Back to profiles
          </button>
        </div>
      );
    }

    const instruction = visibleInstructions[currentStep];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text">
              Step {currentStep + 1} of {visibleInstructions.length}
            </h2>
            <p className="text-text-secondary mt-1">{instruction.title}</p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-text-secondary hover:text-text underline"
          >
            {showAdvanced ? "Hide" : "Show"} advanced steps
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-border rounded-full h-1">
          <div
            className="bg-brand h-1 rounded-full transition-all"
            style={{
              width: `${((currentStep + 1) / visibleInstructions.length) * 100}%`,
            }}
          />
        </div>

        {instruction.image_url && (
          <div className="bg-surface-hover rounded-lg overflow-hidden">
            <img
              src={instruction.image_url}
              alt={instruction.title}
              className="w-full h-auto"
            />
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="prose prose-sm max-w-none text-text">
            {instruction.content}
          </div>
        </div>

        {/* Ingest URL — the API key is issued only after the gateway is
            created (on the final step), so it is not shown here. */}
        <div className="bg-brand-light border border-brand rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-brand">Configuration Details</p>
          <div>
            <label className="block text-xs text-brand font-medium mb-1">
              Ingest URL
            </label>
            <input
              type="text"
              readOnly
              value="https://ehysifztspotxmmmkuyc.supabase.co/functions/v1/ingest"
              className="w-full px-3 py-2 bg-surface border border-brand rounded text-sm font-mono text-text"
            />
          </div>
          <p className="text-xs text-brand">
            A unique API key will be generated and displayed once when you
            create the gateway on the final step.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() =>
              setCurrentStep(Math.max(0, currentStep - 1))
            }
            disabled={currentStep === 0}
            className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {currentStep < visibleInstructions.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark"
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
          className="text-brand hover:text-brand-dark font-medium text-sm"
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
        <h2 className="text-xl font-semibold text-text mb-2">
          Advanced Gateway Setup
        </h2>
        <p className="text-text-secondary">
          Enter all gateway details manually.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Gateway Name
          </label>
          <input
            type="text"
            value={advName}
            onChange={(e) => setAdvName(e.target.value)}
            placeholder="e.g., Main Building Gateway"
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none text-text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Serial Number
          </label>
          <input
            type="text"
            value={advSerial}
            onChange={(e) => setAdvSerial(e.target.value)}
            placeholder="e.g., UG56-12345678"
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none text-text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Site
          </label>
          <select
            value={advSite}
            onChange={(e) => setAdvSite(e.target.value)}
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none text-text"
          >
            <option value="">Select a site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Gateway Profile
          </label>
          <select
            value={advProfile}
            onChange={(e) => setAdvProfile(e.target.value)}
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none text-text"
          >
            <option value="">Select a profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setMode("guided")}
          className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover"
        >
          Back to Guided Mode
        </button>
        <button
          onClick={handleCreateGatewayAdvanced}
          disabled={loading || !advProfile}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Gateway"}
        </button>
      </div>
    </div>
  );
}
