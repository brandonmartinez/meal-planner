import crypto from 'crypto';
import prisma from '../config/database.js';

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createApiKey(familyId: string, userId: string, name: string) {
  const rawKey = crypto.randomBytes(32).toString('hex');
  const hashedKey = hashKey(rawKey);

  const record = await prisma.apiKey.create({
    data: {
      name,
      key: hashedKey,
      familyId,
      createdBy: userId,
    },
  });

  return {
    id: record.id,
    name: record.name,
    key: rawKey,
    createdAt: record.createdAt,
  };
}

export async function listApiKeys(familyId: string) {
  return prisma.apiKey.findMany({
    where: { familyId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsed: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(keyId: string, familyId: string) {
  return prisma.apiKey.delete({
    where: { id: keyId, familyId },
  });
}

export async function validateApiKey(rawKey: string) {
  const hashedKey = hashKey(rawKey);
  const record = await prisma.apiKey.findUnique({
    where: { key: hashedKey },
  });

  if (!record) {
    return null;
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsed: new Date() },
  });

  return { familyId: record.familyId };
}
