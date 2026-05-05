import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken, verifyToken } from "./jwt.js";

const user = { id: "u-1", email: "a@b.com", name: "Alice" };

describe("jwt utils", () => {
  it("round-trips a payload via generate + verify", () => {
    const token = generateToken(user);
    expect(typeof token).toBe("string");
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject(user);
  });

  it("throws on a tampered token", () => {
    const token = generateToken(user);
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A");
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws on a token signed with a different secret", () => {
    const bad = jwt.sign({ id: "x", email: "x@x", name: "X" }, "other-secret");
    expect(() => verifyToken(bad)).toThrow();
  });

  it("throws on an expired token", () => {
    const expired = jwt.sign(
      { id: "u", email: "e", name: "n" },
      process.env.JWT_SECRET!,
      { expiresIn: "-1s" },
    );
    expect(() => verifyToken(expired)).toThrow();
  });

  it("only includes the documented payload fields", () => {
    const token = generateToken({ ...user, email: "a@b.com" });
    const decoded = verifyToken(token) as Record<string, unknown>;
    expect(decoded.id).toBe("u-1");
    expect(decoded.email).toBe("a@b.com");
    expect(decoded.name).toBe("Alice");
  });
});
