import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import prisma from '../config/database.js';
import crypto from 'crypto';
import { isDisplayRequest, sendDisplayError } from '../utils/displayError.js';

export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: {
        memberships: {
          include: { family: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(role: 'PARENT' | 'CHILD') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const familyId = req.params.familyId || req.familyId;
    if (!familyId) {
      res.status(400).json({ error: 'Family ID required' });
      return;
    }

    const user = req.user as { memberships?: { familyId: string; role: string }[] } | undefined;
    const membership = user?.memberships?.find(m => m.familyId === familyId);
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this family' });
      return;
    }

    if (role === 'PARENT' && membership.role !== 'PARENT') {
      res.status(403).json({ error: 'Parent role required' });
      return;
    }

    next();
  };
}

export async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const useDisplayEnvelope = isDisplayRequest(req.originalUrl);

  if (!apiKey) {
    if (useDisplayEnvelope) {
      sendDisplayError(res, 401, 'MISSING_API_KEY', 'API key required');
    } else {
      res.status(401).json({ error: 'API key required' });
    }
    return;
  }

  try {
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
    });

    if (!keyRecord) {
      if (useDisplayEnvelope) {
        sendDisplayError(res, 401, 'INVALID_API_KEY', 'Invalid API key');
      } else {
        res.status(401).json({ error: 'Invalid API key' });
      }
      return;
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      if (useDisplayEnvelope) {
        sendDisplayError(res, 401, 'INVALID_API_KEY', 'API key expired');
      } else {
        res.status(401).json({ error: 'API key expired' });
      }
      return;
    }

    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsed: new Date() },
    });

    req.familyId = keyRecord.familyId;
    next();
  } catch {
    if (useDisplayEnvelope) {
      sendDisplayError(res, 500, 'INTERNAL_ERROR', 'API key verification failed');
    } else {
      res.status(500).json({ error: 'API key verification failed' });
    }
  }
}
