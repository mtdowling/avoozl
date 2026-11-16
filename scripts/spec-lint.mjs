// Lint every spec folder under .kiro/specs/ with the checks approval runs
// (lintSpec). Exits 1 when any folder has an error. CI runs it on every
// change, including docs-only ones that skip the full suite.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listSpecFolders,
  lintSpec,
  readSpecFolder,
} from "../src/app/spec-plans.mjs";

// The repository root, or the folder named as the first argument.
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
const names = listSpecFolders(root);
if (!names.length) {
  console.log(`No spec folders under ${root}/.kiro/specs/.`);
  process.exit(1);
}
for (const name of names) {
  const result = lintSpec({ spec: readSpecFolder(root, name) }),
    errors = (result.diagnostics || []).filter((d) => d.severity === "error");
  console.log(
    `${name}: ${result.counts.error} errors, ${result.counts.warning} warnings, ${result.taskCount} tasks`,
  );
  for (const d of errors)
    console.log(
      `  ${d.file ?? ""}:${d.line ?? ""} ${d.message ?? d.text ?? JSON.stringify(d)}`,
    );
  if (result.counts.error) failed = true;
}
process.exit(failed ? 1 : 0);
