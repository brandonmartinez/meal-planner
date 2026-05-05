import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import { requireMembership } from '../middleware/membership.js';
import * as familyService from '../services/family.js';
import * as apiKeyService from '../services/apiKey.js';

export const familyRouter = Router();

interface AuthUser {
  id: string;
  memberships?: { familyId: string; role: string }[];
}

const createFamilySchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteSchema = z.object({
  role: z.enum(['PARENT', 'CHILD']),
});

const joinSchema = z.object({
  token: z.string().min(1),
});

const updateRoleSchema = z.object({
  role: z.enum(['PARENT', 'CHILD']),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || '';
}

// Create family
familyRouter.post('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { name } = createFamilySchema.parse(req.body);
    const user = req.user as unknown as AuthUser;
    const family = await familyService.createFamily(user.id, name);
    res.status(201).json(family);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create family' });
  }
});

// List user's families
familyRouter.get('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const user = req.user as unknown as AuthUser;
    const families = await familyService.getUserFamilies(user.id);
    res.json(families);
  } catch {
    res.status(500).json({ error: 'Failed to fetch families' });
  }
});

// Get family details
familyRouter.get('/:familyId', authenticateJWT, requireMembership, async (req: Request, res: Response) => {
  try {
    const family = await familyService.getFamilyById(paramStr(req.params.familyId));
    if (!family) {
      res.status(404).json({ error: 'Family not found' });
      return;
    }
    res.json(family);
  } catch {
    res.status(500).json({ error: 'Failed to fetch family' });
  }
});

// List members
familyRouter.get('/:familyId/members', authenticateJWT, requireMembership, async (req: Request, res: Response) => {
  try {
    const members = await familyService.getMembers(paramStr(req.params.familyId));
    res.json(members);
  } catch {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Generate invite
familyRouter.post('/:familyId/invite', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const { role } = inviteSchema.parse(req.body);
    const token = familyService.generateInviteToken(paramStr(req.params.familyId), role);
    res.json({ token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to generate invite' });
  }
});

// Join family via invite token
familyRouter.post('/:familyId/join', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { token } = joinSchema.parse(req.body);
    const user = req.user as unknown as AuthUser;
    const membership = await familyService.joinFamily(user.id, token);
    res.status(201).json(membership);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to join family' });
  }
});

// Update member role
familyRouter.patch('/:familyId/members/:memberId', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const { role } = updateRoleSchema.parse(req.body);
    const member = await familyService.updateMemberRole(paramStr(req.params.familyId), paramStr(req.params.memberId), role);
    res.json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Remove member
familyRouter.delete('/:familyId/members/:memberId', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    await familyService.removeMember(paramStr(req.params.familyId), paramStr(req.params.memberId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Create API key
familyRouter.post('/:familyId/api-keys', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const { name } = createApiKeySchema.parse(req.body);
    const user = req.user as unknown as AuthUser;
    const key = await apiKeyService.createApiKey(paramStr(req.params.familyId), user.id, name);
    res.status(201).json(key);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// List API keys
familyRouter.get('/:familyId/api-keys', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const keys = await apiKeyService.listApiKeys(paramStr(req.params.familyId));
    res.json(keys);
  } catch {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Revoke API key
familyRouter.delete('/:familyId/api-keys/:keyId', authenticateJWT, requireMembership, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    await apiKeyService.revokeApiKey(paramStr(req.params.keyId), paramStr(req.params.familyId));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});
