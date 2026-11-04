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
  "documents.sign",
  "clinical.read",
  "clinical.manage",
  "clinical.issue",
] as const;

export type OrganizationPermission = (typeof organizationPermissions)[number];
export type OrganizationRole =
  | "owner"
  | "admin"
  | "manager"
  | "receptionist"
  | "professional"
  | "financial"
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
    "chat.inbox",
    "crm.manage",
    "inventory.manage",
    "sales.sell",
    "sales.discount",
    "sales.cancel",
    "cash.close",

  ]),
  receptionist: new Set([
    "organization.read",
    "clients.read",
    "professionals.read",
    "services.read",
    "appointments.read",
    "availability.read",
    "crm.read",

    "clients.manage",
    "appointments.manage",
    "chat.inbox",
    "crm.manage",
    "sales.sell",
    "cash.close",

  ]),
  professional: new Set([
    "clinical.read",
    "clinical.manage",
    "clinical.issue",
    "documents.sign",
    "organization.read",
    "clients.read",
    "services.read",
    "appointments.read",
    "appointments.manage",
    "availability.read",
    "availability.manage",
  ]),
  financial: new Set([
    "organization.read",
    "clients.read",
    "professionals.read",
    "services.read",
    "appointments.read",
    "audit.read",
    "finance.read",
    "finance.manage",
    "inventory.read",
    "cash.close",
  ]),
  staff: new Set([...operationalRead, "chat.inbox", "sales.sell"]),
  viewer: new Set(operationalRead),
  member: new Set(operationalRead),
};

export const teamRoles = ["admin", "receptionist", "professional"] as const;
export type TeamRole = (typeof teamRoles)[number];
export const teamRoleLabels: Record<TeamRole, string> = {
  admin: "Administrador", receptionist: "Secretária", professional: "Atendente",
};
export type TeamPermissionOverrides = Partial<Record<TeamRole, OrganizationPermission[]>>;

// Configure operational access without changing ownership or clinical scope.
export const configurableTeamPermissions = {
  "clients.manage": "Cadastrar e editar clientes",
  "appointments.manage": "Criar e editar agendamentos",
  "availability.manage": "Configurar disponibilidade",
  "services.manage": "Cadastrar e editar serviços",
  "crm.manage": "Gerenciar relacionamento com clientes",
} as const satisfies Partial<Record<OrganizationPermission, string>>;

export function hasOrganizationPermission(
  role: string,
  permission: OrganizationPermission,
  overrides?: TeamPermissionOverrides | null,
) {
  const configured = overrides?.[role as TeamRole];
  if (configured && Object.hasOwn(configurableTeamPermissions, permission)) {
    return configured.includes(permission);
  }
  return rolePermissions[role as OrganizationRole]?.has(permission) ?? false;
}

export function assertOrganizationPermission(
  role: string,
  permission: OrganizationPermission,
  overrides?: TeamPermissionOverrides | null,
) {
  if (!hasOrganizationPermission(role, permission, overrides)) {
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
