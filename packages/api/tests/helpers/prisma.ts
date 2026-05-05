import { beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Shared deep mock of the Prisma client. Each test file mocks
// `../config/database.js` to return this instance via:
//
//   vi.mock('../config/database.js', () => ({ default: prismaMock }));
//
// The relative path resolves to the same absolute module from any service
// or middleware test file (they all live one level below `src/`), so the
// mock is applied uniformly.
export const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prismaMock);
});
