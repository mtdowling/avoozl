import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGitHubPolicy, readGitHubPolicy } from "../github-policy.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// R91.6: Who codes was removed. An old file's `coder` loads, is ignored and
// says nothing.
test("an old coder setting loads silently and changes nothing", (t) => {
  const warned = [];
  t.mock.method(console, "warn", (...args) => warned.push(args));
  for (const coder of ["issue-radar", "worker", "remote", "", 7]) {
    const root = temporaryDirectory();
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({
        version: 1,
        github: {
          mode: "single-repo",
          repositories: { "example/app": { baseBranch: "main", coder } },
        },
      }),
    );
    const policy = readGitHubPolicy(root),
      entry = policy.repositories["example/app"];
    assert.equal("coder" in entry, false, String(coder));
    assert.deepEqual(
      entry,
      normalizeGitHubPolicy({
        mode: "single-repo",
        repositories: { "example/app": { baseBranch: "main" } },
      }).repositories["example/app"],
    );
  }
  assert.deepEqual(warned, []);
});
