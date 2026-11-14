// Quick goal operations (RC9, design D11): propose, edit, confirm, approve,
// promote and discard. Everything before approve stays in the workspace
// database; approve opens the same approval pull request as any spec. The
// planner chat is injected (`ops.plannerAgent`), so tests use a fake and no
// real chat or repository is touched.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { onePullRequestHint } from "../work-split.mjs";
import { parseRepository } from "./github.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";
import {
  checkProposal,
  promoteReasons,
  quickGoalRequest,
  runPlannerChat,
} from "./quick-goal.mjs";
import { buildMiniSpec } from "./quick-goal-spec.mjs";
import { openApproval, reconcileApproval } from "./spec-approval.mjs";
import { createSpecPlan, SPECS_DIRECTORY, specHash } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

const key = (id) => `quickgoal:${id}`;
const SETTINGS = "quickgoal:settings";
const ID = /^qg_[a-f0-9]{12}$/;

export const quickGoalSettings = (store) => ({
  autoApprove: false,
  ...(store.getMeta(SETTINGS) || {}),
});

function load(store, id) {
  if (!ID.test(String(id))) fail("Unknown quick goal.", 404);
  const state = store.getMeta(key(id));
  if (!state) fail("Unknown quick goal.", 404);
  return state;
}
const INDEX = "quickgoal:index";
const save = (store, state) => {
  store.setMeta(key(state.id), state);
  const ids = store.getMeta(INDEX) || [];
  if (!ids.includes(state.id)) store.setMeta(INDEX, [...ids, state.id]);
};
const open = (state) => {
  if (!["proposed", "approving"].includes(state.status))
    fail(`This quick goal is ${state.status}.`, 409);
};

// What the page shows for one quick goal.
const view = (state) => ({
  id: state.id,
  status: state.status,
  request: state.request,
  proposal: state.proposal,
  promote: state.promote,
  hint: state.hint,
  plan: state.plan ?? null,
  pull: state.pull ?? null,
});

function checksFor(ops, repository) {
  const store = ops.store,
    config = store.get("github_repositories", parseRepository(repository).id),
    project = store.get("projects", config?.projectId);
  return (project?.checks || []).map((argv) => argv.join(" "));
}

const spec = (ops, state) =>
  buildMiniSpec(ops.store, {
    request: state.request,
    proposal: state.proposal,
    checks: checksFor(ops, state.request.repository),
  });

export async function quickGoalOperation(ops, name, input = {}) {
  const store = ops.store;
  if (name === "quickgoal.settings.get") return quickGoalSettings(store);
  if (name === "quickgoal.settings.update") {
    if (typeof input.autoApprove !== "boolean")
      fail("autoApprove is true or false.");
    store.setMeta(SETTINGS, { autoApprove: input.autoApprove });
    return quickGoalSettings(store);
  }
  // Goals whose approval pull request is open, for the modal to check.
  if (name === "quickgoal.list")
    return (store.getMeta(INDEX) || [])
      .map((id) => store.getMeta(key(id)))
      .filter((state) => state?.status === "approving")
      .map(view);
  if (name === "quickgoal.propose") {
    if (typeof ops.plannerAgent !== "function")
      fail("No planner chat is available here, so nothing was started.", 409);
    const request = quickGoalRequest(input),
      result = await runPlannerChat({
        agent: await ops.plannerAgent(request),
        request,
      });
    if (result.status !== "proposed") return result;
    const state = {
      id: "qg_" + randomBytes(6).toString("hex"),
      status: "proposed",
      request,
      proposal: result.proposal,
      promote: result.promote,
      hint: result.hint,
    };
    save(store, state);
    // Auto-approve is a setting, off by default, and never for a goal that
    // crosses a promote rule.
    if (quickGoalSettings(store).autoApprove && !state.promote.length)
      return {
        ...view(state),
        approval: await quickGoalOperation(ops, "quickgoal.approve", {
          id: state.id,
        }),
      };
    return view(state);
  }
  const state = load(store, input.id);
  if (name === "quickgoal.get") return view(state);
  open(state);
  if (name === "quickgoal.edit") {
    // Titles and removals only. The check runs again over the result.
    const drop = new Set(input.remove || []),
      titles = input.titles || {},
      tasks = state.proposal.tasks
        .filter((task) => !drop.has(task.id))
        .map((task) => ({ ...task, title: titles[task.id] ?? task.title })),
      ids = new Set(tasks.map((task) => task.id)),
      proposal = checkProposal(
        {
          ...state.proposal,
          tasks,
          edges: state.proposal.edges.filter(
            (e) => ids.has(e.from) && ids.has(e.to),
          ),
          batches: state.proposal.batches
            .map((batch) => batch.filter((id) => ids.has(id)))
            .filter((batch) => batch.length > 1),
        },
        { depth: state.request.depth },
      );
    Object.assign(state, {
      proposal,
      promote: promoteReasons(proposal),
      hint: onePullRequestHint(proposal),
    });
    save(store, state);
    return view(state);
  }
  if (name === "quickgoal.discard") {
    state.status = "discarded";
    save(store, state);
    return view(state);
  }
  // The confirm: every issue Approve will write. Writes nothing.
  if (name === "quickgoal.confirm") {
    const mini = spec(ops, state),
      manifest = JSON.parse(mini.files["avoozl/manifest.json"]).tasks;
    return {
      id: state.id,
      spec: mini.name,
      repository: state.request.repository,
      issues: Object.entries(manifest).map(([id, task]) => ({
        id: `${mini.name}.${id}`,
        title: task.summary.split("\n")[0],
        requires: (task.requires || []).map((r) => `${mini.name}.${r}`),
      })),
    };
  }
  if (name === "quickgoal.promote") {
    // The folder goes into the spec checkout and a draft plan is stored, so
    // Spec Builder can carry on with the same task IDs. Nothing reaches
    // GitHub: Approve there is the normal one.
    const mini = spec(ops, state),
      root = ops.specRoots()[0],
      folder = path.join(root, SPECS_DIRECTORY, mini.name);
    if (fs.existsSync(folder))
      fail(`The folder ${mini.name} already exists.`, 409);
    for (const [file, text] of Object.entries(mini.files)) {
      fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
      fs.writeFileSync(path.join(folder, file), text);
    }
    const plan = await ops.perform("plan.create", {
      spec: mini.name,
      prompt: state.request.goal.slice(0, 200),
    });
    state.status = "promoted";
    state.plan = { id: plan.id, hash: plan.hash, spec: mini.name };
    save(store, state);
    return view(state);
  }
  if (name === "quickgoal.approve") {
    if (state.promote.length)
      fail(
        `Promote this goal to a spec instead: it crosses ${state.promote.join(", ")}.`,
        409,
      );
    const repository = parseRepository(state.request.repository);
    if (!state.plan) {
      const mini = spec(ops, state),
        config = store.get("github_repositories", repository.id);
      const plan = createSpecPlan(
        store,
        {
          id: mini.name,
          prompt: state.request.goal.slice(0, 200),
          context: { projectId: config?.projectId, quickGoal: state.id },
        },
        {
          name: mini.name,
          exists: true,
          folder: `.kiro/specs/${mini.name}/`,
          files: mini.files,
          hash: specHash(mini.files),
        },
      );
      state.plan = { id: plan.id, hash: plan.hash, spec: mini.name };
    }
    const plan = store.get("plans", state.plan.id),
      ids = { github: ops.github, repository },
      at = { planId: plan.id, hash: plan.hash };
    let pull = await reconcileApproval(store, { ...ids, ...at });
    if (pull?.state !== "merged") {
      if (pull?.state !== "open") {
        const policy = readGitHubPolicyOrNull(ops.workspaceRoot);
        pull = await openApproval(store, {
          ...ids,
          ...at,
          spec: plan.spec,
          files: plan.files,
          diagnostics: ops.lintSpecPlan(plan, [], { content: false })
            .diagnostics,
          approvedBy: ops.operator,
          decisionRecord:
            policy?.repositories?.[repository.id]?.approval?.decisionRecord ??
            false,
          extra: {
            [`.kiro/specs/${plan.spec}/avoozl/manifest.json`]:
              plan.files["avoozl/manifest.json"],
          },
        });
      }
      state.status = "approving";
      state.pull = { number: pull.number, repository: pull.repository };
      save(store, state);
      return { ...view(state), pending: true };
    }
    // Merged: approve in Avoozl, so projection finds the approval record.
    const approved = await ops.perform("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
      approvedBy: pull.approvedBy,
    });
    state.status = "approved";
    save(store, state);
    return { ...view(state), approved };
  }
  fail(`Unknown operation ${name}.`, 404);
}
