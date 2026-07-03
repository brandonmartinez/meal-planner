/**
 * CLI entry for the #106 orphan-image cleanup.
 *
 * Thin wrapper over `services/imageCleanup.ts`. Reads the storage root from
 * `config.imageStorage.root`, runs the scan/plan, prints a human (or `--json`)
 * report, and disconnects Prisma. DEFAULTS TO DRY-RUN — deletions require an
 * explicit `--apply`, and row deletion additionally requires `--delete-rows`.
 *
 * Usage:
 *   pnpm --filter @meal-planner/api run images:cleanup            # dry-run
 *   pnpm --filter @meal-planner/api run images:cleanup -- --apply # delete orphan files
 *   pnpm --filter @meal-planner/api run images:cleanup -- --apply --delete-rows
 *   pnpm --filter @meal-planner/api run images:cleanup -- --json  # machine-readable
 *
 * In production run the compiled build: `node dist/scripts/imageCleanup.js`.
 */

import { config } from "../config/index.js";
import prisma from "../config/database.js";
import { runCleanup, type CleanupResult } from "../services/imageCleanup.js";

interface CliFlags {
  apply: boolean;
  deleteRows: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { apply: false, deleteRows: false, json: false };
  for (const arg of argv) {
    switch (arg) {
      case "--apply":
        flags.apply = true;
        break;
      case "--delete-rows":
        flags.deleteRows = true;
        break;
      case "--json":
        flags.json = true;
        break;
      default:
        throw new Error(
          `Unknown argument: ${arg}. Supported: --apply, --delete-rows, --json.`,
        );
    }
  }
  return flags;
}

function printHumanReport(result: CleanupResult, flags: CliFlags): void {
  const mode = result.applied ? "APPLY" : "DRY-RUN";
  console.log(`Image cleanup — ${mode}`);
  console.log(`  storage root scanned:   ${config.imageStorage.root}`);
  if (result.rootMissing) {
    console.log("  (storage root does not exist yet — nothing to scan)");
  }
  console.log(`  files on disk:          ${result.scannedFileCount}`);
  console.log(`  live asset rows:        ${result.liveAssetCount}`);
  console.log(`  orphaned files:         ${result.orphanedFiles.length}`);
  console.log(`  missing files (rows):   ${result.missingFiles.length}`);
  console.log(`  unrecognized entries:   ${result.unrecognized.length}`);

  if (result.orphanedFiles.length > 0) {
    const verb = result.applied ? "deleted" : "would delete";
    console.log(`\nOrphaned files (${verb}):`);
    for (const f of result.orphanedFiles) {
      console.log(`  - ${f.relPath}`);
    }
  }

  if (result.missingFiles.length > 0) {
    const verb =
      result.applied && result.deleteRowsRequested
        ? "row deleted"
        : "row retained";
    console.log(`\nMissing files — dangling rows (${verb}):`);
    for (const m of result.missingFiles) {
      console.log(`  - ${m.relPath}`);
    }
    if (!result.deleteRowsRequested) {
      console.log("  (pass --apply --delete-rows to remove these rows)");
    }
  }

  if (result.unrecognized.length > 0) {
    console.log("\nUnrecognized entries (never deleted — review manually):");
    for (const u of result.unrecognized) {
      console.log(`  - ${u.relPath} — ${u.reason}`);
    }
  }

  if (!result.applied) {
    console.log(
      "\nDry-run: nothing was deleted. Re-run with --apply to delete orphaned files.",
    );
  }
  // Flag a no-op --delete-rows so an operator isn't surprised nothing happened.
  if (flags.deleteRows && !flags.apply) {
    console.log(
      "\nNote: --delete-rows has no effect without --apply (still a dry-run).",
    );
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const result = await runCleanup({
    root: config.imageStorage.root,
    prisma,
    apply: flags.apply,
    deleteRows: flags.deleteRows,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReport(result, flags);
  }
}

main()
  .catch((e) => {
    console.error("Image cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
