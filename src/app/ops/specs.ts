// Operations of one feature: name, class, MCP policy and handler.
import { planningIdentity } from "../github/github-marker.ts";
import { publishSpec } from "../specs/spec-publication.ts";
import { fail } from "../store/store.ts";
import { publishPlanningPullRequest } from "../workspace/workspace-repository.ts";
import { notOnMcp, routed, audited } from "../api/operation-policy.ts";
import fs from "node:fs";
import path from "node:path";
import { withGraphBlock } from "../specs/graph.ts";
import { lintSpec } from "../specs/spec-plans.ts";
import { specTasks } from "../specs/spec-tasks.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

export const entries = [
  // Spec lint on the folders on disk: one spec, or every
  // spec. Reads only.
  {
    name: "spec.lint",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const names = input?.spec
        ? [String(input.spec)]
        : this.specList().items.map((item) => item.name);
      return {
        specs: names.map((name) => {
          const spec = this.readSpec(name),
            result = lintSpec({
              spec: { ...spec, linked: this.linkedSpecs(spec) },
              plan: { id: name },
              data: { repositories: this.store.list("repositories") },
            });
          return {
            name,
            counts: result.counts,
            diagnostics: result.diagnostics,
          };
        }),
      };
    },
  },

  // `avoozl graph SPEC --write`: make the graph block again, at the end of
  // the spec's tasks.md. Writes that one file in the checkout.
  {
    name: "spec.graph.write",
    class: "draft",
    github: "check-in",
    policy: notOnMcp(
      "A skill writes the graph block with the CLI: avoozl graph SPEC --write.",
    ),
    handler(this: Operations, { input }: OperationCall) {
      if (!input?.spec) fail("Name the spec: avoozl graph SPEC --write.");
      const spec = this.readSpec(input.spec);
      if (!spec.exists) fail(`No spec folder ${input.spec}.`, 404);
      const found = specTasks(spec.files, spec.flat);
      if (!found) fail("The spec has no tasks to draw.", 409);
      const file = path.join(spec.root, spec.folder ?? "", found.file),
        before = spec.files[found.file],
        after = withGraphBlock(
          spec.name,
          before,
          this.linkedSpecs(spec),
          found.text,
        );
      if (after !== before) fs.writeFileSync(file, after);
      return { spec: spec.name, file, changed: after !== before };
    },
  },
  // Publish issue (R102.2): a person's explicit act, never part of approval.
  {
    name: "spec.publish",
    class: "execute",
    github: "spec-issues",
    policy: audited,
    async handler(this: Operations, { input, context }: OperationCall) {
      const store = this.store;

      return publishSpec(store, {
        github: this.github,
        identity: planningIdentity(this.workspaceRoot),
        planId: input.planId,
        repository: input.repository,
      });
    },
  },
  {
    name: "planning.publish",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return publishPlanningPullRequest(store, this.github, input);
    },
  },

  {
    name: "planning.reconcile",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      return this.reconcilePlanningPullRequests();
    },
  },
];
