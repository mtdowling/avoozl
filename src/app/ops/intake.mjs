// Operations of one feature: name, class, MCP policy and handler.
import { openFixJournal } from "../fix.mjs";
import { withWorkLock } from "../git.mjs";
import { startGitHubItem } from "../github-intake.mjs";
import { readGitHubPolicyOrNull } from "../github-policy.mjs";
import {
  confirmSnapshot,
  declaredSources,
  editSource,
  githubReads,
  intakeTab,
  listItems,
  sourceCounts,
  sourceMap,
  sourceRow as sourceRowOf,
  startByPerson,
  submitItems,
  viewItem,
} from "../intake.mjs";
import { requestNewPlan } from "../new-plan.mjs";
import { queueNotifications } from "../notifications.mjs";
import { pickTemplate } from "../plugins.mjs";
import { reviewChats } from "../pr-review.mjs";
import { handOff, readCrews } from "../radar-handoff.mjs";
import { namespaceOf, planThisRequest } from "../radar-plan-me.mjs";
import { fail } from "../store.mjs";
import { WORKSPACE_LOCK } from "../tick.mjs";
import {
  handoffReceipts,
  readCache,
  refreshUntriaged,
  untriagedView,
} from "../untriaged.mjs";
import { workspaceRepositories } from "../workspace-repositories.mjs";
import { person, routed } from "../operation-policy.mjs";

async function intakeDeliverHandler({ name, input }) {
  const store = this.store;

  const action = name === "intake.deliver" ? "deliver" : "plan",
    policy = readGitHubPolicyOrNull(this.workspaceRoot);
  // A GitHub item (R102.19): its two writes need the GitHub client.
  // Deliver this is a fix, which lands through its own journal.
  if (input.source === "github")
    return withWorkLock(store, WORKSPACE_LOCK, async () => {
      const started = await startGitHubItem(store, this.github, policy, {
        ...input,
        action,
      });
      if (action === "deliver")
        await openFixJournal(
          store,
          { workspaceRoot: this.workspaceRoot, actor: this.operator },
          started.taskId,
        );
      return started;
    });
  return withWorkLock(store, WORKSPACE_LOCK, async () =>
    startByPerson(store, sourceMap(this.pluginOptions, store), policy, {
      ...input,
      action,
    }),
  );
}

function intakeSourceAddHandler({ name, input }) {
  if (!this.pluginOptions.workspaceRoot)
    fail("Intake sources need a workspace root.", 409);
  return {
    sources: editSource(this.pluginOptions, {
      ...input,
      remove: name === "intake.source.remove",
    }).map(({ id, scope, entry, error }) => ({ id, scope, entry, error })),
  };
}

export const entries = [
  // The Untriaged list (§8.5): cached GitHub items no rule, triage label,
  // or task covers. `refresh` reads GitHub first (Check now); read only.
  {
    name: "untriaged.view",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      const store = this.store;

      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        tasks = this.read().tasks;
      if (input.refresh === true && policy?.mode && this.github?.available?.())
        await refreshUntriaged(store, this.github, policy, tasks, {
          force: true,
          namespace: namespaceOf(this.workspaceRoot),
        });
      // Check now also polls each plugin source once (R50.16).
      if (input.refresh === true && this.plugins) await this.pollNow();
      // The Intake tab: GitHub's Untriaged list plus every other source's
      // items (design §4.12, §8.5).
      const tab = intakeTab(
        untriagedView(
          policy,
          tasks,
          readCache(store),
          Date.now(),
          handoffReceipts(store),
          reviewChats(store),
        ),
        store,
        declaredSources(this.pluginOptions, store),
      );
      return tab;
    },
  },
  // Incoming items (§4.12). Submit runs the pipeline at once, under the
  // tick's lock; list and view only read.
  {
    name: "intake.submit",
    class: "execute",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return withWorkLock(store, WORKSPACE_LOCK, async () => {
        const { notify, ...result } = submitItems(
          store,
          sourceMap(this.pluginOptions, store),
          readGitHubPolicyOrNull(this.workspaceRoot),
          input,
        );
        queueNotifications(store, notify);
        return result;
      });
    },
  },

  {
    name: "intake.list",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return listItems(store, input);
    },
  },

  {
    name: "intake.view",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return viewItem(store, input);
    },
  },

  {
    name: "intake.sources",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;

      const counts = sourceCounts(store),
        none = { total: 0, untriaged: 0, lastAt: null },
        policy = readGitHubPolicyOrNull(this.workspaceRoot),
        reads = githubReads(store),
        same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
      return {
        sources: declaredSources(this.pluginOptions, store).map(
          ({ id, scope, entry, error, source }) => {
            // Who counts is the repository's setting, shown here read only.
            const configured = source
                ? Object.entries(policy?.repositories || {}).find(
                    ([repository]) => same(repository, source.repository),
                  )?.[1]
                : null,
              who = configured
                ? {
                    allowedActors: configured.allowedActors,
                    minimumPermission: configured.minimumPermission,
                  }
                : null;
            // A GitHub source (§4.39): its repository's read, and the Issue
            // Radar escalation label its Triage rows open first with.
            if (source?.via === "github") {
              const read = reads.find((r) =>
                same(r.repository, source.repository),
              );
              return {
                id,
                scope,
                entry,
                error,
                who,
                state: read
                  ? { cursor: null, readAt: read.checkedAt, error: read.error }
                  : null,
                items: null,
                escalationLabel: configured?.crewLabels?.needsHuman ?? null,
              };
            }
            return {
              id,
              scope,
              entry,
              error,
              who,
              state: id ? sourceRowOf(store, `source:${id}`) : null,
              items: (id && counts.get(id)) || none,
            };
          },
        ),
        github: {
          mode: policy?.mode ?? null,
          repositories: reads,
          items: counts.get("github") || none,
        },
      };
    },
  },

  {
    name: "intake.confirm",
    class: "protect",
    policy: person("Only a person confirms an incoming item's changed text."),
    handler({ input }) {
      const store = this.store;
      return withWorkLock(store, WORKSPACE_LOCK, async () =>
        confirmSnapshot(store, input),
      );
    },
  },
  {
    name: "intake.deliver",
    class: "protect",
    policy: person("Only a person presses Deliver this on an incoming item."),
    handler: intakeDeliverHandler,
  },
  {
    name: "intake.plan",
    class: "protect",
    policy: person("Only a person presses Plan this on an incoming item."),
    handler: intakeDeliverHandler,
  },
  {
    name: "intake.source.add",
    class: "protect",
    policy: person("Only a person changes intake sources."),
    handler: intakeSourceAddHandler,
  },
  {
    name: "intake.source.remove",
    class: "protect",
    policy: person("Only a person changes intake sources."),
    handler: intakeSourceAddHandler,
  },
  // Send to Issue Radar (§8.5, R52): the repository's crews, then the
  // label write. The app backend lets only an owner session hand off.
  {
    name: "untriaged.crews",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      const store = this.store;

      if (!input.repository) fail("Name one repository as owner/repository.");
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        repository = Object.keys(policy?.repositories || {}).find(
          (entry) => entry === input.repository,
        );
      if (!repository)
        fail(`${input.repository} is not a registered repository.`, 404);
      // A public repository's dialog says to add the content hook first.
      return {
        ...(await readCrews(this.crewReader, repository)),
        public: store.get("github_repositories", repository)?.private === false,
      };
    },
  },
  // Plan this on a GitHub Intake row of a Radar-coded repository: the
  // planner chat's seed, with the issue recorded as the plan's source.
  {
    name: "untriaged.plan",
    class: "protect",
    policy: person("Only a person presses Plan this on an issue."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person starts planning, from the Avoozl page.", 403);
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        { fields, source } = await planThisRequest(
          this.github,
          policy,
          untriagedView(
            policy,
            this.read().tasks,
            readCache(store),
            Date.now(),
            handoffReceipts(store),
          ),
          input,
        );
      const repositories = workspaceRepositories(store).filter(
          (repo) => !repo.planning,
        ),
        // The issue names its GitHub repository; the plan names the
        // workspace repository that holds it, whose id is its own.
        workspaceId = (github) =>
          repositories.find(
            (repo) =>
              repo.id === github ||
              String(repo.github ?? "").toLowerCase() === github.toLowerCase(),
          )?.id ?? github;
      return requestNewPlan(
        store,
        { ...fields, repositories: fields.repositories.map(workspaceId) },
        {
          readSpec: (spec) => this.readSpec(spec),
          repositories,
          specRoot: this.specRoots()[0] || null,
          template: (ref) => pickTemplate(this.pluginOptions, ref),
        },
        source,
      );
    },
  },

  {
    name: "untriaged.handoff",
    class: "protect",
    policy: person("Only a person sends issues to Issue Radar."),
    handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail(
          "Only a person sends issues to Issue Radar, from the Avoozl page.",
          403,
        );
      return handOff(
        store,
        this.github,
        readGitHubPolicyOrNull(this.workspaceRoot),
        this.read().tasks,
        input,
        { reader: this.crewReader },
      );
    },
  },
];
