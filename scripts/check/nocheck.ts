#!/usr/bin/env node
// Counts the files that turn type checking off with a line-start
// `// @ts-nocheck` mark, and holds the count to
// scripts/check/nocheck-baseline.json, which only goes down.
//
//   node scripts/check/nocheck.ts            fails when the count is not the
//                                            baseline's
//   node scripts/check/nocheck.ts --update   lowers the baseline to the
//                                            current count (never raises it)
//
// A change that types a file removes its mark and lowers the baseline in the
// same commit. A change that adds a mark fails.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const BASELINE = "scripts/check/nocheck-baseline.json";
const MARK = "^// @ts-nocheck";

// Every tracked file with a mark, sorted.
export function markedFiles(cwd = process.cwd()): string[] {
  try {
    return execFileSync("git", ["grep", "-l", "-E", MARK], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean)
      .sort();
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

// What the check says about `count` against the saved `baseline`: null when
// they match, else the reason it fails.
export function problem(count: number, baseline: number | null) {
  if (baseline === null)
    return `No ${BASELINE}; run \`npm run nocheck -- --update\` to make it.`;
  if (count > baseline)
    return `${count - baseline} more file(s) turn type checking off than ${BASELINE} allows. Type the file instead of adding // @ts-nocheck.`;
  if (count < baseline)
    return `The count fell from ${baseline} to ${count}; run \`npm run nocheck -- --update\` and commit the lower baseline.`;
  return null;
}

function readBaseline(): number | null {
  try {
    return JSON.parse(fs.readFileSync(BASELINE, "utf8")).files;
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = markedFiles().length,
    baseline = readBaseline();
  console.log(`Files with // @ts-nocheck: ${count} (baseline ${baseline}).`);
  if (
    process.argv.includes("--update") &&
    (baseline === null || count < baseline)
  ) {
    fs.writeFileSync(
      BASELINE,
      JSON.stringify({ files: count }, null, 2) + "\n",
    );
    console.log(`Wrote ${BASELINE}.`);
  } else {
    const reason = problem(count, baseline);
    if (reason) {
      console.error(reason);
      process.exitCode = 1;
    }
  }
}
