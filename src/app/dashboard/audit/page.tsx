import { userHasPermission } from "@/lib/permissions";
import AuditLogClient from "@/components/audit-log-client";

export default async function AuditPage() {
  const canView = await userHasPermission("audit.view");

  if (!canView) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-text">Audit Log</h1>
        <div className="mt-6 bg-surface rounded-xl border border-border p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-secondary text-text-muted flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text mb-1">
            You don&apos;t have access to the audit log
          </h2>
          <p className="text-text-muted">
            The <code className="text-xs">audit.view</code> permission is
            required. Contact an administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return <AuditLogClient />;
}
