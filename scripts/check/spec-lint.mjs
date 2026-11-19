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
// specs in other repositories and approval pull requests on protected
// branches still work).
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
for (const name of names) {
  const spec = readSpecFolder(root, name),
    result = lintSpec({ spec }),
    status = statusErrors(spec),
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
