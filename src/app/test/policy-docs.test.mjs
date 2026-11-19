// Every example policy in docs/policies.md validates.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

test("every example policy in docs/policies.md validates", () => {
  const text = fs.readFileSync(
      new URL("../../../docs/policies.md", import.meta.url),
      "utf8",
    ),
    blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
      JSON.parse(m[1]),
    );
  assert.ok(blocks.length);
  for (const block of blocks) normalizeGitHubPolicy(block.github);
});
