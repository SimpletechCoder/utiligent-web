"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface GatewayDetailClientProps {
  gatewayId: string;
}

export function GatewayDetailClient({ gatewayId }: GatewayDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: err } = await supabase
        .from("gateways")
        .update({ status: "archived" })
        .eq("id", gatewayId);

      if (err) throw err;

      router.push("/dashboard/gateways");
      router.refresh();
    } catch (err) {
      console.error("Failed to delete gateway:", err);
      setError("Failed to delete gateway. Please try again.");
      setLoading(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Delete Gateway?
          </h3>
          <p className="text-gray-600 text-sm mb-6">
            This will archive the gateway. This action cannot be undone.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
    >
      Delete
    </button>
  );
}
