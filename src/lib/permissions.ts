export const organizationPermissions = [
  "organization.read",
  "organization.settings.manage",
  "team.read",
  "team.manage",
  "billing.manage",
  "clients.read",
  "clients.manage",
  "professionals.read",
  "professionals.manage",
  "services.read",
  "services.manage",
  "appointments.read",
  "appointments.manage",
  "availability.read",
  "availability.manage",
  "audit.read",
  "chat.inbox",
  "chat.configure",
  "integrations.manage",
  "finance.read",
  "finance.manage",
  "crm.read",
  "crm.manage",
  "inventory.read",
  "inventory.manage",
  "sales.sell",
  "sales.discount",
  "sales.cancel",
  "cash.close",
  "documents.read",
  "documents.manage",
] as const;

export type OrganizationPermission = (typeof organizationPermissions)[number];
export type OrganizationRole =
  | "owner"
  | "admin"
  | "manager"
  | "receptionist"
  | "professional"
  | "staff"
  | "viewer"
  | "member";

const all = new Set<OrganizationPermission>(organizationPermissions);
const operationalRead: OrganizationPermission[] = [
  "organization.read",
  "clients.read",
  "professionals.read",
  "services.read",
  "appointments.read",
  "availability.read",
  "crm.read",
  "inventory.read",
  "documents.read",
];

const rolePermissions: Record<OrganizationRole, ReadonlySet<OrganizationPermission>> = {
  owner: all,
  admin: new Set(organizationPermissions.filter((permission) => permission !== "billing.manage")),
  manager: new Set([
    ...operationalRead,
    "clients.manage",
    "professionals.manage",
    "services.manage",
    "appointments.manage",
    "availability.manage",
    "team.read",
    "audit.read",
    "finance.read",
    "finance.manage",
    "chat.inbox",
    "crm.manage",
    "inventory.manage",
    "sales.sell",
    "sales.discount",
    "sales.cancel",
    "cash.close",
    "documents.manage",
  ]),
  receptionist: new Set([
    ...operationalRead,
    "clients.manage",
    "appointments.manage",
    "chat.inbox",
    "crm.manage",
    "inventory.manage",
    "sales.sell",
    "cash.close",
    "documents.manage",
  ]),
  professional: new Set([
    "organization.read",
    "clients.read",
    "services.read",
    "appointments.read",
    "availability.read",
  ]),
  staff: new Set([...operationalRead, "chat.inbox", "sales.sell"]),
  viewer: new Set(operationalRead),
  member: new Set(operationalRead),
};

export function hasOrganizationPermission(
  role: string,
  permission: OrganizationPermission
) {
  return rolePermissions[role as OrganizationRole]?.has(permission) ?? false;
}

export function assertOrganizationPermission(
  role: string,
  permission: OrganizationPermission
) {
  if (!hasOrganizationPermission(role, permission)) {
    throw new Error("Você não tem permissão para realizar esta ação.");
  }
}

export const platformRoles = [
  "super_admin",
  "support",
  "billing",
  "operations",
  "auditor",
] as const;
export type PlatformRole = (typeof platformRoles)[number];
