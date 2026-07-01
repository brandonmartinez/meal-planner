import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { config } from "../config/index.js";
import { hashCredential, legacyHashCredential } from "./credentialHash.js";

describe("credentialHash", () => {
  describe("hashCredential", () => {
    it("produces a 64-char hex HMAC-SHA256 keyed by the configured pepper", () => {
      const out = hashCredential("raw-key");
      expect(out).toMatch(/^[a-f0-9]{64}$/);
      expect(out).toBe(
        crypto
          .createHmac("sha256", config.credentialPepper)
          .update("raw-key")
          .digest("hex"),
      );
    });

    it("is deterministic for the same input (so findUnique lookups work)", () => {
      expect(hashCredential("raw-key")).toBe(hashCredential("raw-key"));
    });

    it("is NOT the bare (unpeppered) SHA-256 — the pepper is load-bearing", () => {
      // A DB leak of only the hash cannot be reproduced without the pepper.
      expect(hashCredential("raw-key")).not.toBe(legacyHashCredential("raw-key"));
    });

    it("changes when the pepper changes (different pepper -> different digest)", () => {
      const withConfiguredPepper = hashCredential("raw-key");
      const withDifferentPepper = crypto
        .createHmac("sha256", `${config.credentialPepper}-different`)
        .update("raw-key")
        .digest("hex");
      expect(withConfiguredPepper).not.toBe(withDifferentPepper);
    });
  });

  describe("legacyHashCredential", () => {
    it("produces the legacy unpeppered SHA-256 used before the pepper", () => {
      expect(legacyHashCredential("raw-key")).toBe(
        crypto.createHash("sha256").update("raw-key").digest("hex"),
      );
    });
  });
});
