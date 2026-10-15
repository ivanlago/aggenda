import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSocialUrl, publicSocialLinks, socialPlatforms } from "../src/lib/social-links";

test("social profiles normalize HTTPS and accept the configured platforms", () => {
  for (const platform of socialPlatforms) {
    assert.equal(normalizeSocialUrl(platform, platform.placeholder), platform.placeholder);
    assert.equal(normalizeSocialUrl(platform, "  "), null);
  }
  assert.equal(normalizeSocialUrl(socialPlatforms[0], "instagram.com/clinica"), "https://instagram.com/clinica");
  assert.equal(normalizeSocialUrl(socialPlatforms[0], "http://www.instagram.com/clinica"), "https://www.instagram.com/clinica");
});

test("public links reject scripts, credentials, lookalike domains and wrong platforms", () => {
  for (const input of ["javascript:alert(1)", "data:text/html,test", "https://instagram.com.attacker.example/a",
    "https://attackerinstagram.com/a", "https://instagram.com@attacker.example", "https://user:password@instagram.com/a",
    "https://instagram.com:8080/a", "https://facebook.com/a", "https://instagram.com/" + "a".repeat(2048)]) {
    assert.throws(() => normalizeSocialUrl(socialPlatforms[0], input));
  }
  assert.deepEqual(publicSocialLinks({ instagram: "javascript:alert(1)", facebook: null, x: {}, unknown: "https://example.com" }), []);
  assert.deepEqual(publicSocialLinks(null), []);
  assert.deepEqual(publicSocialLinks({ instagram: "instagram.com/clinica", x: "https://x.com/clinica" }).map(link => link.id), ["instagram", "x"]);
});
