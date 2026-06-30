import { vi } from "vitest";
import type { Request, Response, NextFunction, Router } from "express";
import { buildRes, type MockResponse } from "./express.js";

export type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: RouteHandler }[];
  };
}

/**
 * Pull the final handler for a given METHOD + path out of an Express router's
 * layer stack, bypassing the auth/membership/role middleware composed ahead of
 * it. This lets route-handler tests call the handler directly with a mocked
 * req/res, isolating Zod validation + status-code translation from the
 * middleware chain (the chain itself is covered by the middleware tests).
 */
export function getRouteHandler(
  router: Router,
  method: string,
  path: string,
): RouteHandler {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find(
    (l) =>
      l.route?.path === path && l.route.methods[method.toLowerCase()] === true,
  );
  if (!layer?.route) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle;
}

export interface FullMockResponse extends MockResponse {
  redirectedTo?: string;
  cookies: Record<string, unknown>;
  clearedCookies: string[];
}

/**
 * buildRes() augmented with the response methods some handlers reach for beyond
 * status/json: send (204 No Content), cookie/clearCookie/redirect (auth), and
 * setHeader/end. Keeps the route-test files free of per-file res plumbing.
 */
export function buildFullRes(): FullMockResponse {
  const res = buildRes() as FullMockResponse;
  res.cookies = {};
  res.clearedCookies = [];
  res.send = vi.fn((body?: unknown) => {
    if (body !== undefined) (res as MockResponse).body = body;
    return res;
  }) as unknown as Response["send"];
  res.cookie = vi.fn((name: string, value: unknown) => {
    res.cookies[name] = value;
    return res;
  }) as unknown as Response["cookie"];
  res.clearCookie = vi.fn((name: string) => {
    res.clearedCookies.push(name);
    return res;
  }) as unknown as Response["clearCookie"];
  res.redirect = vi.fn((url: string) => {
    res.redirectedTo = url;
  }) as unknown as Response["redirect"];
  res.setHeader = vi.fn(() => res) as unknown as Response["setHeader"];
  res.end = vi.fn(() => res) as unknown as Response["end"];
  return res;
}
