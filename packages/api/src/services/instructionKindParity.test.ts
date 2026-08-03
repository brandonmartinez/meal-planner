import { describe, it, expect } from "vitest";
import { InstructionKind as PrismaInstructionKind } from "@prisma/client";
import { INSTRUCTION_KINDS } from "@meal-planner/shared";

/**
 * Cross-package drift guard (Yen, Grid verification). Saul authored the Prisma
 * `InstructionKind` enum (`SETUP | PROCESS | FINISH`) in the schema; Livingston
 * authored the shared `INSTRUCTION_KINDS` constant that both the API read path
 * and the web renderer type against. They were written in parallel against a
 * pinned contract — a byte-level divergence here (a renamed member, a new value,
 * a casing change) would be SILENT: TypeScript compiles because shared derives
 * its own union, and the API happily serializes a `kind` the web never expects.
 *
 * This test binds the two so any future edit to one side without the other goes
 * red. `@prisma/client` is NOT module-mocked (only the client instance is), so
 * this reads the real generated enum.
 */
describe("InstructionKind parity (Prisma enum ↔ shared INSTRUCTION_KINDS)", () => {
  it("shared INSTRUCTION_KINDS lists exactly the Prisma enum members", () => {
    const prismaValues = Object.values(PrismaInstructionKind).sort();
    const sharedValues = [...INSTRUCTION_KINDS].sort();
    expect(sharedValues).toEqual(prismaValues);
  });

  it("every Prisma enum key maps to an identically-named value (no aliasing)", () => {
    for (const [key, value] of Object.entries(PrismaInstructionKind)) {
      expect(value).toBe(key);
    }
  });

  it("pins the canonical members so a rename on either side fails loudly", () => {
    expect([...INSTRUCTION_KINDS]).toEqual(["SETUP", "PROCESS", "FINISH"]);
  });
});
