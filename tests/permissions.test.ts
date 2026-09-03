import assert from "node:assert/strict";
import test from "node:test";

import { selectCurrentOrganization } from "../src/lib/organization-selection";
import { hasOrganizationPermission, organizationPermissions } from "../src/lib/permissions";

test("catálogo de permissões não contém entradas duplicadas", () => {
  assert.equal(new Set(organizationPermissions).size, organizationPermissions.length);
});

test("profissional administra somente agenda e disponibilidade, sem áreas globais sensíveis", () => {
  assert.equal(hasOrganizationPermission("professional", "appointments.read"), true);
  assert.equal(hasOrganizationPermission("professional", "clients.read"), true);
  assert.equal(hasOrganizationPermission("professional", "appointments.manage"), true);
  assert.equal(hasOrganizationPermission("professional", "availability.manage"), true);
  assert.equal(hasOrganizationPermission("professional", "clients.manage"), false);
  assert.equal(hasOrganizationPermission("professional", "documents.read"), false);
  assert.equal(hasOrganizationPermission("professional", "chat.inbox"), false);
  assert.equal(hasOrganizationPermission("professional", "finance.read"), false);
});

test("proprietário mantém acesso integral", () => {
  for (const permission of organizationPermissions) {
    assert.equal(hasOrganizationPermission("owner", permission), true, permission);
  }
});

test("administrador possui acesso integral, exceto cobrança", () => {
  for (const permission of organizationPermissions) {
    assert.equal(
      hasOrganizationPermission("admin", permission),
      permission !== "billing.manage",
      permission,
    );
  }
});

test("papéis operacionais não recebem permissões administrativas indevidas", () => {
  const forbiddenByRole = {
    manager: ["organization.settings.manage", "team.manage", "billing.manage", "integrations.manage"],
    receptionist: ["organization.settings.manage", "team.manage", "billing.manage", "finance.manage", "audit.read"],
    staff: ["organization.settings.manage", "team.manage", "billing.manage", "appointments.manage", "clients.manage"],
    viewer: ["organization.settings.manage", "team.manage", "billing.manage", "appointments.manage", "clients.manage", "chat.inbox"],
    member: ["organization.settings.manage", "team.manage", "billing.manage", "appointments.manage", "clients.manage", "chat.inbox"],
  } as const;

  for (const [role, permissions] of Object.entries(forbiddenByRole)) {
    for (const permission of permissions) {
      assert.equal(hasOrganizationPermission(role, permission), false, `${role}:${permission}`);
    }
  }
});

test("papéis somente leitura não podem alterar nenhum domínio", () => {
  const writePermissions = organizationPermissions.filter((permission) =>
    permission.endsWith(".manage")
    || permission === "chat.inbox"
    || permission === "sales.sell"
    || permission === "sales.discount"
    || permission === "sales.cancel"
    || permission === "cash.close",
  );

  for (const role of ["viewer", "member"] as const) {
    for (const permission of writePermissions) {
      assert.equal(hasOrganizationPermission(role, permission), false, `${role}:${permission}`);
    }
  }
});

test("papel desconhecido não recebe nenhuma permissão", () => {
  for (const permission of organizationPermissions) {
    assert.equal(hasOrganizationPermission("invalid-role", permission), false, permission);
  }
});

test("empresa solicitada só é selecionada quando pertence ao usuário", () => {
  const aura = { id: "aura", name: "Clínica Aura" };
  const cliniHora = { id: "clinihora", name: "CliniHora" };
  const memberships = [aura, cliniHora];

  assert.equal(selectCurrentOrganization(memberships, "clinihora"), cliniHora);
  assert.equal(selectCurrentOrganization(memberships, "empresa-de-terceiro"), aura);
  assert.equal(selectCurrentOrganization(memberships, null), aura);
  assert.equal(selectCurrentOrganization([], "empresa-de-terceiro"), undefined);
});
