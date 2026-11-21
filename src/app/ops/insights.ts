// Insights (simplify §D13): the page's home view and `avoozl insights`, and
// the saved retros the avoozl-retro skill writes. Every read here is local:
// the store, the telemetry tables and git; no GitHub call.
import { routed } from "../api/operation-policy.mjs";
import { landingId } from "../flow/flow-line.mjs";
import { openStops } from "../flow/flow.mjs";
import { readGitHubPolicyOrNull } from "../github/github-policy.mjs";
import {
  burndown,
  insightsDays,
  telemetryInsights,
  telemetryNames,
} from "../insights/insights.ts";
import { listRetros, readRetro, saveRetro } from "../insights/retros.ts";
import { specsBranch } from "../specs/specs-branch.mjs";
import { fail } from "../store/store.ts";
import { loopFile, machineLoop } from "../tick/loop.mjs";
import { readDeliveryPolicy } from "../tick/tick.mjs";
import { claimsView } from "../workers/claims.mjs";
import { nextView } from "../workers/runner.mjs";

// The line watch's last read of each repository's landing branch: passing
// when every declared check was green on the head it read, stopped while a
// stop is open, else unknown.
function mainChecks(store: any) {
  const stops = openStops(store),
    repositories = store.list("repositories").map((repository: any) => {
      const record = store.get("flow_records", landingId(repository.id)),
        green = Object.values(record?.green ?? {});
      const state = stops.some(
        (stop: any) => stop.repositoryId === repository.id,
      )
        ? "stopped"
        : record?.head &&
            green.length &&
            green.every((head) => head === record.head)
          ? "passing"
          : "unknown";
      return {
        repository: repository.id,
        state,
        head: record?.head ?? null,
        checkedAt: record?.checkedAt ?? null,
      };
    });
  const state = stops.length
    ? "stopped"
    : repositories.length &&
        repositories.every((r: any) => r.state === "passing")
      ? "passing"
      : "unknown";
  return { state, repositories };
}

const requireRoot = (operations: any) => {
  if (!operations.workspaceRoot)
    fail("This workspace has no folder for saved retros.", 409);
  return operations.workspaceRoot;
};

export const entries = [
  // The Insights view: the top strip, the burndown of each spec and the
  // task timing charts. {days?: 7|30|90, spec?, repo?}
  {
    name: "insights.view",
    class: "observe",
    github: "check-in",
    policy: routed,
    async handler(this: any, { input }: any) {
      const store = this.store,
        filter = {
          days: insightsDays(input?.days),
          spec: input?.spec || null,
          repo: input?.repo || null,
          now: Date.now(),
        };
      const next = nextView(store, {
          policy: readDeliveryPolicy(this.workspaceRoot),
          github: readGitHubPolicyOrNull(this.workspaceRoot) as any,
        }),
        needsYou = (await this.perform("conflicts.view", {})).items.length;
      let homes: any[] = [];
      try {
        homes = this.specHomes().homes;
      } catch {
        // No spec folders in this mode: no burndown.
      }
      const repositories = store.list("repositories"),
        repoRoot = filter.repo
          ? repositories.find((r: any) => r.id === filter.repo)?.root
          : null,
        specs = homes
          .filter(({ spec }) => !filter.spec || spec.name === filter.spec)
          .filter(({ root }) => !filter.repo || root === repoRoot)
          .map(({ root, spec }) => ({
            name: spec.name,
            root,
            files: spec.files ?? {},
          })),
        names = telemetryNames(store.db);
      return {
        range: { days: filter.days, spec: filter.spec, repo: filter.repo },
        strip: {
          needsYou,
          inFlight: claimsView(store).length,
          ready: next.ready.length,
          main: mainChecks(store),
          loop: Boolean(machineLoop(loopFile(this.configDirectory))),
        },
        burndown: await burndown(specs, filter, (root) =>
          specsBranch(store, this.workspaceRoot, root),
        ),
        ...telemetryInsights(store.db, filter),
        filters: {
          specs: [
            ...new Set([...homes.map(({ spec }) => spec.name), ...names.specs]),
          ].sort(),
          repos: [
            ...new Set([...repositories.map((r: any) => r.id), ...names.repos]),
          ].sort(),
        },
      };
    },
  },
  // Save one retro report as Markdown under .avoozl/local/retros/: the
  // avoozl-retro skill's only write. {scope, text}
  {
    name: "retro.save",
    class: "draft",
    github: "check-in",
    policy: routed,
    handler(this: any, { input }: any) {
      return saveRetro(requireRoot(this), input);
    },
  },
  // The saved retros, newest first.
  {
    name: "retro.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: any) {
      return listRetros(requireRoot(this));
    },
  },
  // One saved retro with its Markdown. {name}
  {
    name: "retro.read",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: any, { input }: any) {
      return readRetro(requireRoot(this), input);
    },
  },
];
