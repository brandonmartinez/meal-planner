import { describe, it, expect } from "vitest";
import {
  parseAllowedOrigins,
  isOriginAllowed,
  resolveClientIp,
  createHandshakeThrottle,
  type HandshakeLike,
} from "./handshake.js";

describe("parseAllowedOrigins", () => {
  it("returns a single origin unchanged", () => {
    expect(parseAllowedOrigins("https://app.example.com")).toEqual([
      "https://app.example.com",
    ]);
  });

  it("splits a comma-separated list and trims whitespace", () => {
    expect(
      parseAllowedOrigins("https://a.example.com, https://b.example.com"),
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("strips a single trailing slash and drops empty entries", () => {
    expect(parseAllowedOrigins("https://a.example.com/, ,")).toEqual([
      "https://a.example.com",
    ]);
  });
});

describe("isOriginAllowed", () => {
  const allowed = ["https://app.example.com"];

  it("allows a missing Origin (non-browser / server-to-server client)", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it("allows an empty Origin", () => {
    expect(isOriginAllowed("", allowed)).toBe(true);
  });

  it("allows an exact match", () => {
    expect(isOriginAllowed("https://app.example.com", allowed)).toBe(true);
  });

  it("allows a match differing only by a trailing slash", () => {
    expect(isOriginAllowed("https://app.example.com/", allowed)).toBe(true);
  });

  it("rejects a present, non-matching Origin (the real attack surface)", () => {
    expect(isOriginAllowed("https://evil.example.com", allowed)).toBe(false);
  });

  it("rejects a scheme mismatch", () => {
    expect(isOriginAllowed("http://app.example.com", allowed)).toBe(false);
  });

  it("matches against any entry in a multi-origin allowlist", () => {
    const multi = ["https://a.example.com", "https://b.example.com"];
    expect(isOriginAllowed("https://b.example.com", multi)).toBe(true);
    expect(isOriginAllowed("https://c.example.com", multi)).toBe(false);
  });
});

describe("resolveClientIp", () => {
  function hs(
    address: string | undefined,
    xff?: string | string[],
  ): HandshakeLike {
    return {
      address,
      headers: xff === undefined ? {} : { "x-forwarded-for": xff },
    };
  }

  it("with a numeric hop count of 1, returns the last XFF entry (the real client)", () => {
    // Chain: [client, proxy] arriving as XFF="client", socketAddr="proxy".
    // With 1 trusted hop the client is 1 from the right of [client, proxy].
    expect(resolveClientIp(hs("10.0.0.1", "203.0.113.7"), 1)).toBe(
      "203.0.113.7",
    );
  });

  it("with hop count 1 and a multi-entry XFF, peels exactly one proxy", () => {
    // full = [1.1.1.1, 2.2.2.2, 3.3.3.3(socket)]; idx = 3-1-1 = 1 → 2.2.2.2
    expect(
      resolveClientIp(hs("3.3.3.3", "1.1.1.1, 2.2.2.2"), 1),
    ).toBe("2.2.2.2");
  });

  it("with a numeric hop count but no XFF, falls back to the socket address", () => {
    expect(resolveClientIp(hs("10.0.0.1"), 1)).toBe("10.0.0.1");
  });

  it("with trust proxy false, uses the socket peer address verbatim", () => {
    expect(resolveClientIp(hs("10.0.0.1", "203.0.113.7"), false)).toBe(
      "10.0.0.1",
    );
  });

  it("with trust proxy true, best-effort leftmost XFF", () => {
    expect(
      resolveClientIp(hs("10.0.0.1", "203.0.113.7, 10.0.0.9"), true),
    ).toBe("203.0.113.7");
  });

  it("returns a stable sentinel when no address is available", () => {
    expect(resolveClientIp(hs(undefined), false)).toBe("ip-unknown");
  });
});

describe("createHandshakeThrottle", () => {
  it("allows attempts within budget and rejects once the limit is exceeded", () => {
    const t = 1_000;
    const throttle = createHandshakeThrottle({
      windowMs: 1_000,
      limit: 3,
      now: () => t,
    });

    expect(throttle.check("1.1.1.1")).toBe(true);
    expect(throttle.check("1.1.1.1")).toBe(true);
    expect(throttle.check("1.1.1.1")).toBe(true);
    expect(throttle.check("1.1.1.1")).toBe(false);
    throttle.dispose();
  });

  it("keys buckets per IP", () => {
    const t = 0;
    const throttle = createHandshakeThrottle({
      windowMs: 1_000,
      limit: 1,
      now: () => t,
    });

    expect(throttle.check("1.1.1.1")).toBe(true);
    expect(throttle.check("1.1.1.1")).toBe(false);
    // A different IP has its own budget.
    expect(throttle.check("2.2.2.2")).toBe(true);
    throttle.dispose();
  });

  it("resets the budget after the window elapses", () => {
    let t = 0;
    const throttle = createHandshakeThrottle({
      windowMs: 1_000,
      limit: 1,
      now: () => t,
    });

    expect(throttle.check("1.1.1.1")).toBe(true);
    expect(throttle.check("1.1.1.1")).toBe(false);
    t += 1_000; // window boundary reached
    expect(throttle.check("1.1.1.1")).toBe(true);
    throttle.dispose();
  });

  it("is disabled (allows everything) when limit is 0", () => {
    const throttle = createHandshakeThrottle({ windowMs: 1_000, limit: 0 });
    for (let i = 0; i < 100; i++) {
      expect(throttle.check("1.1.1.1")).toBe(true);
    }
    throttle.dispose();
  });
});
