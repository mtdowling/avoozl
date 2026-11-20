// Lint every spec folder under .kiro/specs/ with the checks approval runs
// (lintSpec). Exits 1 when any folder has an error. CI runs it on every
// change, including docs-only ones that skip the full suite.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listSpecFolders,
  lintSpec,
  readSpecFolder,
} from "../../src/app/specs/spec-plans.mjs";
import { linkedReader } from "../../src/app/specs/order.mjs";

// The repository root, or the folder named as the first argument.
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = false;
const names = listSpecFolders(root);
if (!names.length) {
  console.log(`No spec folders under ${root}/.kiro/specs/.`);
  process.exit(1);
}
// A `Status:` line repeats approval, which lives in Avoozl's workspace
// database, and goes stale (shortcut: checked here, not in lintSpec, so
// specs in other repositories still work).
const STATUS =
  "A `Status:` line is not allowed: approval lives in Avoozl, not in the spec files. Delete this line.";
function statusErrors(spec) {
  return Object.entries(spec.files).flatMap(([file, text]) =>
    String(text)
      .split("\n")
      .flatMap((line, at) =>
        /^Status:/.test(line)
          ? [{ severity: "error", file, line: at + 1, message: STATUS }]
          : [],
      ),
  );
}
// A spec describes Avoozl as it is; git history keeps what changed. A task,
// requirement, criterion or section marked superseded or retired is old text
// left in place, so it is refused: a heading or task title that says so, or
// a line or criterion that starts with the word.
const RETIRED =
  "A task, requirement or section marked superseded or retired is not allowed: delete it. Git history keeps the old text.";
const RETIRED_WORD = /\b(?:superseded|retired)\b/i;
function retiredErrors(spec) {
  return Object.entries(spec.files).flatMap(([file, text]) =>
    String(text)
      .split("\n")
      .flatMap((line, at) => {
        const body = line.replace(
          /^\s*(?:[-*]|\d+[a-z]?\.)\s+(?:\$\w+:\s*)?/,
          "",
        );
        const marked =
          (/^#{1,6}\s/.test(line) && RETIRED_WORD.test(line)) ||
          (/^\s*- \[[ x]\]\s/.test(line) && RETIRED_WORD.test(line)) ||
          /^(?:\*\*)?(?:superseded|retired)\b/i.test(body);
        return marked
          ? [{ severity: "error", file, line: at + 1, message: RETIRED }]
          : [];
      }),
  );
}
// Every spec, so a spec group reaches into the spec it links.
const folders = new Map(
  names.map((name) => [name, readSpecFolder(root, name)]),
);
const linked = linkedReader(
  [...folders].map(([name, spec]) => ({
    name,
    text: spec.files?.["tasks.md"] ?? "",
  })),
);
for (const name of names) {
  const spec = { ...folders.get(name), linked },
    result = lintSpec({ spec }),
    status = [...statusErrors(spec), ...retiredErrors(spec)],
    errors = [
      ...(result.diagnostics || []).filter((d) => d.severity === "error"),
      ...status,
    ];
  result.counts.error += status.length;
  console.log(
    `${name}: ${result.counts.error} errors, ${result.counts.warning} warnings, ${result.taskCount} tasks`,
  );
  for (const d of errors)
    console.log(
      `  ${d.file ?? ""}:${d.line ?? d.lineStart ?? ""} ${d.message ?? d.text ?? JSON.stringify(d)}`,
    );
  if (result.counts.error) failed = true;
}
process.exit(failed ? 1 : 0);
