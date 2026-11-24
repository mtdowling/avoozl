// Avoozl's side of the workflow kit: each function answers one probe of a
// snapshot case from Avoozl's own code. `workflow-kit.test.mjs` judges the
// answers against the case, and the scenario runner reuses the readers.
import { lintSpec, parseSpec, specHash } from "../specs/spec-plans.ts";
import { unblockCounts } from "../specs/ranking.ts";
import {
  type Claim,
  claimBranch,
  claimFirst,
  resumable,
  resumeClaim,
} from "../workers/claims.ts";
import { linkedReader } from "../specs/order.ts";
import {
  catchUp,
  doneBranch,
  integrationBase,
} from "../specs/integration-base.ts";
import { approverCheck } from "../git/git-approvals.ts";
import {
  landedWork,
  pushAccepted,
  runnerLimit,
  taskRevision,
} from "../workers/claim-rules.ts";
import { landingAction } from "../landing/landing-action.ts";
import { specIssuesOf } from "../specs/spec-publication.ts";
import { stoppedSpecs } from "../specs/label-filters.ts";
import { tickedText } from "../specs/spec-ticks.ts";
import type { Case } from "../../../workflow-kit/load.ts";
import type { Action, TaskText } from "../workers/claim-rules.ts";
import type { Issue } from "../specs/spec-publication.ts";
import type { Proposal } from "../specs/plan-quality.ts";
import { found } from "./view-shapes.ts";
import type { World } from "./workflow-kit-world.ts";

type Files = Record<string, string>;
// A case as its case.json reads, for the fields this adapter and the
// scenario runner use (workflow-kit/README.md documents each).
export interface KitCase extends Case {
  runner: {
    login: string;
    defaultBranch: string;
    specsBranch?: string;
    staleHours?: number;
  };
  runners: Record<string, string>;
  origin: {
    branches: string[];
    behind?: string[];
    mergedPullHeads?: string[];
    leases?: Record<
      string,
      { generation: number; ageHours: number; released?: boolean }[]
    >;
    claimAgeHours?: Record<string, number>;
    taskFiles?: Record<string, string[]>;
    graph: Record<string, string[]>;
    heads: Record<string, string>;
  };
  history?: {
    commit: string;
    files: Files;
    author: string;
    mergedBy?: string;
    signer?: string;
  }[];
  issues?: Record<string, string[]>;
  approvers?: string[];
  approvalTrust?: string;
  stops?: string[];
  resume: { task: string; runners: string[] };
  land: {
    task: string;
    mode: string;
    pr?: string;
    checks: string;
    baseMoved?: boolean;
    claim?: {
      start: string;
      head: string;
      pull?: { merged: boolean; head: string };
    };
  };
  push: { branch: string; by: { runner: string; head: string }[] };
  revision: { task: string; lease: TaskText };
  manual: { task: string };
  writers?: string[];
  issueList?: Issue[];
  expect: Record<string, unknown> & {
    claim?: Record<string, unknown>;
    specIssues?: Record<string, unknown>;
  };
  actions: Action[];
  repository?: { deleteBranchOnMerge?: boolean };
  landing?: { mode?: string; pr?: string };
  steps?: { runner: string; do: string; [key: string]: unknown }[];
  then: Record<string, unknown> & {
    leaseHolder?: Record<string, unknown>;
    leases?: Record<string, unknown>;
  };
}
// What the ready list and a claim read: a scenario builds this view of its
// world for each runner.
export interface ReadyCase {
  runner: KitCase["runner"];
  origin: { branches: string[]; behind?: string[]; mergedPullHeads?: string[] };
  issues?: KitCase["issues"];
  stops?: string[];
  history?: KitCase["history"];
  approvers?: string[];
  approvalTrust?: string;
  expect?: KitCase["expect"];
}
// The fields a case reads, by spec name, then file.
export type Specs = Record<string, Files>;

// The meta rows Avoozl's catch-up keeps, held in memory.
export class MetaStore {
  values = new Map<string, unknown>();
  getMeta<T = unknown>(key: string): T | null {
    // The value is whatever setMeta stored under the key.
    return (this.values.get(key) as T | undefined) ?? null;
  }
  setMeta(key: string, value: unknown) {
    this.values.set(key, value);
  }
}

// The rule number in docs/github-workflow.md that each lint code enforces.
// A code with no entry is reported as itself, so the case shows it.
const RULE: Record<string, string> = {
  "spec.tasks-twice": "1.2",
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

export const specsOf = (files: Files) => {
  const specs: Specs = {};
  for (const [file, text] of Object.entries(files)) {
    const match = /^\.kiro\/specs\/([^/]+)\/(.+)$/.exec(file);
    if (match) (specs[match[1]] ??= {})[match[2]] = text;
  }
  return specs;
};

// Every spec of a case, so a spec group reaches into the spec it links.
export const linkedOf = (specs: Specs) =>
  linkedReader(
    Object.entries(specs).map(([name, files]) => ({
      name,
      text: files["tasks.md"] ?? "",
    })),
  );

function violations(specs: Specs) {
  const out: Record<string, string[]> = {},
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
// latest approval left. An approval is a commit that adds a spec or changes
// its text with the evidence of rule 7.2, which Avoozl's approverCheck
// decides from what a fake GitHub returns for each commit: `mergedBy` is the
// login that merged its pull request, `signer` the login of its verified
// signature, and `author` the login the commit's author email names.
// `specHash` hashes the text without checkbox marks, so a tick changes
// nothing. A case with no history has every spec approved.
export async function approved(testCase: ReadyCase, specs: Specs) {
  const history = testCase.history;
  if (!history)
    return Object.fromEntries(Object.keys(specs).map((name) => [name, true]));
  // Each commit's pull request is numbered by its place in the history.
  const commits = new Map(history.map((entry) => [entry.commit, entry])),
    numbered = (number: number) => found(history[number - 1], `#${number}`),
    entry = (sha: string) => found(commits.get(sha), sha),
    allowed = approverCheck({
      repository: { allowedActors: testCase.approvers },
      repositoryName: "acme/widget",
      trust: testCase.approvalTrust ?? "github",
      github: {
        available: () => true,
        permission: async () => ({ permission: "none" }),
        commitPullRequests: async (_repository, sha) =>
          commits.get(sha)?.mergedBy
            ? [
                {
                  number: history.findIndex((item) => item.commit === sha) + 1,
                  merged_at: "now",
                },
              ]
            : [],
        pullRequest: async (_repository, number) => ({
          merged: true,
          merge_commit_sha: numbered(number).commit,
          merged_by: { login: numbered(number).mergedBy },
        }),
        commit: async (_repository, sha) => ({
          author: { login: entry(sha).author },
          committer: { login: entry(sha).signer ?? "web-flow" },
          commit: {
            verification: { verified: Boolean(entry(sha).signer) },
          },
        }),
      },
    }),
    state: Specs = {},
    approvedHash: Record<string, string> = {},
    last: Record<string, string> = {};
  for (const commit of history)
    for (const [name, files] of Object.entries(specsOf(commit.files))) {
      state[name] = { ...state[name], ...files };
      const hash = specHash(state[name]);
      if (
        hash !== last[name] &&
        (await allowed(
          `${commit.author}@users.noreply.github.com`,
          commit.commit,
        ))
      )
        approvedHash[name] = hash;
      last[name] = hash;
    }
  return Object.fromEntries(
    Object.entries(specs).map(([name, files]) => [
      name,
      specHash(files) === approvedHash[name],
    ]),
  );
}

// Ready tasks as `spec/task`, best first. Avoozl's parser reads each spec and
// its ranking function counts the tasks each one unblocks. Claims, assignees
// and ticks are applied here, as the repository's state names them.
export async function ready(testCase: ReadyCase, specs: Specs) {
  const login = testCase.runner.login,
    branches = new Set(testCase.origin.branches),
    leaves: (Proposal & { spec: string })[] = [],
    ticked = new Set<string>(),
    edges: { from: string; to: string }[] = [],
    linked = linkedOf(specs);
  for (const name of Object.keys(specs).sort()) {
    const parsed = parseSpec({
      name,
      exists: true,
      files: specs[name],
      linked,
    });
    for (const item of parsed.items)
      if (item.mark === "x" && item.id) ticked.add(item.id);
    for (const task of parsed.proposals) {
      if (task.kind !== "leaf") continue;
      leaves.push({ ...task, spec: name });
      for (const from of task.requires ?? []) edges.push({ from, to: task.id });
    }
  }
  const counts = unblockCounts(edges, (id) => !ticked.has(id)),
    stopped = stoppedOf(testCase, specs),
    isApproved = await approved(testCase, specs),
    merged = new Set(testCase.origin.mergedPullHeads ?? []),
    // Rule 8.3: the spec's issue and every parent spec's that links it.
    assigned = (name: string): boolean => {
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
        !merged.has(`avoozl/${task.spec}/${task.id}`) &&
        isApproved[task.spec] &&
        !stopped.has(task.spec) &&
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
// each one it makes. A ref's sha is its own name; commits it makes are
// numbered.
export function origin(testCase: Pick<ReadyCase, "origin">) {
  const branches = new Set(testCase.origin.branches),
    behind = new Set(testCase.origin.behind ?? []);
  let made = 0;
  return {
    merged: [] as string[],
    branch: async (_repository: string, name: string) => {
      if (!branches.has(name))
        throw Object.assign(Error("Not Found"), { status: 404 });
      return { commit: { sha: "base" } };
    },
    compareCommits: async (_repository: string, branch: string) => ({
      ahead_by: behind.has(branch) ? 1 : 0,
    }),
    async mergeBranch(_repository: string, { base }: { base: string }) {
      this.merged.push(base);
      behind.delete(base);
    },
    createBranch: async (_repository: string, name: string) => {
      if (branches.has(name))
        throw Object.assign(Error("exists"), { status: 422 });
      branches.add(name);
    },
    branchesUnder: async (_repository: string, prefix: string) =>
      [...branches]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ ref: `refs/heads/${name}`, object: { sha: name } })),
    commit: async () => ({ commit: { tree: { sha: "tree" }, message: "" } }),
    createCommit: async () => ({ sha: `commit-${++made}` }),
    moveBranch: async () => null,
  };
}

// The resume: the runners of one login each run Avoozl's resume over the
// claim as the claims read left it, in turn; the first lease create wins and
// the rest stop. With a live lease nobody resumes.
async function resume(testCase: KitCase) {
  const key = testCase.resume.task,
    [spec, id] = key.split("/"),
    now = Date.parse("2026-11-20T12:00:00Z"),
    ago = (hours: number) => new Date(now - hours * 3600 * 1000).toISOString(),
    newest = [...(testCase.origin.leases?.[key] ?? [])].sort(
      (a, b) => b.generation - a.generation,
    )[0],
    branch = claimBranch({ id, planId: spec }),
    ref = newest && `avoozl-lease/${key}/${newest.generation}`,
    claim: Claim = {
      spec,
      task: id,
      branch,
      sha: branch,
      at: ago(testCase.origin.claimAgeHours?.[key] ?? 0),
      lease: newest
        ? {
            ref,
            generation: newest.generation,
            sha: ref,
            at: ago(newest.ageHours),
            released: newest.released,
          }
        : null,
    },
    github = origin(testCase),
    stopped: string[] = [];
  let holder: string | null = null,
    lease: string | null = null;
  for (const runner of testCase.resume.runners) {
    const taken = resumable(claim, testCase.runner.staleHours ?? 24, now)
      ? await resumeClaim(github, {
          repository: "o/r",
          claim,
          task: { id, planId: spec },
          signer: { runner },
        })
      : null;
    if (taken && !holder) [holder, lease] = [runner, taken.lease.ref];
    else stopped.push(runner);
  }
  return { holder, lease, stopped };
}

// The claim: Avoozl's claim call over the ready list, on the base its
// integration branch rule picks, caught up first. `raw` returns the claim
// as Avoozl makes it, with its head and lease, for the scenario runner.
export async function claim(
  testCase: ReadyCase,
  specs: Specs,
  order: string[],
  github: ReturnType<typeof origin> | ReturnType<World["github"]> = origin(
    testCase,
  ),
  { raw = false, root = null }: { raw?: boolean; root?: string | null } = {},
) {
  const linked = linkedOf(specs),
    store = new MetaStore(),
    candidates = order.map((name) => {
      const [spec, id] = name.split("/");
      return {
        task: { id, planId: spec },
        repository: { github: "o/r", root },
      };
    }),
    fallback = testCase.runner.defaultBranch,
    claimed = await claimFirst(github, candidates, {
      baseOf: async ({ task }: { task: { planId: string } }) => {
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
  if (raw) return claimed;
  return claimed
    ? {
        branch: claimed.branch,
        base: claimed.base,
        mergeBase: "merged" in github && github.merged.includes(claimed.base),
        // The lease a case names: only cases about lease numbers ask.
        ...("lease" in (testCase.expect?.claim ?? {})
          ? { lease: claimed.lease }
          : {}),
      }
    : null;
}

// The landing: Avoozl's landing step for the case's task, on the base its
// integration branch rule picks; landed work is ticked on the specs branch
// when the runner names one, else on that base.
async function landing(testCase: KitCase, specs: Specs) {
  const { land, runner } = testCase,
    base = await integrationBase(land.task.split("/")[0], {
      linked: linkedOf(specs),
      exists: (name) => testCase.origin.branches.includes(name),
      fallback: runner.defaultBranch,
    });
  return landingAction({
    mode: land.mode,
    pr: land.pr,
    checks: land.checks === "pass",
    baseMoved: land.baseMoved,
    landed: landed(testCase, base),
    base,
    done: doneBranch(base, {
      fallback: runner.defaultBranch,
      specs: runner.specsBranch,
      holds: holds(testCase, base, land.task),
    }),
    stopped: stoppedOf(testCase, specs).has(land.task.split("/")[0]),
  });
}

// Rule 10.1: the specs the case's stop labels stop.
const stoppedOf = (testCase: Pick<ReadyCase, "stops">, specs: Specs) =>
  stoppedSpecs(
    Object.keys(specs),
    new Set(testCase.stops ?? []),
    linkedOf(specs),
  );

// Rule 14.6: whether an integration branch holds the task file of the
// task's own spec. A branch missing from `origin.taskFiles` holds them all.
const holds = (testCase: KitCase, branch: string, task: string) =>
  testCase.origin.taskFiles?.[branch]?.includes(task.split("/")[0]) ?? true;

// Rule 16.5: whether the case's claim holds landed work, from its commit
// graph and the base's head.
const landed = (testCase: KitCase, base: string) => {
  const claimed = testCase.land.claim;
  return (
    claimed !== undefined &&
    landedWork({
      graph: testCase.origin.graph,
      start: claimed.start,
      head: claimed.head,
      baseHead: testCase.origin.heads[base],
      pull: claimed.pull,
    })
  );
};

// Rule 15.8: each runner's push to the claim branch is accepted only when it
// moves the branch forward. Rule 10.2: a holder makes no push while the
// task's spec is stopped.
function push(testCase: KitCase, specs: Specs) {
  const { branch, by } = testCase.push,
    head = testCase.origin.heads?.[branch],
    held = stoppedOf(testCase, specs).has(branch.split("/")[1]);
  return Object.fromEntries(
    by.map((item) => [
      item.runner,
      held
        ? "held"
        : pushAccepted(testCase.origin.graph, head, item.head)
          ? "accepted"
          : "rejected",
    ]),
  );
}

// Rule 15.10: the lease's recorded text against the task's text in the spec.
function revision(testCase: KitCase, specs: Specs) {
  const [spec, id] = testCase.revision.task.split("/"),
    task = parseSpec({
      name: spec,
      exists: true,
      files: specs[spec],
      linked: linkedOf(specs),
    }).proposals.find((item) => item.id === id);
  return taskRevision(testCase.revision.lease, found(task, id));
}

// Rule 4.1: the branch a person ticks a manual task on.
async function manualTick(testCase: KitCase, specs: Specs) {
  const base = await integrationBase(testCase.manual.task.split("/")[0], {
    linked: linkedOf(specs),
    exists: (name) => testCase.origin.branches.includes(name),
    fallback: testCase.runner.defaultBranch,
  });
  return {
    branch: doneBranch(base, {
      fallback: testCase.runner.defaultBranch,
      specs: testCase.runner.specsBranch,
      holds: holds(testCase, base, testCase.manual.task),
    }),
  };
}

// Rule 8.2: each spec's issue, by Avoozl's marker reader, where a writer is
// a login the case lists in `writers`; and the newer duplicates it closes.
function specIssues(testCase: KitCase) {
  const writers = new Set(testCase.writers ?? []),
    { specs, duplicates } = specIssuesOf(
      testCase.issueList,
      (issue) => issue.author !== undefined && writers.has(issue.author),
    );
  return {
    specIssues: Object.fromEntries(
      Object.keys(testCase.expect.specIssues ?? {}).map((name) => [
        name,
        specs.get(name)?.number ?? null,
      ]),
    ),
    duplicates: duplicates.map((issue) => issue.number),
  };
}

export async function avoozl(read: Case) {
  // The case.json shape is the kit's contract; the reader keeps it as JSON.
  const testCase = read as KitCase,
    specs = specsOf(testCase.files),
    got: Record<string, unknown> = {};
  if (testCase.expect.violations) got.violations = violations(specs);
  if (testCase.expect.approved) got.approved = await approved(testCase, specs);
  if (testCase.expect.ready || testCase.expect.claim) {
    const list = await ready(testCase, specs);
    got.ready = list;
    if (testCase.expect.claim) got.claim = await claim(testCase, specs, list);
  }
  if (testCase.expect.resume) got.resume = await resume(testCase);
  if (testCase.expect.landing) got.landing = await landing(testCase, specs);
  if ("landed" in testCase.expect)
    got.landed = landed(
      testCase,
      await integrationBase(testCase.land.task.split("/")[0], {
        linked: linkedOf(specs),
        exists: (name) => testCase.origin.branches.includes(name),
        fallback: testCase.runner.defaultBranch,
      }),
    );
  if (testCase.expect.push) got.push = push(testCase, specs);
  if (testCase.expect.revision) got.revision = revision(testCase, specs);
  if (testCase.expect.manualTick)
    got.manualTick = await manualTick(testCase, specs);
  if (testCase.expect.specIssues || testCase.expect.duplicates)
    Object.assign(got, specIssues(testCase));
  if (testCase.expect.groupTicks)
    got.groupTicks = Object.fromEntries(
      Object.entries(specs).map(([name, files]) => [
        name,
        tickedText(name, files["tasks.md"] ?? "", [], "tasks.md", {
          groups: true,
        }).ticked,
      ]),
    );
  if (testCase.expect.limits)
    got.limits = testCase.actions.map((action) =>
      runnerLimit(action, testCase.runner),
    );
  return got;
}
