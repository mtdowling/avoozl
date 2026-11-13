import assert from "node:assert/strict";
import test from "node:test";
import { isSkillPath } from "../retro-memory.mjs";

test("skill paths match with either separator", () => {
  assert.ok(isSkillPath("/a/.kiro/skills/tests/SKILL.md"));
  assert.ok(isSkillPath("D:\\a\\.kiro\\skills\\tests\\SKILL.md"));
  assert.ok(isSkillPath("D:\\a\\skills\\review.md"));
  assert.ok(!isSkillPath("D:\\a\\notes\\review.md"));
});
