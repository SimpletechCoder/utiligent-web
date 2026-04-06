import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GatewayAddWizard } from "@/components/gateway-add-wizard";

async function getGatewayProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data, error } = await supabase
    .from("gateway_profiles")
    .select("id, manufacturer, model, display_name, description, image_url")
    .eq("is_approved", true)
    .order("display_name");

  if (error) {
    console.error("gateway_profiles query error:", error);
  }
  return data ?? [];
}

async function getSites(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("sites")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("sites query error:", error);
  }
  return data ?? [];
}

async function getOrganization(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  return data?.organization_id ?? "";
}

export default async function AddGatewayPage() {
  const supabase = await createClient();
  const [profiles, sites, organizationId] = await Promise.all([
    getGatewayProfiles(supabase),
    getSites(supabase),
    getOrganization(supabase),
  ]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/gateways"
              className="text-blue-600 hover:text-blue-700"
            >
              Gateways
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">Add</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Add Gateway</h1>
          <p className="text-gray-500 mt-1">
            Set up a new gateway to manage meters and collect data
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        {profiles.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-500 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              No gateway profiles available
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Gateway profiles must be set up before you can add gateways.
            </p>
            <Link
              href="/dashboard/gateways"
              className="text-blue-600 hover:text-blue-700 font-medium text-sm mt-4"
            >
              Back to Gateways
            </Link>
          </div>
        ) : (
          <GatewayAddWizard
            profiles={profiles}
            sites={sites}
            organizationId={organizationId}
          />
        )}
      </div>
    </div>
  );
}
