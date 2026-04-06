'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AuditLog {
  id: string;
  organization_id: string;
  actor_user_id: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    setLoading(true);
    const supabase = createClient();

    // TODO: Add permission check here
    // Check if user has 'audit.view' permission flag
    // const { data: userProfile } = await supabase
    //   .from("user_permissions")
    //   .select("permissions")
    //   .eq("user_id", userId)
    //   .single();
    // if (!userProfile?.permissions?.includes('audit.view')) {
    //   router.push('/dashboard');
    //   return;
    // }

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(200);

    // Apply filters
    if (filterEntityType) {
      query = query.eq('entity_type', filterEntityType);
    }
    if (filterAction) {
      query = query.ilike('action', `%${filterAction}%`);
    }
    if (filterStartDate) {
      query = query.gte('created_at', new Date(filterStartDate).toISOString());
    }
    if (filterEndDate) {
      const endOfDay = new Date(filterEndDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('audit_logs query error:', error);
    }
    setLogs(data ?? []);
    setLoading(false);
  }

  // Get unique entity types from current logs for filter dropdown
  const entityTypes = Array.from(new Set(logs.map((log) => log.entity_type))).sort();

  const filteredLogs = logs.filter((log) => {
    if (filterEntityType && log.entity_type !== filterEntityType) return false;
    if (filterAction && !log.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
    if (filterStartDate && new Date(log.created_at) < new Date(filterStartDate)) return false;
    if (filterEndDate) {
      const endOfDay = new Date(filterEndDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (new Date(log.created_at) > endOfDay) return false;
    }
    return true;
  });

  const handleResetFilters = () => {
    setFilterEntityType('');
    setFilterAction('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const formatJson = (obj: Record<string, unknown> | null | undefined): string => {
    if (!obj) return '{}';
    return JSON.stringify(obj, null, 2);
  };

  const truncateJson = (obj: Record<string, unknown> | null | undefined, maxLength: number = 80): string => {
    const json = formatJson(obj);
    if (json.length > maxLength) {
      return json.substring(0, maxLength) + '...';
    }
    return json;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Track all system changes and user actions across your organization</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Entity Type</label>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Action (Search)</label>
            <input
              type="text"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              placeholder="e.g., create, update"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Start Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">End Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleResetFilters}
              className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Audit logs table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
          <div className="inline-block">
            <div className="animate-spin w-8 h-8 border-3 border-gray-200 border-t-blue-600 rounded-full" />
          </div>
          <p className="text-gray-500 mt-4">Loading audit logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No audit logs</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            {logs.length === 0
              ? 'No audit logs have been recorded yet. Actions will appear here as they happen.'
              : 'No logs match your current filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Timestamp</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">User</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Action</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Entity Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Entity ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {log.actor_user_id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.entity_type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {log.entity_id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        {expandedId === log.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded details */}
          {expandedId && (
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
              <div className="max-w-4xl">
                <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Details</h4>
                <pre className="text-xs text-gray-700 bg-white rounded-lg border border-gray-200 p-3 overflow-auto max-h-60">
                  {formatJson(logs.find((l) => l.id === expandedId)?.details)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info note */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl px-6 py-4">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">Audit Trail</p>
            <p className="text-xs text-blue-700 mt-1">
              This log displays all system changes including user actions, configuration updates, and administrative operations. Latest 200 entries shown.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
