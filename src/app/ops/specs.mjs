// Operations of one feature: name, class, MCP policy and handler.
import {
  decideAway,
  driverContext,
  driverStatus,
  forceTakeOver,
  handOffDriver,
  takeOver,
  takeoverPreview,
  updateMachineSettings,
} from "../workers/driver.mjs";
import { planningIdentity } from "../github/github-marker.mjs";
import {
  actorAllowed,
  readGitHubPolicyOrNull,
} from "../github/github-policy.mjs";
import { parseRepository } from "../github/github.mjs";
import { instanceIdentity } from "../workspace/instance.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { forwardRecord } from "../mirror/mirror-forward-run.mjs";
import {
  mirrorEntryKey,
  mirrorGit,
  mirrorSetup,
} from "../mirror/mirror-setup.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import { repositorySetup } from "../workspace/repository-setup.mjs";
import { publishSpec } from "../specs/spec-publication.mjs";
import {
  adoptPull,
  rejectPull,
  requestChanges,
  roleOf,
  specPullOf,
  specPullView,
} from "../specs/spec-pull-requests.mjs";
import { reanchorSpec, resumeSpec } from "../specs/spec-reanchor.mjs";
import { driverIdOf } from "../specs/spec-scheduler.mjs";
import { specAuthority, takeOverSpec } from "../specs/spec-takeover.mjs";
import { fail } from "../store/store.mjs";
import { taskDefinition } from "../specs/task-outcomes.mjs";
import { readCache } from "../github/github-open-read.mjs";
import { publishOffer, reserveGrants } from "../workers/worker-grants.mjs";
import {
  grantStaleMs,
  grantStatus,
  reconcileGrants,
  releaseGrant,
} from "../workers/worker-release.mjs";
import { publishPlanningPullRequest } from "../workspace/workspace-repository.mjs";
import { person, notOnMcp, routed } from "../api/operation-policy.mjs";

function driverTakeoverHandler({ name, input }) {
  const store = this.store;

  return name === "driver.takeover"
    ? takeOver(store, this.github, input)
    : forceTakeOver(store, this.github, input, {
        notify: (notices) => queueNotifications(store, notices),
      });
}
// An epic's integration branch (RC16.1): exists, not the default,
// protected. Read only; refuses a branch that is not ready.
// The mirror setup buttons (RC27): a dry run, or a confirmed apply with
// {confirm, previewHash, ticked}. `this.mirrorGit` is a test seam.
function mirrorAdoptHandler({ name, input }) {
  if (!input.repository) fail("Name the mirror repository.", 400);
  if (!this.github?.available?.()) fail("GitHub is not available.", 503);
  const policy = readGitHubPolicyOrNull(this.workspaceRoot),
    key = mirrorEntryKey(policy?.repositories, input);
  return mirrorSetup(
    name === "mirror.adopt" ? "adopt" : "create",
    {
      github: this.github,
      entry: policy?.repositories?.[key] ?? null,
      git: this.mirrorGit ?? mirrorGit,
      identity: instanceIdentity(this.store),
      saveSetting: (_mirror, value, baseBranch) => {
        const file = this.settingsFile(),
          current = file.readGitHubSettings(),
          github = structuredClone(current.github),
          entry = github.repositories?.[key] ?? { baseBranch };
        github.repositories = {
          ...github.repositories,
          [key]: { ...entry, mirror: value },
        };
        file.updateGitHubSettings({ github, expectedHash: current.hash });
        this.configuration?.reload();
      },
      saveMergeMethod: (method) => {
        const file = this.settingsFile(),
          current = file.readGitHubSettings(),
          github = structuredClone(current.github),
          entry = github.repositories?.[key] ?? {};
        // The landing block holds the method (§4.25).
        github.repositories = {
          ...github.repositories,
          [key]: {
            ...entry,
            landing: { ...(entry.landing ?? {}), method },
          },
        };
        file.updateGitHubSettings({ github, expectedHash: current.hash });
        this.configuration?.reload();
      },
    },
    input,
  );
}
// Forward one merged mirror change (RC24.9): the Forward button. The
// person is the signed-in GitHub user, who must pass the actor check.
async function mirrorForwardHandler({ name, input }) {
  if (!this.github?.available?.()) fail("GitHub is not available.", 503);
  const policy = readGitHubPolicyOrNull(this.workspaceRoot),
    record = this.store.get("mirror_forward", String(input.id ?? "")),
    entry = record && policy?.repositories?.[record.repository];
  if (!entry?.mirror) fail("That mirror change is not known.", 404);
  const person = (await this.github.currentUser())?.login;
  if (!person) fail("Sign in to GitHub first.", 401);
  const held = await this.github.permission(
      parseRepository(entry.mirror.source),
      person,
    ),
    check = actorAllowed(entry, person, held?.permission ?? held);
  if (!check.allowed) fail(check.reason, 403);
  // The Forward screen's read shows the exact public diff, title and body
  // and pushes nothing; the Forward button pushes only the hash it saw.
  const look = name === "mirror.forward.review",
    result = await forwardRecord(this.store, this.github, record.id, {
      policy,
      person,
      push: !look,
      review: true,
      seenHash: input.seenHash ?? null,
      files: this.repoFiles(),
      ...(this.forwardGit ? { git: this.forwardGit } : {}),
    });
  if (!result.ok && !result.blocked && !result.changed)
    fail(result.reason, 409);
  return result;
}

async function specprAdoptHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail("Only a person acts on a spec pull request, from the page.", 403);
  const policy = readGitHubPolicyOrNull(this.workspaceRoot);
  if (name === "specpr.adopt") {
    const repository = String(input.repository ?? ""),
      entry = (readCache(store).repositories?.[repository]?.items || []).find(
        (item) => item.number === input.number,
      ),
      found = entry && specPullOf(entry, roleOf(policy, repository));
    if (!found) fail("That pull request is not a spec-only pull request.", 404);
    const receipt = await adoptPull(store, this.github, {
      repository,
      entry,
      spec: found.spec,
      link: "person",
      actor: this.operator,
    });
    if (!receipt) fail("The pull request holds no spec files to review.", 409);
    return { id: receipt.id, spec: receipt.spec };
  }
  if (name === "specpr.reject") return rejectPull(store, this.github, input);
  if (name === "specpr.requestChanges")
    return requestChanges(store, this.github, input);
  fail(`Unknown operation ${name}.`, 404);
}
// The driver's side of worker accepts (R90.4): offer a task to a worker
// login, and reserve and acknowledge the requests. A person's own act at
// this machine; no session or MCP caller.
async function specOfferHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail("Only a person drives worker offers and grants.", 403);
  const authority = await specAuthority(
      store,
      {
        github: this.github,
        workspaceRoot: this.workspaceRoot,
        actor: this.operator,
      },
      input.planId,
    ),
    driver = driverIdOf(store, input.planId);
  if (!driver) fail("Take over the spec first.", 409);
  const driving = {
    driver,
    owner: authority.owner,
    login: authority.login,
    spec: input.planId,
  };
  const held = {
    ...driving,
    github: this.github,
    journal: authority.journal,
    options: authority.options,
    grants: input.grants,
  };
  if (name === "spec.grants.status")
    return grantStatus(authority.journal, authority.options, {
      staleAfter: grantStaleMs(
        loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config?.workers
          ?.grantStaleAfter,
      ),
    });
  if (name === "spec.grants.release")
    return releaseGrant({
      ...held,
      task: input.task,
      by: { kind: "person" },
    });
  if (name === "spec.grants") {
    // Carry or settle what exists first, then answer new requests.
    const reconciled = await reconcileGrants(held);
    return {
      reconciled,
      ...(await reserveGrants({
        ...held,
        base: input.base,
        ...(input.cap ? { cap: input.cap } : {}),
      })),
    };
  }
  const task = store.read().tasks.find((t) => t.id === input.task);
  if (!task) fail("Task not found.", 404);
  return publishOffer(
    authority.journal,
    {
      ...driving,
      task: task.id,
      definition: taskDefinition({
        id: task.id,
        title: task.title,
        acceptance: task.acceptance ?? null,
      }),
      worker: input.worker,
      ref: {
        repository: input.repository,
        branch: input.branch,
        commit: input.commit,
      },
      base: input.base,
    },
    authority.options,
  );
}
// Reanchor a held journal and Resume after it (R102.26, task 56.15):
// each a person's own act; reanchor previews unless `apply`.
function specJournalReanchorHandler({ name, input, context }) {
  const store = this.store;

  if (context.caller || context.mcp)
    fail("Only a person reanchors or resumes a spec journal.", 403);
  const authority = {
    github: this.github,
    workspaceRoot: this.workspaceRoot,
    actor: this.operator,
  };
  return name === "spec.journal.reanchor"
    ? reanchorSpec(store, authority, {
        planId: input.planId,
        held: input.held,
        tail: input.tail,
        apply: input.apply === true,
      })
    : resumeSpec(store, authority, {
        planId: input.planId,
        tail: input.tail,
      });
}

export const entries = [
  // The spec driver (§6.10). Status reads everywhere; moving the role or
  // changing this computer's settings is a person's, on the page or CLI.
  {
    name: "driver.status",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return driverStatus(store, input);
    },
  },

  {
    name: "driver.takeover.preview",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return takeoverPreview(store, input);
    },
  },

  {
    name: "driver.settings.update",
    class: "protect",
    policy: person("Only a person changes this computer's driver settings."),
    handler({ input }) {
      const store = this.store;

      const ctx = driverContext(store);
      if (!ctx) fail("This workspace has no driver settings.", 409);
      updateMachineSettings(store, ctx.settingsFile, input);
      return driverStatus(store);
    },
  },

  {
    name: "driver.handoff",
    class: "protect",
    policy: person("Only a person hands off a spec's driver."),
    handler({ input }) {
      const store = this.store;
      return handOffDriver(store, this.github, input);
    },
  },

  {
    name: "driver.away.decide",
    class: "protect",
    policy: person("Only a person decides an away task."),
    handler({ input }) {
      const store = this.store;
      return decideAway(store, input);
    },
  },
  {
    name: "driver.takeover",
    class: "protect",
    policy: person("Only a person takes over a spec's driver."),
    handler: driverTakeoverHandler,
  },
  {
    name: "driver.forceTakeover",
    class: "protect",
    policy: person("Only a person takes over a spec's driver by force."),
    handler: driverTakeoverHandler,
  },
  {
    name: "mirror.adopt",
    class: "protect",
    policy: person("Only a person applies mirror setup.", (input) =>
      Boolean(input?.confirm),
    ),
    handler: mirrorAdoptHandler,
  },
  {
    name: "mirror.create",
    class: "protect",
    policy: person("Only a person applies mirror setup.", (input) =>
      Boolean(input?.confirm),
    ),
    handler: mirrorAdoptHandler,
  },
  {
    name: "mirror.forward",
    class: "protect",
    policy: person("Only a person forwards a change to the public repository."),
    handler: mirrorForwardHandler,
  },
  {
    name: "mirror.forward.review",
    class: "protect",
    policy: person("Only a person reviews a change before it is forwarded."),
    handler: mirrorForwardHandler,
  },
  // Spec pull requests (R107): the view reads the store only.
  {
    name: "specpr.view",
    class: "observe",
    policy: notOnMcp("App page rendering only."),
    handler({}) {
      const store = this.store;
      return { items: specPullView(store) };
    },
  },
  {
    name: "specpr.adopt",
    class: "protect",
    policy: person("Only a person presses Review as spec."),
    handler: specprAdoptHandler,
  },
  {
    name: "specpr.reject",
    class: "protect",
    policy: person("Only a person rejects a spec pull request."),
    handler: specprAdoptHandler,
  },
  {
    name: "specpr.requestChanges",
    class: "protect",
    policy: person("Only a person requests changes on a spec pull request."),
    handler: specprAdoptHandler,
  },
  // Publish issue (R102.2): a person's explicit act, never part of approval.
  {
    name: "spec.publish",
    class: "execute",
    policy: person("Only a person publishes a spec issue."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person publishes a spec issue.", 403);
      const { journal: _journal, ...published } = await publishSpec(store, {
        github: this.github,
        workspaceRoot: this.workspaceRoot,
        identity: planningIdentity(this.workspaceRoot),
        planId: input.planId,
        repository: input.repository,
        actor: this.operator,
      });
      return published;
    },
  },
  // Take over a published spec's journal (R102.13, task 42.5): a person's
  // own act; it writes the next generation and keeps the driver id here.
  // Set up a repository for landing (R89, task 42.7): a preview, applied
  // only with `confirm` (`--yes`) by a person.
  {
    name: "repository.setup",
    class: "execute",
    policy: person("Only a person applies repository setup.", (input) =>
      Boolean(input?.confirm),
    ),
    handler({ input, context }) {
      const store = this.store;

      if (input.confirm && (context.caller || context.mcp))
        fail("Only a person applies repository setup.", 403);
      if (!this.github?.available?.())
        fail("Repository setup needs GitHub; run gh auth login.", 503);
      // The checks and the base branch are the repository's own settings.
      const wanted = this.githubPolicy().repositories?.[input.repository];
      return repositorySetup(
        store,
        this.github,
        {
          ...input,
          checks: wanted?.requiredChecks,
          base: wanted?.baseBranch ?? undefined,
        },
        {
          writeRepository: (repository) => {
            this.configuration?.assertWritable();
            this.configuration?.updateExecutionRepository(repository);
          },
          // The repository's landing block holds the mode (§4.25).
          writeLanding: (repository, mode) => {
            const file = this.settingsFile(),
              current = file.readGitHubSettings(),
              github = structuredClone(current.github),
              entry = github.repositories?.[repository] ?? {};
            github.repositories = {
              ...github.repositories,
              [repository]: {
                ...entry,
                landing: { ...(entry.landing ?? {}), mode },
              },
            };
            file.updateGitHubSettings({ github, expectedHash: current.hash });
            this.configuration?.reload();
          },
        },
      );
    },
  },
  {
    name: "spec.offer",
    class: "execute",
    policy: person("Only a person offers a task to a worker."),
    handler: specOfferHandler,
  },
  {
    name: "spec.grants",
    class: "execute",
    policy: person("Only a person reserves worker accepts."),
    handler: specOfferHandler,
  },
  {
    name: "spec.grants.release",
    class: "execute",
    policy: person("Only a person releases a worker accept."),
    handler: specOfferHandler,
  },
  {
    name: "spec.grants.status",
    class: "execute",
    policy: person("Only a person reads worker accepts."),
    handler: specOfferHandler,
  },

  {
    name: "spec.takeover",
    class: "execute",
    policy: person("Only a person takes over a spec."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person takes over a spec.", 403);
      return takeOverSpec(
        store,
        {
          github: this.github,
          workspaceRoot: this.workspaceRoot,
          actor: this.operator,
        },
        input.planId,
      );
    },
  },
  {
    name: "spec.journal.reanchor",
    class: "execute",
    policy: person("Only a person reanchors a spec journal."),
    handler: specJournalReanchorHandler,
  },
  {
    name: "spec.journal.resume",
    class: "execute",
    policy: person("Only a person resumes a spec journal."),
    handler: specJournalReanchorHandler,
  },

  {
    name: "planning.publish",
    class: "protect",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return publishPlanningPullRequest(store, this.github, input);
    },
  },

  {
    name: "planning.reconcile",
    class: "protect",
    policy: routed,
    handler({}) {
      return this.reconcilePlanningPullRequests();
    },
  },
];
