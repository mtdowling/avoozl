// Operations of one feature: name, class, MCP policy and handler.
import { withWorkLock } from "../git/git.ts";
import { readGitHubPolicyOrNull } from "../github/github-policy.ts";
import { parseIssueReference } from "../tasks/issue-reference.ts";
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
} from "../intake/intake.ts";
import { fail } from "../store/store.ts";
import { WORKSPACE_LOCK } from "../tick/tick.ts";
import { routed, audited, destructive } from "../api/operation-policy.ts";
import { requireInput } from "../api/operation-support.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

async function intakeDeliverHandler(
  this: Operations,
  { name, input }: OperationCall,
) {
  const store = this.store;

  requireInput(input, ["source", "id"]);
  const action = name === "intake.deliver" ? "deliver" : "plan",
    policy = readGitHubPolicyOrNull(this.workspaceRoot);
  // A GitHub issue becomes a task by its labels (labeled-issues.mjs).
  if (input.source === "github")
    fail(
      "A GitHub issue starts as a task when a writer labels it for this runner (labels.require) and assigns it; Avoozl reads it on the next pass.",
      409,
    );
  return withWorkLock(store, WORKSPACE_LOCK, async () =>
    startByPerson(store, sourceMap(this.pluginOptions, store), policy, {
      ...input,
      action,
    }),
  );
}

function intakeSourceAddHandler(
  this: Operations,
  { name, input }: OperationCall,
) {
  if (!this.pluginOptions.workspaceRoot)
    fail("Intake sources need a workspace root.", 409);
  requireInput(input, ["id"]);
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
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
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
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return listItems(store, input);
    },
  },

  {
    name: "intake.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return viewItem(store, input);
    },
  },

  {
    name: "intake.sources",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;

      const counts = sourceCounts(store),
        none = { total: 0, untriaged: 0, lastAt: null },
        policy = readGitHubPolicyOrNull(this.workspaceRoot),
        same = (a: unknown, b: unknown) =>
          String(a).toLowerCase() === String(b).toLowerCase();
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
            // A GitHub source (§4.39): the open items read fills it.
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
    github: "check-in",
    policy: audited,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return withWorkLock(store, WORKSPACE_LOCK, async () =>
        confirmSnapshot(store, input),
      );
    },
  },
  {
    name: "intake.deliver",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: intakeDeliverHandler,
  },
  {
    name: "intake.plan",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: intakeDeliverHandler,
  },
  {
    name: "intake.source.add",
    class: "protect",
    github: "check-in",
    policy: audited,
    handler: intakeSourceAddHandler,
  },
  {
    name: "intake.source.remove",
    class: "protect",
    github: "check-in",
    policy: destructive,
    handler: intakeSourceAddHandler,
  },
];
