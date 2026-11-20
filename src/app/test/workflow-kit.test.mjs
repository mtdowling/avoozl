// Runs the workflow kit (`workflow-kit/`) against Avoozl. Each case lists the
// probes a runner answers (`violations`, `ready`, `claim`, `landing`). A probe
// Avoozl does not pass yet carries `expectFail` with the simplify task that
// makes it pass; the case fails when that task is ticked or the probe passes,
// so the mark is removed when the task lands.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { judge, readCases } from "../../../workflow-kit/load.mjs";
import { lintSpec, parseSpec, specHash } from "../specs/spec-plans.mjs";
import { unblockCounts } from "../specs/release-ranking.mjs";
import { claimFirst, resumeClaim } from "../workers/claims.mjs";
import { linkedReader } from "../specs/order.mjs";
import { catchUp, integrationBase } from "../specs/integration-base.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => fs.readFileSync(root + file, "utf8");

// The rule number in docs/github-workflow.md that each lint code enforces.
// A code with no entry is reported as itself, so the case shows it.
const RULE = {
  "task.duplicate-id": "2.2",
  "task.repeated-id": "2.2",
  "facts.removed-key": "2.3",
  "done.missing": "2.4",
  "group.bullets": "2.5",
  "group.box": "3.2",
  "parallel.size": "3.5",
  "parallel.leaf": "3.5",
  "parallel.tag": "3.5",
  "manual.tag": "4.2",
  "manual.group": "4.2",
  "frontmatter.removed-key": "5.1",
  "frontmatter.repo": "5.3",
  "link.missing": "6.4",
  "link.twice": "6.4",
  "link.children": "6.4",
};

const specsOf = (files) => {
  const specs = {};
  for (const [file, text] of Object.entries(files)) {
    const match = /^\.kiro\/specs\/([^/]+)\/(.+)$/.exec(file);
    if (match) (specs[match[1]] ??= {})[match[2]] = text;
  }
  return specs;
};

// Every spec of a case, so a spec group reaches into the spec it links.
const linkedOf = (specs) =>
  linkedReader(
    Object.entries(specs).map(([name, files]) => ({
      name,
      text: files["tasks.md"] ?? "",
    })),
  );

function violations(specs) {
  const out = {},
    linked = linkedOf(specs);
  for (const [name, files] of Object.entries(specs)) {
    const { diagnostics } = lintSpec({
      spec: { name, exists: true, files, linked },
    });
    out[name] = [
      ...new Set(
        diagnostics
          .filter((item) => item.severity === "error")
          .map((item) => RULE[item.code] ?? item.code),
      ),
    ].sort();
  }
  return out;
}

// Rule 7.3: a spec is approved when its current text equals the text the
// latest approval left. An approval is a commit by an approver that adds a spec
// or changes its text; `specHash` hashes the text without checkbox marks, so a
// tick changes nothing. A case with no history has every spec approved.
function approved(testCase, specs) {
  if (!testCase.history)
    return Object.fromEntries(Object.keys(specs).map((name) => [name, true]));
  const hashOf = (_name, files) => specHash(files),
    state = {},
    approvedHash = {},
    last = {};
  for (const commit of testCase.history)
    for (const [name, files] of Object.entries(specsOf(commit.files))) {
      state[name] = { ...state[name], ...files };
      const hash = hashOf(name, state[name]);
      if (hash !== last[name] && testCase.approvers.includes(commit.author))
        approvedHash[name] = hash;
      last[name] = hash;
    }
  return Object.fromEntries(
    Object.entries(specs).map(([name, files]) => [
      name,
      hashOf(name, files) === approvedHash[name],
    ]),
  );
}

// Ready tasks as `spec/task`, best first. Avoozl's parser reads each spec and
// its ranking function counts the tasks each one unblocks. Claims, assignees
// and ticks are applied here, as the repository's state names them.
function ready(testCase, specs) {
  const login = testCase.runner.login,
    branches = new Set(testCase.origin.branches),
    leaves = [],
    ticked = new Set(),
    edges = [],
    linked = linkedOf(specs);
  for (const name of Object.keys(specs).sort()) {
    const parsed = parseSpec({
      name,
      exists: true,
      files: specs[name],
      linked,
    });
    for (const item of parsed.items) if (item.mark === "x") ticked.add(item.id);
    for (const task of parsed.proposals) {
      if (task.kind !== "leaf") continue;
      leaves.push({ ...task, spec: name });
      for (const from of task.requires ?? []) edges.push({ from, to: task.id });
    }
  }
  const counts = unblockCounts(edges, (id) => !ticked.has(id)),
    isApproved = approved(testCase, specs),
    // Rule 8.3: the spec's issue and every parent spec's that links it.
    assigned = (name) => {
      const who = testCase.issues?.[name];
      return (
        who?.length === 1 &&
        who[0] === login &&
        linked.parents(name).every((parent) => assigned(parent.name))
      );
    };
  return leaves
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) =>
        !ticked.has(task.id) &&
        !task.manual &&
        (task.requires ?? []).every((id) => ticked.has(id)) &&
        !branches.has(`avoozl/${task.spec}/${task.id}`) &&
        isApproved[task.spec] &&
        assigned(task.spec),
    )
    .sort(
      (a, b) =>
        (counts.get(b.task.id) ?? 0) - (counts.get(a.task.id) ?? 0) ||
        a.index - b.index,
    )
    .map(({ task }) => `${task.spec}/${task.id}`);
}

// An origin whose refs create call refuses a ref it already has, and keeps
// each one it makes.
function origin(testCase) {
  const branches = new Set(testCase.origin.branches),
    behind = new Set(testCase.origin.behind ?? []);
  return {
    merged: [],
    branch: async (_repository, name) => {
      if (!branches.has(name))
        throw Object.assign(Error("Not Found"), { status: 404 });
      return { commit: { sha: "base" } };
    },
    compareCommits: async (_repository, branch) => ({
      ahead_by: behind.has(branch) ? 1 : 0,
    }),
    async mergeBranch(_repository, { base }) {
      this.merged.push(base);
      behind.delete(base);
    },
    createBranch: async (_repository, name) => {
      if (branches.has(name))
        throw Object.assign(Error("exists"), { status: 422 });
      branches.add(name);
    },
  };
}

// The resume: the runners of one login try Avoozl's lease call in turn.
async function resume(testCase) {
  const key = testCase.resume.task,
    [spec, id] = key.split("/");
  return resumeClaim(origin(testCase), {
    repository: "o/r",
    task: { id, planId: spec },
    leases: testCase.origin.leases?.[key] ?? [],
    claimAgeHours: testCase.origin.claimAgeHours?.[key] ?? 0,
    staleHours: testCase.runner.staleHours ?? 24,
    runners: testCase.resume.runners,
    sha: "head",
  });
}

// The claim: Avoozl's claim call over the ready list, on the base its
// integration branch rule picks, caught up first.
async function claim(testCase, specs, order) {
  const github = origin(testCase),
    linked = linkedOf(specs),
    meta = new Map(),
    store = {
      getMeta: (key) => meta.get(key),
      setMeta: (k, v) => meta.set(k, v),
    },
    candidates = order.map((name) => {
      const [spec, id] = name.split("/");
      return { task: { id, planId: spec }, repository: { github: "o/r" } };
    }),
    fallback = testCase.runner.defaultBranch,
    claimed = await claimFirst(github, candidates, {
      baseOf: async ({ task }) => {
        const base = await integrationBase(task.planId, {
          linked,
          exists: (name) => testCase.origin.branches.includes(name),
          fallback,
        });
        if (base === fallback) return base;
        const done = await catchUp(store, github, {
          repository: "o/r",
          branch: base,
          base: fallback,
        });
        return done.conflict ? null : base;
      },
    });
  return claimed
    ? {
        branch: claimed.branch,
        base: claimed.base,
        mergeBase: github.merged.includes(claimed.base),
      }
    : null;
}

// Landing and spec issue markers run through operations the simplify spec
// adds, so the adapter leaves those probes out until each simplify task
// lands.
async function avoozl(testCase) {
  const specs = specsOf(testCase.files),
    got = {};
  if (testCase.expect.violations) got.violations = violations(specs);
  if (testCase.expect.approved) got.approved = approved(testCase, specs);
  if (testCase.expect.ready || testCase.expect.claim)
    got.ready = ready(testCase, specs);
  if (testCase.expect.claim)
    got.claim = await claim(testCase, specs, got.ready);
  if (testCase.expect.resume) got.resume = await resume(testCase);
  return got;
}

const simplify = read(".kiro/specs/simplify/tasks.md");
const tickedTask = (id) =>
  new RegExp(`^\\s*- \\[x\\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );
const openTask = (id) =>
  new RegExp(`^\\s*- \\[ \\] \`${id.replace(/\./g, "\\.")}\``, "m").test(
    simplify,
  );

const rules = new Set();
const doc = read("docs/github-workflow.md");
if (/^# Workflow v1$/m.test(doc))
  for (const match of doc.matchAll(/^- \*\*(\d+\.\d+)\*\*/gm))
    rules.add(match[1]);

for (const testCase of readCases()) {
  test(`workflow kit: ${testCase.name}`, async () => {
    for (const [probe, task] of Object.entries(testCase.expectFail ?? {})) {
      assert.ok(probe in testCase.expect, `${probe} is not an expected probe`);
      assert.ok(
        !tickedTask(task),
        `${task} is ticked: remove expectFail.${probe} from ${testCase.name}`,
      );
      assert.ok(openTask(task), `${task} is not a simplify task`);
    }
    if (rules.size)
      for (const rule of testCase.rules)
        assert.ok(rules.has(rule), `rule ${rule} is not in the workflow doc`);
    const verdicts = judge(testCase, await avoozl(testCase));
    for (const [probe, verdict] of Object.entries(verdicts))
      assert.ok(
        verdict === "pass" || verdict === "expected-fail",
        `${probe}: ${verdict}${
          verdict === "unexpected-pass"
            ? `, remove expectFail.${probe} from ${testCase.name}`
            : ""
        }`,
      );
  });
}

test("workflow kit: a history ends in the case's repo files", () => {
  for (const testCase of readCases().filter((item) => item.history)) {
    const final = {};
    for (const commit of testCase.history) Object.assign(final, commit.files);
    assert.deepEqual(final, testCase.files, testCase.name);
  }
});

test("workflow kit: every case has a title, rules and probes", () => {
  const cases = readCases();
  assert.ok(cases.length > 0);
  for (const testCase of cases) {
    assert.ok(testCase.title && testCase.rules?.length, testCase.name);
    assert.ok(Object.keys(testCase.expect).length, testCase.name);
    assert.ok(Object.keys(testCase.files).length, testCase.name);
  }
});
