import assert from "node:assert/strict";
import test from "node:test";

import { hasOrganizationPermission, organizationPermissions } from "../src/lib/permissions";

test("catálogo de permissões não contém entradas duplicadas", () => {
  assert.equal(new Set(organizationPermissions).size, organizationPermissions.length);
});

test("profissional possui leitura operacional mínima e não acessa áreas globais sensíveis", () => {
  assert.equal(hasOrganizationPermission("professional", "appointments.read"), true);
  assert.equal(hasOrganizationPermission("professional", "clients.read"), true);
  assert.equal(hasOrganizationPermission("professional", "appointments.manage"), false);
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
