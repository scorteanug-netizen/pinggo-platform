export type WorkspaceMembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "AGENT";
export type GlobalRole = "USER" | "SUPER_ADMIN";
export type AppRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

export type PermissionSet = {
  canViewDashboard: boolean;
  canViewLeads: boolean;
  canManageLeadActions: boolean;
  canReassignLeads: boolean;
  canViewCompanies: boolean;
  canViewUsers: boolean;
  canViewFlows: boolean;
  canEditFlows: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
  canEditSettings: boolean;
  canViewIntegrations: boolean;
  canEditIntegrations: boolean;
  canViewMembers: boolean;
  canInviteUsers: boolean;
  canViewNotifications: boolean;
};

export type PermissionKey = keyof PermissionSet;

const SUPER_ADMIN_PERMISSIONS: PermissionSet = {
  canViewDashboard: true,
  canViewLeads: true,
  canManageLeadActions: true,
  canReassignLeads: true,
  canViewCompanies: true,
  canViewUsers: true,
  canViewFlows: true,
  canEditFlows: true,
  canViewReports: true,
  canViewSettings: true,
  canEditSettings: true,
  canViewIntegrations: true,
  canEditIntegrations: true,
  canViewMembers: true,
  canInviteUsers: true,
  canViewNotifications: true,
};

const ADMIN_PERMISSIONS: PermissionSet = {
  canViewDashboard: true,
  canViewLeads: true,
  canManageLeadActions: true,
  canReassignLeads: true,
  canViewCompanies: false,
  canViewUsers: false,
  canViewFlows: true,
  canEditFlows: true,
  canViewReports: true,
  canViewSettings: true,
  canEditSettings: true,
  canViewIntegrations: true,
  canEditIntegrations: true,
  canViewMembers: true,
  canInviteUsers: false,
  canViewNotifications: true,
};

const MANAGER_PERMISSIONS: PermissionSet = {
  canViewDashboard: true,
  canViewLeads: true,
  canManageLeadActions: true,
  canReassignLeads: true,
  canViewCompanies: false,
  canViewUsers: false,
  canViewFlows: true,
  canEditFlows: false,
  canViewReports: true,
  canViewSettings: false,
  canEditSettings: false,
  canViewIntegrations: false,
  canEditIntegrations: false,
  canViewMembers: false,
  canInviteUsers: false,
  canViewNotifications: true,
};

const AGENT_PERMISSIONS: PermissionSet = {
  canViewDashboard: true,
  canViewLeads: true,
  canManageLeadActions: true,
  canReassignLeads: false,
  canViewCompanies: false,
  canViewUsers: false,
  canViewFlows: false,
  canEditFlows: false,
  canViewReports: false,
  canViewSettings: false,
  canEditSettings: false,
  canViewIntegrations: false,
  canEditIntegrations: false,
  canViewMembers: false,
  canInviteUsers: false,
  canViewNotifications: true,
};

const ROLE_PERMISSIONS: Record<AppRole, PermissionSet> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  AGENT: AGENT_PERMISSIONS,
};

function normalizeMembershipRole(role: string | null | undefined): WorkspaceMembershipRole {
  if (role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "AGENT") {
    return role;
  }
  return "AGENT";
}

function normalizeGlobalRole(role: string | null | undefined): GlobalRole {
  return role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
}

export function resolveAppRole(input: {
  globalRole: string | null | undefined;
  membershipRole: string | null | undefined;
}): AppRole {
  const globalRole = normalizeGlobalRole(input.globalRole);
  if (globalRole === "SUPER_ADMIN") {
    return "SUPER_ADMIN";
  }

  const membershipRole = normalizeMembershipRole(input.membershipRole);
  if (membershipRole === "OWNER" || membershipRole === "ADMIN") {
    return "ADMIN";
  }
  if (membershipRole === "MANAGER") {
    return "MANAGER";
  }
  return "AGENT";
}

export function getPermissionsForRole(role: AppRole): PermissionSet {
  return ROLE_PERMISSIONS[role];
}

export function getPermissionsForContext(input: {
  globalRole: string | null | undefined;
  membershipRole: string | null | undefined;
}) {
  const appRole = resolveAppRole(input);
  return {
    appRole,
    permissions: getPermissionsForRole(appRole),
  };
}

export function hasPermission(permissions: PermissionSet, key: PermissionKey) {
  return permissions[key];
}
