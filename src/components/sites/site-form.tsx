"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSite, updateSite, type SiteInput } from "@/app/actions/sites";
import { SITE_STATUSES, type SiteStatus } from "@/lib/types";

export interface SiteFormValues {
  id?: string;
  name: string;
  code: string;
  street: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  timezone: string;
  status: string;
}

const TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Windhoek",
  "Africa/Maputo",
  "Africa/Harare",
  "Africa/Gaborone",
  "UTC",
];

const EMPTY: SiteFormValues = {
  name: "",
  code: "",
  street: "",
  city: "",
  province: "",
  country: "South Africa",
  postalCode: "",
  latitude: "",
  longitude: "",
  timezone: "Africa/Johannesburg",
  status: "active",
};

function toInput(v: SiteFormValues): SiteInput {
  const address = {
    street: v.street.trim() || undefined,
    city: v.city.trim() || undefined,
    province: v.province.trim() || undefined,
    country: v.country.trim() || undefined,
    postalCode: v.postalCode.trim() || undefined,
  };
  const hasAddress = Object.values(address).some(Boolean);
  return {
    name: v.name,
    code: v.code,
    address: hasAddress ? address : null,
    latitude: v.latitude.trim() === "" ? null : Number(v.latitude),
    longitude: v.longitude.trim() === "" ? null : Number(v.longitude),
    timezone: v.timezone,
    status: v.status as SiteStatus,
  };
}

interface SiteFormModalProps {
  mode: "create" | "edit";
  organizationId?: string;
  initial?: Partial<SiteFormValues>;
  siteId?: string;
  onClose: () => void;
}

export function SiteFormModal({
  mode,
  organizationId,
  initial,
  siteId,
  onClose,
}: SiteFormModalProps) {
  const router = useRouter();
  const [values, setValues] = useState<SiteFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const input = toInput(values);
      const result =
        mode === "create"
          ? await createSite(organizationId ?? "", input)
          : await updateSite(siteId ?? "", input);

      if (!result.success) {
        setError(result.error ?? "Failed to save site");
        return;
      }
      onClose();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-text mb-4">
          {mode === "create" ? "Add Site" : "Edit Site"}
        </h3>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Name</label>
              <input
                type="text"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputClass}
                placeholder="e.g., Riverside Estate"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Code</label>
              <input
                type="text"
                value={values.code}
                onChange={(e) => set("code", e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="e.g., RVS-01"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">Street</label>
            <input
              type="text"
              value={values.street}
              onChange={(e) => set("street", e.target.value)}
              className={inputClass}
              placeholder="123 Main Road"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">City</label>
              <input
                type="text"
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Province</label>
              <input
                type="text"
                value={values.province}
                onChange={(e) => set("province", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Country</label>
              <input
                type="text"
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Postal Code</label>
              <input
                type="text"
                value={values.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={values.latitude}
                onChange={(e) => set("latitude", e.target.value)}
                className={inputClass}
                placeholder="-26.2041"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                value={values.longitude}
                onChange={(e) => set("longitude", e.target.value)}
                className={inputClass}
                placeholder="28.0473"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Timezone</label>
              <select
                value={values.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className={inputClass}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Status</label>
              <select
                value={values.status}
                onChange={(e) => set("status", e.target.value)}
                className={inputClass}
              >
                {SITE_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || !values.name || !values.code}
            className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : mode === "create" ? "Create Site" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Button + modal used on the Sites list page to create a site. */
export function AddSiteButton({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Site
      </button>
      {open && (
        <SiteFormModal
          mode="create"
          organizationId={organizationId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Button + modal used on the Site detail page to edit a site. */
export function EditSiteButton({
  siteId,
  initial,
}: {
  siteId: string;
  initial: Partial<SiteFormValues>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-text hover:bg-surface-hover"
      >
        Edit
      </button>
      {open && (
        <SiteFormModal
          mode="edit"
          siteId={siteId}
          initial={initial}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
