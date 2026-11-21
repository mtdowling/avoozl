// Every git push in the app source names one explicit refspec.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("no git push in the app source uses --mirror, --all, --tags or a wildcard", () => {
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  const found = [];
  for (const entry of fs
    .readdirSync(dir, { recursive: true })
    .filter(
      (n) => /\.(mjs|ts)$/.test(n) && !n.split(path.sep).includes("test"),
    )) {
    const file = path.basename(entry);
    if (file === "cli.mjs") continue; // the word there is an option name
    const text = fs.readFileSync(path.join(dir, entry), "utf8");
    for (const match of text.matchAll(/\[\s*"push",([\s\S]{0,200}?)\]/g)) {
      const call = match[1];
      found.push(file);
      assert.doesNotMatch(call, /--mirror|--all|--tags|--follow-tags|\*/, file);
      assert.match(call, /:/, `${file} names one explicit refspec`);
    }
  }
  assert.ok(found.includes("workspace-repository.mjs"), found.join());
});
