import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { generateToken } from '../utils/jwt.js';
import { authenticateJWT } from '../middleware/auth.js';
import { config } from '../config/index.js';
import prisma from '../config/database.js';

export const authRouter = Router();

authRouter.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

authRouter.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string; email: string; name: string };
    const token = generateToken({ id: user.id, email: user.email, name: user.name });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(config.clientUrl);
  },
);

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

authRouter.get('/me', authenticateJWT, async (req: Request, res: Response) => {
  const user = req.user as unknown as { id: string };
  const userWithMemberships = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      memberships: {
        include: { family: { select: { id: true, name: true } } },
      },
    },
  });

  if (!userWithMemberships) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: userWithMemberships.id,
    email: userWithMemberships.email,
    name: userWithMemberships.name,
    avatarUrl: userWithMemberships.avatarUrl,
    memberships: userWithMemberships.memberships.map(m => ({
      id: m.id,
      role: m.role,
      familyId: m.familyId,
      userId: m.userId,
      family: m.family,
    })),
  });
});
