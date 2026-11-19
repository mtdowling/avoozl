// The operation list (operation-kinds.mjs), the handlers (operations.mjs and
// the files it hands names to) and the MCP policy (mcp-policy.mjs) name the
// same operations. A name listed with no handler answers "Unknown operation".
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { OPERATION_NAMES, classifyOperation } from "../operation-kinds.mjs";
import { NOT_ON_MCP, PERSON_ONLY } from "../mcp-policy.mjs";

const read = (name) =>
  fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const HANDLER_FILES = ["operations.mjs", "retro-operations.mjs"];
const handlerText = HANDLER_FILES.map(read).join("\n");
const listed = (name) => Boolean(classifyOperation(name));
const NAME = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;

test("every listed operation has a handler", () => {
  const missing = [...OPERATION_NAMES].filter(
    (name) => !handlerText.includes(`"${name}"`),
  );
  assert.deepEqual(missing, []);
});

test("every handler is listed", () => {
  const compared = new Set(
    [...handlerText.matchAll(/\bname === "([^"]+)"/g)]
      .map((match) => match[1])
      .filter((name) => NAME.test(name)),
  );
  const unlisted = [...compared].filter((name) => !listed(name));
  assert.deepEqual(unlisted, []);
});

test("the MCP policy names only listed operations", () => {
  const unlisted = [...PERSON_ONLY.keys(), ...NOT_ON_MCP.keys()].filter(
    (name) => !listed(name),
  );
  assert.deepEqual(unlisted, []);
});
