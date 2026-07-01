import crypto from "crypto";
import { config } from "../config/index.js";

/**
 * Credential hashing for BOTH agent credentials and Magic Mirror display API
 * keys. Centralised here so every verification site (agentCredential service,
 * apiKey service, and the auth middleware) agrees on exactly one algorithm.
 *
 * We use an HMAC-SHA256 keyed by a server-side pepper (`config.credentialPepper`)
 * rather than a bare SHA-256:
 *  - It stays DETERMINISTIC, so `findUnique({ where: { hashedKey } })` lookups
 *    still work with no per-record salt (our keys are 256-bit random, so a
 *    per-record salt buys nothing against pre-image search).
 *  - It is KEYED, so a database leak ALONE cannot verify or forge a credential:
 *    an attacker also needs the pepper, which lives only in the app's
 *    environment and is never stored alongside the hashes or logged.
 */
export function hashCredential(raw: string): string {
  return crypto
    .createHmac("sha256", config.credentialPepper)
    .update(raw)
    .digest("hex");
}

/**
 * Legacy, UNPEPPERED SHA-256 of the raw key — the algorithm used before the
 * pepper was introduced. Used ONLY as a fallback when verifying a credential
 * whose stored hash predates the pepper, so those rows can be transparently
 * re-hashed to {@link hashCredential} on next use (lazy migration). It is NEVER
 * used to store a new hash.
 */
export function legacyHashCredential(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
