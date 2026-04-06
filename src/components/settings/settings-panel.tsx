"use client";

import React, { useState } from "react";
import { OrgSettingsTab } from "./org-settings-tab";
import { UsersTab } from "./users-tab";
import { PermissionProfilesTab } from "./permission-profiles-tab";
import { GatewayProfilesTab } from "./gateway-profiles-tab";
import { ResellerTab } from "./reseller-tab";

type Tab = "general" | "users" | "permissions" | "gateways" | "reseller";

interface SettingsPanelProps {
  org: any;
  membership: any;
  user: any;
  permissions: string[];
  isPlatformAdmin: boolean;
}

const tabs: { id: Tab; label: string; icon: React.ReactNode; requiredFlag?: string; platformOnly?: boolean }[] = [
  {
    id: "general",
    label: "Organization",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: "users",
    label: "Users",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    requiredFlag: "user.view",
  },
  {
    id: "permissions",
    label: "Permission Profiles",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    requiredFlag: "user.permission.override",
  },
  {
    id: "gateways",
    label: "Gateway Profiles",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
      </svg>
    ),
    requiredFlag: "gateway.profile.manage",
  },
  {
    id: "reseller",
    label: "Reseller",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    platformOnly: true,
  },
];

export function SettingsPanel({ org, membership, user, permissions, isPlatformAdmin }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const permSet = new Set(permissions);

  const visibleTabs = tabs.filter((tab) => {
    if (tab.platformOnly && !isPlatformAdmin) return false;
    if (tab.requiredFlag && !permSet.has(tab.requiredFlag) && !isPlatformAdmin) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization, users, and platform configuration</p>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className={activeTab === tab.id ? "text-blue-600" : "text-gray-400"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "general" && (
          <OrgSettingsTab org={org} membership={membership} user={user} permissions={permissions} />
        )}
        {activeTab === "users" && (
          <UsersTab orgId={org?.id} permissions={permissions} isPlatformAdmin={isPlatformAdmin} />
        )}
        {activeTab === "permissions" && (
          <PermissionProfilesTab orgId={org?.id} isPlatformAdmin={isPlatformAdmin} />
        )}
        {activeTab === "gateways" && (
          <GatewayProfilesTab isPlatformAdmin={isPlatformAdmin} />
        )}
        {activeTab === "reseller" && (
          <ResellerTab />
        )}
      </div>
    </div>
  );
}
