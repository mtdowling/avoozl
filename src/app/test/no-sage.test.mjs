// The separate review app was dropped (2026-11-14): no tracked file may name it,
// except the historical records under docs/research and docs/evidence.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
// Built from parts so this file does not match itself.
const WORD = ["Sa", "ge"].join("");
const NAMES = new RegExp(
  `Code Review ${WORD}|code-review-${WORD.toLowerCase()}|${WORD.toLowerCase()}-review|learn-from-${WORD.toLowerCase()}|CODE_REVIEW_${WORD.toUpperCase()}`,
  "i",
);

test("no tracked file names the dropped review app outside docs/research and docs/evidence", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString()
    .split("\0")
    .filter(
      (file) =>
        file &&
        !file.startsWith("docs/research/") &&
        !file.startsWith("docs/evidence/") &&
        fs.existsSync(path.join(root, file)),
    );
  const hits = files.filter((file) => {
    const buffer = fs.readFileSync(path.join(root, file));
    return !buffer.includes(0) && NAMES.test(buffer.toString("utf8"));
  });
  assert.deepEqual(hits, []);
});

test("a saved key for the dropped review app is ignored, not a crash", async () => {
  const { readDeliveryPolicy } = await import("../tick.mjs");
  const { readGitHubPolicyOrNull } = await import("../github-policy.mjs");
  const { temporaryDirectory } = await import("./temporary.mjs");
  const key = `codeReview${WORD}`;
  for (const saved of [
    { [key]: { enabled: true } },
    { review: { [key]: true } },
  ]) {
    const root = temporaryDirectory();
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, ...saved }),
    );
    assert.equal(readDeliveryPolicy(root).status, "loaded");
    assert.equal(readGitHubPolicyOrNull(root).mode, null);
  }
});
