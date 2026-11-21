// One landing block per repository and one conflict count (design §4.25,
// R80.1, R87.1, R87.6): the block decides, and today's two workspaces keep
// their behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github/github-policy.ts";
import {
  applyLandingModes,
  type LandingConfig,
  landingSettings,
} from "../landing/landing-config.ts";
import type { Store } from "../store/store.ts";

interface RepositoryRow {
  id: string;
  github?: string;
  landing?: string;
}
// A store with only the repository rows these readers touch: get, list and
// put, so it stands in for a Store only there.
function repositoryStore(...repositories: RepositoryRow[]) {
  const rows = new Map(repositories.map((p) => [p.id, { ...p }]));
  return {
    get: (table: string, id: string) =>
      table === "repositories" ? (rows.get(id) ?? null) : null,
    list: (table: string) =>
      table === "repositories" ? [...rows.values()] : [],
    put: (table: string, row: RepositoryRow) => rows.set(row.id, { ...row }),
  };
}

test("Avoozl's own repository keeps pr, draft pull requests, squash and 2 rounds", () => {
  // Its .avoozl.json sets none of these keys; the repository row holds `pr`.
  const config: LandingConfig & { version: number; repository: object } = {
      version: 1,
      repository: {
        id: "avoozl",
        roles: ["planning", "code"],
        baseBranch: "main",
      },
    },
    repository = { id: "avoozl", github: "mtdowling/avoozl", landing: "pr" },
    store = repositoryStore(repository);
  assert.deepEqual(landingSettings(config, "mtdowling/avoozl", repository), {
    mode: "pr",
    pr: "draft",
    method: "squash",
    mergeBatch: "auto",
    commitPrefix: "",
    maxAttempts: 2,
  });
  assert.deepEqual(applyLandingModes(store as unknown as Store, config), []);
  assert.equal(store.get("repositories", "avoozl")?.landing, "pr");
});

test("the block is validated, and 0 tries asks at once", () => {
  const entry = (more: Record<string, unknown>) => ({
    repositories: { "o/app": { baseBranch: "main", ...more } },
  });
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { mode: "fast" } })),
    /landing\.mode must be direct, pr or off/,
  );
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { pr: "yes" } })),
    /landing\.pr must be draft, ready or auto/,
  );
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { autoMerge: true } })),
    /Unknown setting/,
  );
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { method: "rebase" } })),
    /landing\.method must be squash or merge/,
  );
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { ship: "manual" } })),
    /Unknown setting/,
  );
  assert.equal(
    normalizeGitHubPolicy(entry({ conflicts: { maxAttempts: 0 } }))
      .repositories["o/app"].conflicts.maxAttempts,
    0,
  );
  // A normalized policy normalizes to itself.
  const once = normalizeGitHubPolicy(
    entry({ landing: { method: "merge", pr: "auto" } }),
  );
  assert.deepEqual(normalizeGitHubPolicy(once).repositories, once.repositories);
});
