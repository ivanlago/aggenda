import assert from "node:assert/strict";
import test from "node:test";
import { managedOrganizationLogoId } from "../src/lib/organization-logo";

test("substituição remove somente logos gerenciadas da própria empresa", () => {
  const id = "aggenda/organizations/org-one/catalog/logos/logo_123";
  assert.equal(managedOrganizationLogoId(`https://res.cloudinary.com/cloud/image/upload/v123/${id}.png`, "org-one", "cloud"), id);
  for (const url of [
    "https://res.cloudinary.com/cloud/image/upload/v123/aggenda/organizations/org-two/catalog/logos/logo.png",
    "https://res.cloudinary.com/other-cloud/image/upload/v123/aggenda/organizations/org-two/catalog/logos/logo.png",
    "https://other-site.com/logo.png",
    "https://res.cloudinary.com/cloud/image/upload/v123/aggenda/organizations/org-two/catalog/services/image.png",
  ]) assert.equal(managedOrganizationLogoId(url, "org-one", "cloud"), null);
  assert.equal(managedOrganizationLogoId(null, "org-one", "cloud"), null);
});
