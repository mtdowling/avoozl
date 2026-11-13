// The avoozl-plugin and avoozl-rules skills behind Design a plugin and
// Design a rule set: each lists what the code accepts, computed from the
// code, and stays public.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { KINDS, PARTS } from "../plugins.mjs";
import { SUPPORTED_CONTRACTS } from "../plugin-contract.mjs";
import { ACTIONS, BOUNDARIES, BUILTIN_SETS } from "../content-rules.mjs";
import { RULES, scanText } from "../../../scripts/release-scan.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const skill = (name) =>
  fs.readFileSync(
    path.join(root, "kirocrew-app", "skills", name, "SKILL.md"),
    "utf8",
  );
const section = (text, heading) => {
  const start = text.indexOf(`## ${heading}\n`);
  assert.notEqual(start, -1, heading);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};
// The first backticked cell of each table row in a section, header excluded.
const firstColumn = (text) =>
  [...text.matchAll(/^\|[^|\n]*?\|\s*`([^`]+)`\s*\|$|^\|\s*`([^`]+)`\s*\|/gm)]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
const lastColumn = (text) =>
  [...text.matchAll(/^\|.*\|\s*`([a-z]+)`\s*\|$/gm)].map((m) => m[1]);

test("avoozl-plugin lists the parts, kinds and contract versions the loader accepts", () => {
  const text = skill("avoozl-plugin");
  assert.deepEqual(
    lastColumn(section(text, "Pick the parts")).sort(),
    [...PARTS].sort(),
  );
  const kinds = /The code kinds are (.+?)\./.exec(text)[1];
  assert.deepEqual(
    [...kinds.matchAll(/`([a-z]+)`/g)].map((m) => m[1]).sort(),
    [...KINDS].sort(),
  );
  const contracts = /supports contract version (.+?)\./.exec(text)[1];
  assert.deepEqual(
    [...contracts.matchAll(/`(\d+)`/g)].map((m) => Number(m[1])),
    SUPPORTED_CONTRACTS,
  );
  // Each source the entry validator takes, and both places it applies.
  const sources = section(text, "Where it comes from");
  for (const key of ["path", "package", "git"])
    assert.match(sources, new RegExp(`\\| \`${key}\``), key);
  assert.match(text, /\*\*This computer only\*\*/);
  assert.match(text, /\*\*Shared with the repo\*\*/);
  assert.match(text, /pluginHost\(\.\.\.\)\.open\(\)/);
  assert.match(section(text, "Approval"), /exact version.*content hash/s);
});

test("avoozl-rules lists the boundaries, actions and built-in sets the matcher has", () => {
  const text = skill("avoozl-rules");
  assert.deepEqual(
    firstColumn(section(text, "Where rules check")).sort(),
    [...BOUNDARIES].sort(),
  );
  const actions = section(text, "Block or report");
  assert.deepEqual(
    [...actions.matchAll(/^- `([a-z]+)`/gm)].map((m) => m[1]).sort(),
    [...ACTIONS].sort(),
  );
  const builtins = section(text, "Built-in sets");
  assert.deepEqual(
    [...builtins.matchAll(/`(builtin:[a-z-]+)`/g)].map((m) => m[1]).sort(),
    BUILTIN_SETS.map((s) => s.id).sort(),
  );
  const format = section(text, "The terms line format");
  for (const line of [
    "`rule: regex`",
    "`allow: regex`",
    "`allow <rule>: regex`",
  ])
    assert.ok(format.includes(line), line);
  assert.match(format, /Case is ignored/);
  const chat = section(text, "Rules for this chat");
  assert.match(chat, /\*\*Never write the terms file\.\*\*/);
  assert.match(chat, /stay in this chat's transcript/);
  assert.match(text, /\*\*Allow once\*\*/);
  assert.match(text, /\*\*Try it\*\*/);
});

// Private names come from the release scan's local terms file, never from
// this test; the public rules catch secrets and machine paths.
test("the design skills pass the release scan", () => {
  for (const name of ["avoozl-plugin", "avoozl-rules", "avoozl-costs"])
    assert.deepEqual(scanText(skill(name), RULES), [], name);
});
