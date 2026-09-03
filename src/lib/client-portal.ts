import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CLIENT_PORTAL_COOKIE = "aggenda_client_portal";
export const CLIENT_CHALLENGE_COOKIE = "aggenda_client_challenge";
export const CLIENT_CODE_TTL_MINUTES = 15;
export const CLIENT_SESSION_TTL_DAYS = 30;

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET não configurada.");
  return value;
}

export function portalHash(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function portalMatches(value: string, hash: string) {
  const received = Buffer.from(portalHash(value));
  const expected = Buffer.from(hash);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createPortalCredentials() {
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { token, code, tokenHash: portalHash(token), codeHash: portalHash(code) };
}

export function createPortalSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: portalHash(token) };
}

export function secureCookie() {
  return process.env.NODE_ENV === "production";
}
