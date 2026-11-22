// Avoozl's reference adapter for the workflow kit's scenarios. A scenario is
// a list of steps, each `{runner, do, ...args, expect?}`, and `do` is one of
// STEPS. This adapter runs each step with Avoozl's own code against a bare
// local git remote and a fake GitHub API (workflow-kit-world.mjs), then
// answers the probes the scenario's `then` lists.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSpec } from "../specs/spec-plans.ts";
import {
  cacheClaim,
  claimBranch,
  deleteClaim,
  deleteOwnClaim,
  pushTakeover,
  resumeClaim,
} from "../workers/claims.ts";
import { landedWork, taskRevision } from "../workers/claim-rules.ts";
import { doneBranch, integrationBase } from "../specs/integration-base.ts";
import { landingAction } from "../landing/landing-action.ts";
import {
  guardedFastForward,
  headGuardedMerge,
} from "../landing/guarded-push.ts";
import { tickBranch } from "../specs/spec-ticks.ts";
import type { Case } from "../../../workflow-kit/load.ts";
import {
  claim,
  type KitCase,
  linkedOf,
  MetaStore,
  ready,
  type Specs,
  specsOf,
} from "./workflow-kit-adapter.ts";
import { found } from "./view-shapes.ts";
import { GIT_ENV, REPOSITORY, World, gitSync } from "./workflow-kit-world.ts";

// The adapter contract: what a runner does for each `do`.
export const STEPS = [
  "next",
  "claim",
  "readLeases",
  "takeOver",
  "push",
  "land",
  "recover",
  "mergePr",
  "deleteBranch",
];

const taskParts = (task: string) => task.split("/");
const generationOf = (ref: string) => Number(ref.split("/").pop());

// A runner's cache: the claim rows Avoozl keeps, and the one repository.
class RunnerStore extends MetaStore {
  list(kind: string) {
    return kind === "repositories" ? [{ github: REPOSITORY }] : [];
  }
}
type Runner = ReturnType<typeof runnerState>;
// A step's arguments, as the case lists them.
interface StepArgs {
  task?: string;
  branch?: string;
  afterHours?: number;
  files?: Record<string, string>;
  mode?: string;
  pr?: string;
  checks?: string;
  interrupt?: string;
}
// What a step answers: the probes its `expect` may name.
type StepResult = Record<string, unknown>;
const taskOfArgs = (args: StepArgs) => found(args.task, "task");

// What a runner holds between steps: the checkout it works in, the ready
// list and leases it last read, and the task text its lease recorded.
function runnerState(
  world: World,
  name: string,
  login: string,
  defaultBranch: string,
) {
  return {
    name,
    login,
    root: world.clone(name),
    github: world.github(name, login),
    ready: [] as string[],
    leases: {} as Record<string, number[]>,
    recorded: {} as Record<string, { title?: unknown; acceptance?: unknown }>,
    claimed: undefined as string | null | undefined,
    paused: false,
    pushes: [] as string[],
    store: new RunnerStore(),
    defaultBranch,
  };
}

export async function scenario(read: Case) {
  // The case.json shape is the kit's contract; the reader keeps it as JSON.
  const testCase = read as KitCase,
    defaultBranch = testCase.runner.defaultBranch,
    world = new World({
      files: testCase.files,
      branches: testCase.origin.branches,
      defaultBranch,
      deleteBranchOnMerge: testCase.repository?.deleteBranchOnMerge,
    }),
    runners = new Map(
      Object.entries(testCase.runners).map(([name, login]) => [
        name,
        runnerState(world, name, login, defaultBranch),
      ]),
    ),
    login = Object.values(testCase.runners)[0];
  try {
    // The specs as each spec's done branch holds them: a branch named for the
    // spec when origin has one, else the specs branch (workflow rule 14.6).
    const specsBranch = testCase.runner.specsBranch ?? defaultBranch,
      treeOf = () => {
        const files = world.specFiles(specsBranch);
        for (const file of Object.keys(files)) {
          const spec = /^\.kiro\/specs\/([^/]+)\//.exec(file)?.[1];
          if (spec && world.has(spec))
            Object.assign(
              files,
              Object.fromEntries(
                Object.entries(world.specFiles(spec)).filter(([name]) =>
                  name.startsWith(`.kiro/specs/${spec}/`),
                ),
              ),
            );
        }
        return files;
      },
      view = (asLogin: string) => ({
        runner: { login: asLogin, defaultBranch, specsBranch },
        origin: {
          branches: world.branches(),
          mergedPullHeads: world.mergedHeads(),
        },
        issues: testCase.issues,
      }),
      sync = (runner: Runner, branch: string) => {
        gitSync(runner.root, ["fetch", "-q", "origin"]);
        gitSync(runner.root, [
          "checkout",
          "-q",
          "-B",
          branch,
          `origin/${branch}`,
        ]);
      },
      taskOf = (files: Record<string, string>, task: string) => {
        const [spec, id] = taskParts(task);
        return parseSpec({
          name: spec,
          exists: true,
          files: specsOf(files)[spec],
          linked: linkedOf(specsOf(files)),
        }).proposals.find((item) => item.id === id);
      },
      env = GIT_ENV;

    // The branch a task's work lands on, and the one that gets its tick.
    const placeOf = async (task: string) => {
      const [spec] = taskParts(task),
        specs = specsOf(treeOf()),
        base = await integrationBase(spec, {
          linked: linkedOf(specs),
          exists: (name) => world.has(name),
          fallback: defaultBranch,
        }),
        holds = Object.keys(world.specFiles(base)).some((file) =>
          file.startsWith(`.kiro/specs/${spec}/`),
        );
      return {
        base,
        done: doneBranch(base, {
          fallback: defaultBranch,
          specs: testCase.runner.specsBranch,
          holds,
        }),
      };
    };

    const tick = (runner: Runner, branch: string, task: string) => {
      const [spec, id] = taskParts(task);
      return tickBranch(runner.root, {
        branch,
        files: [{ spec, ids: [id] }],
        env,
      });
    };

    // A claim that is gone after landing: its leases go with it (20.5).
    const finish = (runner: Runner, task: string) =>
      deleteOwnClaim(
        runner.store,
        runner.github,
        REPOSITORY,
        taskParts(task)[1],
      ).catch(() => false);

    const OPS: Record<
      string,
      (runner: Runner, args: StepArgs) => Promise<StepResult>
    > = {
      next: async (runner) => {
        const files = treeOf(),
          list = await ready(view(runner.login), specsOf(files));
        runner.ready = list;
        return { ready: list };
      },

      claim: async (runner, args) => {
        const files = treeOf(),
          specs = specsOf(files),
          order = args.task ? [args.task] : runner.ready;
        let claimed = null;
        try {
          claimed = await claim(
            view(runner.login),
            specs,
            order,
            runner.github,
            {
              raw: true,
            },
          );
        } catch (error) {
          if ((error as { status?: number }).status !== 409) throw error;
        }
        if (!claimed || !("task" in claimed)) {
          runner.claimed = null;
          return { claimed: null };
        }
        const { id, planId } = claimed.task,
          key = `${planId}/${id}`,
          item = found(taskOf(files, key), key);
        runner.claimed = key;
        runner.recorded[key] = {
          title: item.title,
          acceptance: item.acceptance,
        };
        cacheClaim(runner.store, REPOSITORY, {
          spec: planId,
          task: id,
          branch: claimed.branch,
          sha: claimed.head,
          own: true,
        });
        sync(runner, claimed.branch);
        return {
          claimed: claimed.branch,
          base: claimed.base,
          lease: claimed.lease,
        };
      },

      readLeases: async (runner, args) => {
        const task = taskOfArgs(args),
          [spec, id] = taskParts(task),
          refs = await runner.github.branchesUnder(
            REPOSITORY,
            `avoozl-lease/${spec}/${id}/`,
          ),
          generations = refs
            .map((item) => generationOf(item.ref))
            .sort((a, b) => a - b);
        runner.leases[task] = generations;
        return { generations };
      },

      takeOver: async (runner, args) => {
        const task = taskOfArgs(args),
          [spec, id] = taskParts(task),
          hours = args.afterHours ?? 0,
          refs = await runner.github.branchesUnder(
            REPOSITORY,
            `avoozl-lease/${spec}/${id}/`,
          ),
          branch = claimBranch({ id, planId: spec }),
          taken = await resumeClaim(runner.github, {
            repository: REPOSITORY,
            task: { id, planId: spec },
            leases: refs.map((item) => ({
              generation: generationOf(item.ref),
              ageHours: hours,
            })),
            claimAgeHours: hours,
            staleHours: testCase.runner.staleHours ?? 24,
            runners: [runner.name],
            sha: world.head(branch),
          });
        if (taken.holder) {
          const item = found(taskOf(treeOf(), task), task);
          runner.claimed = task;
          runner.recorded[task] = {
            title: item.title,
            acceptance: item.acceptance,
          };
          // Rule 15.8: the takeover commit fences the old holder out.
          await pushTakeover(runner.root, branch, { env: GIT_ENV });
        }
        return { holder: Boolean(taken.holder), lease: taken.lease };
      },

      push: async (runner, args) => {
        const branch = args.branch ?? claimBranch(asTask(taskOfArgs(args)));
        // A claim branch is pushed from the runner's own checkout, as it last
        // read it. Any other branch is read fresh.
        if (args.branch || !hasLocal(runner.root, branch)) sync(runner, branch);
        else gitSync(runner.root, ["checkout", "-q", branch]);
        const files = args.files ?? {
          [`work/${runner.name}-${runner.pushes.length + 1}.txt`]: "work\n",
        };
        for (const [file, text] of Object.entries(files)) {
          fs.mkdirSync(path.dirname(path.join(runner.root, file)), {
            recursive: true,
          });
          fs.writeFileSync(path.join(runner.root, file), text);
        }
        gitSync(runner.root, ["add", "-A"]);
        gitSync(runner.root, ["commit", "-q", "-m", `Work by ${runner.name}`]);
        let push = "accepted";
        try {
          gitSync(runner.root, [
            "push",
            "-q",
            "origin",
            `HEAD:refs/heads/${branch}`,
          ]);
        } catch {
          push = "rejected";
        }
        runner.pushes.push(push);
        return { push };
      },

      land: async (runner, args) => {
        const task = taskOfArgs(args),
          [spec, id] = taskParts(task),
          branch = claimBranch({ id, planId: spec }),
          mode = args.mode ?? testCase.landing?.mode ?? "direct",
          { base, done } = await placeOf(task),
          current = taskOf(treeOf(), task);
        // Rule 15.10: a changed task text is neither landed nor ticked.
        if (
          taskRevision(runner.recorded[task], found(current, task)) !== "land"
        )
          return { action: "none", revision: "redo-or-stop" };
        gitSync(runner.root, ["fetch", "-q", "origin"]);
        const decide = () =>
          landingAction({
            mode,
            pr: args.pr ?? testCase.landing?.pr,
            checks: (args.checks ?? "pass") === "pass",
            baseMoved: !isAncestor(world, world.head(base), world.head(branch)),
            base,
            done,
          });
        let plan = decide();
        // Rule 16.1: a base that moved is merged into the claim branch first.
        if (plan.mergeBase) {
          sync(runner, branch);
          gitSync(runner.root, ["merge", "-q", "--no-edit", `origin/${base}`]);
          gitSync(runner.root, [
            "push",
            "-q",
            "origin",
            `HEAD:refs/heads/${branch}`,
          ]);
          plan = decide();
        }
        if (plan.action === "none") return { action: "none" };
        const interrupted = args.interrupt === "before-tick";
        // The tick rides with the work when the done branch is the base
        // (16.2). An interrupted runner never gets to it.
        if (
          plan.action !== "push-claim-branch" &&
          !interrupted &&
          plan.tick === "same-commit"
        )
          await tick(runner, branch, task);
        gitSync(runner.root, ["fetch", "-q", "origin"]);
        const candidate = world.head(branch);
        const result: StepResult = { action: plan.action };
        if (plan.action === "fast-forward-base") {
          result.landed = await guardedFastForward(runner.root, {
            url: world.origin,
            branch: base,
            base: world.head(base),
            candidate,
            env,
          });
        } else if (plan.action === "push-claim-branch") {
          return result;
        } else {
          const { number } = await runner.github.createPullRequest(REPOSITORY, {
            head: branch,
            base,
            draft: plan.action === "open-draft-pull-request",
          });
          result.pull = number;
          if (plan.action === "open-and-merge-pull-request")
            result.landed = await headGuardedMerge(
              runner.github,
              REPOSITORY,
              number,
              candidate,
              "merge",
            );
        }
        if (result.landed && !interrupted) {
          // A done branch other than the base gets its own tick commit.
          if (plan.tick === "own-commit") await tick(runner, done, task);
          if (plan.deleteClaimBranch) await finish(runner, task);
        }
        return result;
      },

      recover: async (runner, args) => {
        const task = taskOfArgs(args),
          [spec, id] = taskParts(task),
          branch = claimBranch({ id, planId: spec }),
          { base, done } = await placeOf(task),
          leases = world.refs(`avoozl-lease/${spec}/${id}/`),
          first = leases.sort(
            (a, b) => generationOf(a.ref) - generationOf(b.ref),
          )[0],
          pull = world.pulls.find(
            (item) => item.head === branch && item.merged,
          ),
          head = world.has(branch) ? world.head(branch) : pull?.headSha,
          landed =
            first !== undefined &&
            head !== undefined &&
            landedWork({
              graph: world.graph(),
              start: first.object.sha,
              head,
              baseHead: world.head(base),
              pull: pull ? { merged: true, head: pull.headSha } : null,
            }),
          plan = landingAction({
            mode: "direct",
            checks: true,
            landed,
            base,
            done,
          });
        if (!landed) return { action: "none", landed: false };
        // Landed work whose tick is missing: tick it on the done branch in
        // its own commit, then delete its claim branch and leases (16.5).
        gitSync(runner.root, ["fetch", "-q", "origin"]);
        await tick(runner, found(plan.base), task);
        if (plan.deleteClaimBranch) await finish(runner, task);
        return { action: plan.action, landed: true };
      },

      mergePr: async (runner, args) => {
        const [spec, id] = taskParts(taskOfArgs(args)),
          branch = claimBranch({ id, planId: spec }),
          pull = world.openPull(branch);
        if (!pull) throw new Error(`${args.task} has no open pull request`);
        const merged = await headGuardedMerge(
          runner.github,
          REPOSITORY,
          pull.number,
          world.head(branch),
          "merge",
        );
        return { merged };
      },

      deleteBranch: async (runner, args) => {
        const branch = args.branch ?? claimBranch(asTask(taskOfArgs(args)));
        return deleteClaim(runner.store, runner.github, {
          repository: REPOSITORY,
          branch,
        });
      },
    };

    for (const [index, step] of (testCase.steps ?? []).entries()) {
      const where = `step ${index + 1} (${step.runner} ${step.do})`,
        runner = runners.get(step.runner),
        { runner: _runner, do: action, expect, pause, ...args } = step;
      assert.ok(runner, `${where}: ${step.runner} is not one of the runners`);
      assert.ok(STEPS.includes(action), `${where}: ${action} is not a step`);
      runner.paused = false;
      const result = await OPS[action](runner, args as StepArgs);
      for (const [key, want] of Object.entries(expect ?? {}))
        assert.deepEqual(result[key], want, `${where}: ${key}`);
      runner.paused = Boolean(pause);
    }
    for (const runner of runners.values())
      assert.ok(
        !runner.paused,
        `${runner.name} is paused and never acts again`,
      );

    return await probes(testCase, world, runners, {
      ready: () => ready(view(login), specsOf(treeOf())),
      treeOf,
    });
  } finally {
    world.close();
  }
}

const hasLocal = (root: string, branch: string) => {
  try {
    gitSync(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
};

const asTask = (task: string) => {
  const [planId, id] = taskParts(task);
  return { planId, id };
};

const isAncestor = (world: World, older: string, newer: string) => {
  try {
    world.git(["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
};

// The state the scenario ends in, for each probe its `then` lists.
async function probes(
  testCase: KitCase,
  world: World,
  runners: Map<string, Runner>,
  {
    ready: readyList,
    treeOf,
  }: { ready: () => Promise<string[]>; treeOf: () => Record<string, string> },
) {
  const out: Record<string, unknown> = {},
    want = Object.keys(testCase.then);
  const lease = (task: string) => {
    const [spec, id] = taskParts(task);
    return world
      .refs(`avoozl-lease/${spec}/${id}/`)
      .sort((a, b) => generationOf(a.ref) - generationOf(b.ref));
  };
  if (want.includes("leaseHolder"))
    out.leaseHolder = Object.fromEntries(
      Object.keys(testCase.then.leaseHolder ?? {}).map((task) => {
        const newest = lease(task).at(-1);
        return [
          task,
          newest
            ? world.creators.get(newest.ref.replace(/^refs\/heads\//, ""))
            : null,
        ];
      }),
    );
  if (want.includes("leases"))
    out.leases = Object.fromEntries(
      Object.keys(testCase.then.leases ?? {}).map((task) => [
        task,
        lease(task).map((item) => generationOf(item.ref)),
      ]),
    );
  if (want.includes("claims"))
    out.claims = Object.fromEntries(
      [...runners.values()]
        .filter((runner) => runner.claimed !== undefined)
        .map((runner) => [runner.name, runner.claimed]),
    );
  if (want.includes("rejectedPushes"))
    out.rejectedPushes = [...runners.values()]
      .filter((runner) => runner.pushes.includes("rejected"))
      .map((runner) => runner.name)
      .sort();
  if (want.includes("branches"))
    out.branches = world
      .branches()
      .filter((name) => name.startsWith("avoozl/"))
      .sort();
  if (want.includes("pullRequests"))
    out.pullRequests = Object.fromEntries(
      world.pulls.map((pull) => [
        pull.head,
        {
          state: pull.merged ? "merged" : "open",
          mergedBy: pull.mergedBy ?? null,
          verified: pull.merged
            ? world.signed.has(found(pull.mergeCommit))
            : false,
        },
      ]),
    );
  if (want.includes("ticked")) {
    const specs: Specs = specsOf(treeOf());
    out.ticked = Object.entries(specs)
      .flatMap(([name, files]) => {
        const parsed = parseSpec({
            name,
            exists: true,
            files,
            linked: linkedOf(specs),
          }),
          done = new Set(
            parsed.items
              .filter((item) => item.mark === "x")
              .map((item) => item.id),
          );
        return parsed.proposals
          .filter((task) => task.kind === "leaf" && done.has(task.id))
          .map((task) => `${name}/${task.id}`);
      })
      .sort();
  }
  if (want.includes("ready")) out.ready = await readyList();
  return out;
}
