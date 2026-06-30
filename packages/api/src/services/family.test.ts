import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  createFamily,
  generateInviteToken,
  joinFamily,
  updateMemberRole,
  updateFamily,
  removeMember,
  getFamilyById,
  getUserFamilies,
  getMembers,
} = await import("./family.js");

describe("family service", () => {
  describe("createFamily", () => {
    it("creates a family with a PARENT membership and placeholder meals", async () => {
      const fake = { id: "f1", name: "Fam", members: [] };
      prismaMock.family.create.mockResolvedValue(fake as never);

      const result = await createFamily("user-1", "Fam");

      expect(result).toBe(fake);
      const args = prismaMock.family.create.mock.calls[0][0] as {
        data: {
          name: string;
          members: { create: { userId: string; role: string } };
        };
      };
      expect(args.data.name).toBe("Fam");
      expect(args.data.members.create).toEqual({
        userId: "user-1",
        role: "PARENT",
      });
      // Each placeholder kind contributes a meal.
      const meals = (args.data as unknown as { meals: { create: unknown[] } })
        .meals.create;
      expect(meals.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe("generateInviteToken / joinFamily", () => {
    it("round-trips an invite token and creates a membership", async () => {
      const token = generateInviteToken("fam-1", "CHILD");
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Record<
        string,
        unknown
      >;
      expect(decoded.familyId).toBe("fam-1");
      expect(decoded.role).toBe("CHILD");
      expect(decoded.type).toBe("family_invite");

      prismaMock.familyMember.findUnique.mockResolvedValue(null);
      const created = {
        id: "m-1",
        familyId: "fam-1",
        userId: "u-1",
        role: "CHILD",
      };
      prismaMock.familyMember.create.mockResolvedValue(created as never);

      const member = await joinFamily("u-1", token);

      expect(member).toBe(created);
      const callArgs = prismaMock.familyMember.create.mock.calls[0][0] as {
        data: { familyId: string; userId: string; role: string };
      };
      expect(callArgs.data).toEqual({
        familyId: "fam-1",
        userId: "u-1",
        role: "CHILD",
      });
    });

    it("rejects a non-invite JWT", async () => {
      const wrong = jwt.sign(
        { familyId: "f", role: "CHILD", type: "something_else" },
        process.env.JWT_SECRET!,
      );
      await expect(joinFamily("u-1", wrong)).rejects.toThrow(/Invalid invite/);
    });

    it("rejects when user is already a member", async () => {
      const token = generateInviteToken("fam-1", "CHILD");
      prismaMock.familyMember.findUnique.mockResolvedValue({
        id: "existing",
      } as never);
      await expect(joinFamily("u-1", token)).rejects.toThrow(
        /Already a member/,
      );
    });

    it("rejects an invalid signature", async () => {
      const bad = jwt.sign(
        { familyId: "f", role: "CHILD", type: "family_invite" },
        "wrong",
      );
      await expect(joinFamily("u-1", bad)).rejects.toThrow();
    });
  });

  describe("updateMemberRole / removeMember", () => {
    it("scopes update by familyId + memberId", async () => {
      prismaMock.familyMember.update.mockResolvedValue({
        id: "m",
        role: "PARENT",
      } as never);
      await updateMemberRole("fam-1", "m-1", "PARENT");
      expect(prismaMock.familyMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m-1", familyId: "fam-1" },
          data: { role: "PARENT" },
        }),
      );
    });

    it("scopes delete by familyId + memberId", async () => {
      prismaMock.familyMember.delete.mockResolvedValue({} as never);
      await removeMember("fam-1", "m-1");
      expect(prismaMock.familyMember.delete).toHaveBeenCalledWith({
        where: { id: "m-1", familyId: "fam-1" },
      });
    });
  });

  describe("updateFamily", () => {
    it("forwards name and timezone to prisma.family.update", async () => {
      prismaMock.family.update.mockResolvedValue({
        id: "fam-1",
        name: "New",
        timezone: "America/Chicago",
      } as never);
      await updateFamily("fam-1", { name: "New", timezone: "America/Chicago" });
      expect(prismaMock.family.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "fam-1" },
          data: { name: "New", timezone: "America/Chicago" },
        }),
      );
    });
  });

  describe("queries", () => {
    it("getFamilyById passes familyId", async () => {
      prismaMock.family.findUnique.mockResolvedValue(null);
      await getFamilyById("fam-1");
      expect(prismaMock.family.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "fam-1" } }),
      );
    });

    it("getUserFamilies filters by membership.some.userId", async () => {
      prismaMock.family.findMany.mockResolvedValue([] as never);
      await getUserFamilies("u-1");
      const arg = prismaMock.family.findMany.mock.calls[0][0] as {
        where: unknown;
      };
      expect(arg.where).toEqual({ members: { some: { userId: "u-1" } } });
    });

    it("getMembers filters by familyId", async () => {
      prismaMock.familyMember.findMany.mockResolvedValue([] as never);
      await getMembers("fam-1");
      expect(prismaMock.familyMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: "fam-1" } }),
      );
    });
  });
});
