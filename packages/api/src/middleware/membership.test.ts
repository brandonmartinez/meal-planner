import { describe, it, expect } from "vitest";
import { requireMembership } from "./membership.js";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";

describe("requireMembership", () => {
  it("responds 400 when no familyId is on the request", () => {
    const req = buildReq();
    const res = buildRes();
    const next = buildNext();
    requireMembership(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 403 when user is not a member of the family", () => {
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = { memberships: [] };
    const res = buildRes();
    const next = buildNext();
    requireMembership(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches membership and calls next when user is a member", () => {
    const membership = { id: "m-1", familyId: "fam-1", role: "PARENT" };
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = {
      memberships: [membership],
    };
    const res = buildRes();
    const next = buildNext();
    requireMembership(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(
      (req as unknown as { membership: typeof membership }).membership,
    ).toEqual(membership);
  });
});
