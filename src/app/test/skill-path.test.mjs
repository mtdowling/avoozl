// A loaded skill's path reads the same with either separator, so a session
// on Windows can report the skills it used (P42).
import assert from "node:assert/strict";
import test from "node:test";
import { isSkillPath } from "../retro-memory.mjs";

test("skill paths match with / or \\ separators", () => {
  for (const file of [
    "/w/plugins/p1/skills/review/SKILL.md",
    "/w/repo/.kiro/skills/tests.md",
    "C:\\w\\plugins\\p1\\skills\\review\\SKILL.md",
    "C:\\w\\repo\\.kiro\\skills\\tests.md",
  ])
    assert.equal(isSkillPath(file), true, file);
  for (const file of [
    "/w/notes.md",
    "C:\\w\\skills\\a\\b.txt",
    "C:\\w\\README.md",
  ])
    assert.equal(isSkillPath(file), false, file);
});
