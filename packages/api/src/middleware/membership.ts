import { Request, Response, NextFunction } from 'express';

export function requireMembership(req: Request, res: Response, next: NextFunction): void {
  const familyId = Array.isArray(req.params.familyId) ? req.params.familyId[0] : req.params.familyId;
  if (!familyId) {
    res.status(400).json({ error: 'Family ID required' });
    return;
  }

  const user = req.user as unknown as { memberships?: { familyId: string; role: string; id: string }[] } | undefined;
  const membership = user?.memberships?.find(m => m.familyId === familyId);

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this family' });
    return;
  }

  (req as any).membership = membership;
  next();
}
