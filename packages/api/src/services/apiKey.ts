import crypto from 'crypto';
import prisma from '../config/database.js';
import { hashCredential, legacyHashCredential } from '../utils/credentialHash.js';

function hashKey(raw: string): string {
  return hashCredential(raw);
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

/**
 * Resolves a display API key record by its raw key, transparently migrating a
 * legacy (pre-pepper) SHA-256 row to the peppered HMAC hash on hit (lazy
 * upgrade). Shared by `validateApiKey` and the `authenticateApiKey` middleware
 * so both verification paths agree on the exact same hashing + migration
 * behaviour.
 *
 * Returns the record (with its `key` already reflecting the rehashed value when
 * a legacy row was migrated) or null when no key matches. Deliberately does NOT
 * check expiry or bump `lastUsed` — each caller owns those decisions.
 */
export async function findApiKeyByRawKey(rawKey: string) {
  const hashedKey = hashKey(rawKey);
  const record = await prisma.apiKey.findUnique({
    where: { key: hashedKey },
  });
  if (record) {
    return record;
  }

  // Legacy fallback: a pre-pepper row is keyed by unpeppered SHA-256.
  const legacyKey = legacyHashCredential(rawKey);
  const legacyRecord = await prisma.apiKey.findUnique({
    where: { key: legacyKey },
  });
  if (!legacyRecord) {
    return null;
  }

  // Lazy upgrade: persist the peppered hash so future lookups hit directly.
  await prisma.apiKey.update({
    where: { id: legacyRecord.id },
    data: { key: hashedKey },
  });
  return { ...legacyRecord, key: hashedKey };
}

export async function validateApiKey(rawKey: string) {
  const record = await findApiKeyByRawKey(rawKey);

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
