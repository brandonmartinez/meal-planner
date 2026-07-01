import { Router, Request, Response } from "express";
import passport from "../config/passport.js";
import { generateToken } from "../utils/jwt.js";
import { authenticateJWT } from "../middleware/auth.js";
import { config } from "../config/index.js";
import prisma from "../config/database.js";
import { DEMO_USER } from "../config/demo.js";

export const authRouter = Router();

/** How long an auth cookie lives (7 days), shared by every login path. */
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE_MS,
  });
}

// Capability probe for the web login page: tells the client which sign-in
// options to render. Safe to expose — it reveals only feature flags, no secrets.
authRouter.get("/config", (_req: Request, res: Response) => {
  res.json({
    devLoginEnabled: config.devLogin.enabled,
    googleEnabled: Boolean(
      config.google.clientId && config.google.clientSecret,
    ),
  });
});


authRouter.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string; email: string; name: string };
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    setAuthCookie(res, token);

    res.redirect(config.clientUrl);
  },
);

// Pass-through dev login — authenticates as the fixed demo user with no Google
// round-trip. Hard-gated to non-production via `config.devLogin.enabled`; when
// disabled the route reports 404 so production never advertises it exists. The
// demo user is find-or-created here so dev-login works even before the seed has
// run (it converges on the same identity the seed uses — see config/demo.ts).
authRouter.post("/dev-login", async (_req: Request, res: Response) => {
  if (!config.devLogin.enabled) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    update: {},
    create: { email: DEMO_USER.email, name: DEMO_USER.name },
    select: { id: true, email: true, name: true },
  });

  const token = generateToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  setAuthCookie(res, token);

  res.json({ id: user.id, email: user.email, name: user.name });
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

authRouter.get("/me", authenticateJWT, async (req: Request, res: Response) => {
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
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: userWithMemberships.id,
    email: userWithMemberships.email,
    name: userWithMemberships.name,
    avatarUrl: userWithMemberships.avatarUrl,
    memberships: userWithMemberships.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      familyId: m.familyId,
      userId: m.userId,
      family: m.family,
    })),
  });
});
