import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { GatewayDetailClient } from "@/components/gateway-detail-client";

interface GatewayDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getGateway(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
) {
  const { data, error } = await supabase
    .from("gateways")
    .select(
      `
      id, name, serial_number, firmware_version, status,
      last_seen_at, last_heartbeat_at, provisioned_at,
      api_key, signing_key, metadata,
      site_id, sites(id, name),
      gateway_profile_id, gateway_profiles(id, display_name, manufacturer, model, description),
      integration_driver_id, integration_drivers(id, name, protocol, display_name)
    `
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("gateway query error:", error);
    return null;
  }
  return data;
}

async function getSetupInstructions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
) {
  const { data, error } = await supabase
    .from("gateway_setup_instructions")
    .select("*")
    .eq("gateway_profile_id", profileId)
    .order("step_number", { ascending: true });

  if (error) {
    console.error("setup_instructions query error:", error);
  }
  return data ?? [];
}

async function getLinkedMeters(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gatewayId: string
) {
  const { data, error } = await supabase
    .from("meters")
    .select("id, name, serial_number, status, meter_type")
    .eq("gateway_id", gatewayId)
    .order("name");

  if (error) {
    console.error("meters query error:", error);
  }
  return data ?? [];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
  online: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  offline: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
  pending: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-700" },
  provisioned: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
  active: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  inactive: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-600" },
  revoked: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-600" },
  archived: { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

export default async function GatewayDetailPage({
  params,
}: GatewayDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const [gateway, canEdit, canDelete] = await Promise.all([
    getGateway(supabase, id),
    userHasPermission("gateway.edit"),
    userHasPermission("gateway.delete"),
  ]);

  if (!gateway) {
    notFound();
  }

  const [setupInstructions, linkedMeters] = await Promise.all([
    gateway.gateway_profile_id
      ? getSetupInstructions(supabase, gateway.gateway_profile_id)
      : Promise.resolve([]),
    getLinkedMeters(supabase, id),
  ]);

  const style = statusStyles[gateway.status as keyof typeof statusStyles] ?? statusStyles.offline;

  // Type assertions for nested objects
  const siteData = Array.isArray(gateway.sites) ? gateway.sites[0] : gateway.sites;
  const profileData = Array.isArray(gateway.gateway_profiles)
    ? gateway.gateway_profiles[0]
    : gateway.gateway_profiles;
  const driverData = Array.isArray(gateway.integration_drivers)
    ? gateway.integration_drivers[0]
    : gateway.integration_drivers;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/dashboard/gateways"
            className="text-blue-600 hover:text-blue-700"
          >
            Gateways
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600">{gateway.name}</span>
        </div>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{gateway.name}</h1>
          <p className="text-gray-500 mt-1">
            {gateway.serial_number}
          </p>
        </div>
        <div className="flex gap-2">
          {(canEdit || canDelete) && (
            <>
              {canEdit && (
                <Link
                  href={`/dashboard/gateways/${id}/edit`}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </Link>
              )}
              {canDelete && (
                <GatewayDetailClient gatewayId={id} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-6 flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${style.bg} ${style.text}`}
        >
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          <span className="capitalize">{gateway.status}</span>
        </span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Configuration */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Configuration
            </h2>

            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-600">Serial Number</span>
                <span className="font-mono text-sm text-gray-900">
                  {gateway.serial_number}
                </span>
              </div>

              {siteData && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">Site</span>
                  <Link
                    href={`/dashboard/sites/${siteData.id}`}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {siteData.name}
                  </Link>
                </div>
              )}

              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-600">Firmware Version</span>
                <span className="font-mono text-sm text-gray-900">
                  {gateway.firmware_version ?? "—"}
                </span>
              </div>

              {profileData && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">Profile</span>
                  <span className="text-gray-900">
                    {profileData.display_name}
                  </span>
                </div>
              )}

              {driverData && (
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-600">Integration Driver</span>
                  <span className="text-gray-900">
                    {driverData.display_name}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-600">Last Seen</span>
                <span className="text-gray-900">
                  {timeAgo(gateway.last_seen_at)}
                </span>
              </div>

              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-gray-600">Last Heartbeat</span>
                <span className="text-gray-900">
                  {timeAgo(gateway.last_heartbeat_at)}
                </span>
              </div>

              {gateway.provisioned_at && (
                <div className="flex justify-between py-3">
                  <span className="text-gray-600">Provisioned At</span>
                  <span className="text-gray-900">
                    {new Date(gateway.provisioned_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Ingest Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ingest URL
                </label>
                <input
                  type="text"
                  readOnly
                  value="https://ehysifztspotxmmmkuyc.supabase.co/functions/v1/ingest"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    readOnly
                    value={gateway.api_key || ""}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-600"
                  />
                  <button className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-gray-600">
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Linked Meters</h3>
            <p className="text-sm text-gray-600 mb-4">
              {linkedMeters.length} meter{linkedMeters.length !== 1 ? "s" : ""}{" "}
              connected
            </p>
            {linkedMeters.length > 0 ? (
              <ul className="space-y-2">
                {linkedMeters.slice(0, 5).map((meter) => (
                  <li key={meter.id}>
                    <Link
                      href={`/dashboard/meters/${meter.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 truncate block"
                    >
                      {meter.name || meter.serial_number}
                    </Link>
                  </li>
                ))}
                {linkedMeters.length > 5 && (
                  <li className="text-xs text-gray-500 pt-2">
                    and {linkedMeters.length - 5} more...
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No meters linked yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Setup Instructions */}
      {setupInstructions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Setup Instructions
          </h2>
          <div className="space-y-6">
            {setupInstructions
              .filter((i) => !i.is_advanced)
              .map((instruction) => (
                <div key={instruction.step_number} className="pb-6 border-b border-gray-100 last:border-b-0">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                        {instruction.step_number}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">
                        {instruction.title}
                      </h3>
                      {instruction.image_url && (
                        <div className="mb-3 rounded-lg overflow-hidden bg-gray-100">
                          <img
                            src={instruction.image_url}
                            alt={instruction.title}
                            className="w-full h-auto"
                          />
                        </div>
                      )}
                      <div className="text-sm text-gray-600 prose prose-sm max-w-none">
                        {instruction.content}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
