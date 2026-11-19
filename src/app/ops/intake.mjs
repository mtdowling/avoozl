// Operations of one feature: name, class, MCP policy and handler.
import { openFixJournal } from "../fix.mjs";
import { withWorkLock } from "../git.mjs";
import { startGitHubItem } from "../github-intake.mjs";
import { readGitHubPolicyOrNull } from "../github-policy.mjs";
import { parseIssueReference } from "../issue-reference.mjs";
import {
  confirmSnapshot,
  declaredSources,
  editSource,
  listItems,
  sourceCounts,
  sourceMap,
  sourceRow as sourceRowOf,
  startByPerson,
  submitItems,
  viewItem,
} from "../intake.mjs";
import { fail } from "../store.mjs";
import { WORKSPACE_LOCK } from "../tick.mjs";
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
  // Incoming items (§4.12). Submit makes each item a GitHub issue at once
  // (§4.42); list and view only read.
  {
    name: "intake.submit",
    class: "execute",
    policy: routed,
    handler({ input }) {
      return submitItems(
        sourceMap(this.pluginOptions, this.store),
        readGitHubPolicyOrNull(this.workspaceRoot),
        this.github,
        input,
      );
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
            // A GitHub source (§4.39): the triage agent reads it.
            if (source?.via === "github")
              return { id, scope, entry, error, who, state: null, items: null };
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
          repositories: [],
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
];
