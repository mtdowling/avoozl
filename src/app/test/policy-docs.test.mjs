// Every example policy in the docs validates.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github/github-policy.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const docs = new URL("../../../docs/", import.meta.url);

test("every example policy in the docs validates", () => {
  const policies = fs
    .readdirSync(docs)
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) =>
      [
        ...fs
          .readFileSync(new URL(name, docs), "utf8")
          .matchAll(/```json[^\n]*\n([\s\S]*?)```/g),
      ].map((m) => JSON.parse(m[1])),
    )
    .filter((block) => block.github);
  assert.ok(policies.length);
  for (const block of policies) normalizeGitHubPolicy(block.github);
});
