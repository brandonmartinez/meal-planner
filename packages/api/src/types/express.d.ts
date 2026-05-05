import { User as PrismaUser, FamilyMember } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: PrismaUser & { memberships?: (FamilyMember & { family: { id: string; name: string } })[] };
      familyId?: string;
    }
  }
}

export {};
