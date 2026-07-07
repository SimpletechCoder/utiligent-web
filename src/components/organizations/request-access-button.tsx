"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestEditAccess } from "@/app/actions/admin";

interface RequestAccessButtonProps {
  organizationId: string;
  existingStatus?: string | null;
}

export function RequestAccessButton({
  organizationId,
  existingStatus,
}: RequestAccessButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(existingStatus === "pending");

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await requestEditAccess(organizationId, reason || null);
      if (!result.success) {
        setError(result.error ?? "Failed to submit request");
        return;
      }
      setDone(true);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Edit access requested
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover transition-colors"
      >
        Request Edit Access
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-text mb-2">Request Edit Access</h3>
            <p className="text-sm text-text-secondary mb-4">
              This drill-down is read-only. Submit a request to gain edit access to this
              organization. The request is recorded in the audit log.
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <label className="block text-sm font-medium text-text mb-1">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Why do you need edit access?"
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
              >
                {busy ? "Submitting…" : "Submit Request"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
