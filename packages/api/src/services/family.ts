import jwt, { SignOptions } from "jsonwebtoken";
import {
  MEAL_PLACEHOLDER_KINDS,
  MEAL_PLACEHOLDERS,
} from "@meal-planner/shared";
import prisma from "../config/database.js";
import { config } from "../config/index.js";

interface InvitePayload {
  familyId: string;
  role: "PARENT" | "CHILD";
  type: "family_invite";
}

export async function createFamily(userId: string, name: string) {
  return prisma.family.create({
    data: {
      name,
      members: {
        create: {
          userId,
          role: "PARENT",
        },
      },
      meals: {
        create: MEAL_PLACEHOLDER_KINDS.map((kind) => ({
          name: MEAL_PLACEHOLDERS[kind].name,
          description: MEAL_PLACEHOLDERS[kind].description,
          placeholderKind: kind,
        })),
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });
}

export async function getFamilyById(familyId: string) {
  return prisma.family.findUnique({
    where: { id: familyId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });
}

export async function getUserFamilies(userId: string) {
  return prisma.family.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });
}

export function generateInviteToken(
  familyId: string,
  role: "PARENT" | "CHILD",
): string {
  const payload: InvitePayload = { familyId, role, type: "family_invite" };
  const options: SignOptions = { expiresIn: "7d" };
  return jwt.sign(payload, config.jwt.secret, options);
}

export async function joinFamily(userId: string, inviteToken: string) {
  const payload = jwt.verify(inviteToken, config.jwt.secret) as InvitePayload;

  if (payload.type !== "family_invite") {
    throw new Error("Invalid invite token");
  }

  const existing = await prisma.familyMember.findUnique({
    where: { familyId_userId: { familyId: payload.familyId, userId } },
  });

  if (existing) {
    throw new Error("Already a member of this family");
  }

  return prisma.familyMember.create({
    data: {
      familyId: payload.familyId,
      userId,
      role: payload.role,
    },
    include: {
      family: true,
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}

export async function updateMemberRole(
  familyId: string,
  memberId: string,
  role: "PARENT" | "CHILD",
) {
  return prisma.familyMember.update({
    where: { id: memberId, familyId },
    data: { role },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}

export async function removeMember(familyId: string, memberId: string) {
  return prisma.familyMember.delete({
    where: { id: memberId, familyId },
  });
}

export async function updateFamily(
  familyId: string,
  data: { name?: string; timezone?: string },
) {
  return prisma.family.update({
    where: { id: familyId },
    data,
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  });
}

export async function getMembers(familyId: string) {
  return prisma.familyMember.findMany({
    where: { familyId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
}
