import { vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

export interface MockResponse extends Response {
  statusCode: number;
  body: unknown;
}

export function buildReq(overrides: Partial<Request> = {}): Request {
  const req = {
    headers: {},
    cookies: {},
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
  return req;
}

export function buildRes(): MockResponse {
  const res: Partial<MockResponse> = {
    statusCode: 200,
    body: undefined,
  };
  res.status = vi.fn((code: number) => {
    (res as MockResponse).statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = vi.fn((body: unknown) => {
    (res as MockResponse).body = body;
    return res as Response;
  }) as unknown as Response["json"];
  return res as MockResponse;
}

export function buildNext(): NextFunction & { mock: ReturnType<typeof vi.fn> } {
  const fn = vi.fn();
  return fn as unknown as NextFunction & { mock: ReturnType<typeof vi.fn> };
}
