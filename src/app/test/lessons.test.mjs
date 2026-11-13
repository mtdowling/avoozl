// Tasks 28.5-28.7: the lessons store on this machine (R69, R70). Only a
// temporary settings folder; the lessons file is never in a repository.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  Lessons,
  editLesson,
  healLessons,
  lessonTextProblem,
  lessonsForBrief,
  lessonsPath,
  setOutcome,
  writeLesson,
} from "../lessons.mjs";
import { steeringStatus, writeSteering } from "../spec-steering.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const DAY = 24 * 3600_000;
const store = () =>
  new Lessons(lessonsPath(temporaryDirectory("avoozl-lessons-")));
const write = (lessons, extra = {}) =>
  writeLesson(lessons, {
    pattern: {
      stage: "queued",
      check: "test",
      tool: "npm",
      traits: ["lang:javascript"],
    },
    finding: "Small tasks finish sooner in a batch.",
    change: {
      type: "settings",
      key: "flow.batch.max",
      to: 5,
      summary: "Larger batches",
    },
    evidence: { tasks: 10, metric: "lead time", before: 60, after: null },
    context: {
      models: ["m1"],
      checks: ["npm test"],
      tools: ["npm"],
      traits: ["lang:javascript"],
    },
    source: "w1",
    by: "dashboard",
    now: Date.parse("2026-11-01T00:00:00Z"),
    ...extra,
  }).lesson;

test("lesson text is summaries only: no path, URL, number, task or repository name, at most 300", () => {
  for (const [text, reason] of [
    ["Edit src/app/flow.mjs first.", /file path/],
    ["See https://example.com", /URL/],
    ["As in #12.", /number/],
    ["Like task a1 did.", /task ID or repository/],
    ["x".repeat(301), /300/],
  ])
    assert.match(
      lessonTextProblem(text, { known: ["a1", "app"] }),
      reason,
      text,
    );
  assert.equal(lessonTextProblem("Batch small tasks in one epic."), null);
});

test("an untested lesson expires; undone and retired ones are 'did not work'; nothing is deleted", () => {
  const lessons = store(),
    a = write(lessons),
    b = write(lessons, { finding: "Fewer reviews at once shorten the queue." }),
    now = Date.parse("2026-11-02T00:00:00Z");
  assert.ok(fs.existsSync(lessons.file));
  const brief = (at) =>
    lessonsForBrief(lessons, {
      workspaceId: "w2",
      traits: ["lang:javascript"],
      stage: "queued",
      now: at,
    });
  assert.deepEqual(
    brief(now)
      .lessons.map((l) => l.id)
      .sort(),
    [a.id, b.id].sort(),
  );
  assert.deepEqual(
    brief(now + 91 * DAY).didNotWork.map((l) => l.why),
    ["expired untested", "expired untested"],
  );
  setOutcome(lessons, a.id, "undone", { now });
  editLesson(
    lessons,
    { kind: "retire", lessons: [b.id], reason: "no longer true" },
    { by: "dashboard", now },
  );
  assert.deepEqual(brief(now).lessons, []);
  assert.deepEqual(
    brief(now)
      .didNotWork.map((l) => l.why)
      .sort(),
    ["retired", "undone"],
  );
  assert.equal(lessons.list().length, 2, "no lesson is deleted");
  // Another workspace that turned reading off sees only its own.
  assert.deepEqual(
    lessonsForBrief(lessons, { workspaceId: "w2", read: false, now })
      .didNotWork,
    [],
  );
  // A shared-off lesson is read only by its own workspace.
  const own = write(lessons, {
    finding: "Own lesson stays here.",
    shared: false,
  });
  assert.equal(
    lessonsForBrief(lessons, { workspaceId: "w1", stage: "queued", now })
      .lessons[0].id,
    own.id,
  );
  assert.deepEqual(
    lessonsForBrief(lessons, { workspaceId: "w2", stage: "queued", now })
      .lessons,
    [],
  );
  lessons.close();
});

test("drift marks set and clear by themselves and are recorded", () => {
  const lessons = store(),
    a = write(lessons),
    env = {
      workspaceId: "w1",
      models: ["m1"],
      versions: {},
      checks: ["npm test"],
      tools: ["npm"],
      traits: ["lang:javascript"],
    };
  healLessons(lessons, { ...env, traits: ["lang:rust"] });
  assert.equal(lessons.get(a.id).state, "needs re-check");
  healLessons(lessons, env);
  const back = lessons.get(a.id);
  assert.equal(back.state, "ok", "the mark clears when its cause does");
  assert.deepEqual(
    back.history.map((h) => h.what),
    ["written", "marked", "cleared"],
  );
  lessons.close();
});

test("New plan offers the steering file again over an older Avoozl text, never over a changed copy", () => {
  const root = temporaryDirectory("avoozl-steering-"),
    file = path.join(root, ".kiro", "steering", "avoozl-specs.md"),
    options = { text: "new rules\n", older: ["old rules\n"] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "old rules\n");
  assert.equal(steeringStatus(root, options).state, "older");
  assert.equal(writeSteering(root, options).state, "current");
  assert.equal(fs.readFileSync(file, "utf8"), "new rules\n");
  fs.writeFileSync(file, "my rules\n");
  assert.equal(writeSteering(root, options).state, "changed");
  assert.equal(fs.readFileSync(file, "utf8"), "my rules\n");
});
