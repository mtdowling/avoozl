// One landing block per repository and one conflict count (design §4.25,
// R80.1, R87.1, R87.6): the block decides, and today's two workspaces keep
// their behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPolicy, shipMode } from "../delivery.mjs";
import { mergeMethodOf, normalizeGitHubPolicy } from "../github-policy.mjs";
import { applyLandingModes, landingSettings } from "../landing-config.mjs";
import { effectiveShip } from "../merge-path.mjs";

// A store with only the repository rows these readers touch.
function repositoryStore(...repositories) {
  const rows = new Map(repositories.map((p) => [p.id, { ...p }]));
  return {
    get: (table, id) => (table === "repositories" ? rows.get(id) : undefined),
    list: (table) => (table === "repositories" ? [...rows.values()] : []),
    put: (table, row) => rows.set(row.id, { ...row }),
  };
}
const repositoryOf = (config, name) =>
  normalizeGitHubPolicy(config.github).repositories[name];

test("Avoozl's own repository keeps pr, auto-merge, squash and 2 rounds", () => {
  // Its .avoozl.json sets none of these keys; the repository row holds `pr`.
  const config = {
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
    autoMerge: true,
    method: "squash",
    mergeBatch: "auto",
    commitPrefix: "",
    maxAttempts: 2,
  });
  const task = { id: "t", repository: "avoozl" };
  assert.equal(shipMode(deliveryPolicy(config), task, store), "auto-merge");
  assert.deepEqual(applyLandingModes(store, config), []);
  assert.equal(store.get("repositories", "avoozl").landing, "pr");
});

test("Nupp keeps auto-merge and core-dev landing", () => {
  const config = {
      version: 1,
      delivery: {},
      github: {
        repositories: {
          "nupp-lang/nupp-planning": { baseBranch: "core-dev" },
        },
      },
    },
    repository = {
      id: "nupp",
      github: "nupp-lang/nupp-planning",
      baseBranch: "core-dev",
      landing: "direct",
    },
    store = repositoryStore(repository),
    settings = repositoryOf(config, "nupp-lang/nupp-planning");
  assert.deepEqual(landingSettings(config, repository.github, repository), {
    mode: "direct",
    autoMerge: true,
    method: "squash",
    mergeBatch: "auto",
    commitPrefix: "",
    maxAttempts: 2,
  });
  assert.equal(
    shipMode(deliveryPolicy(config), { repository: "nupp" }, store),
    "auto-merge",
  );
  assert.equal(effectiveShip(settings), "auto-merge");
  assert.equal(mergeMethodOf(settings), "SQUASH");
});

test("the block sets each value, and the older keys are refused", () => {
  const config = {
      delivery: {},
      github: {
        repositories: {
          "o/app": {
            baseBranch: "main",
            landing: { mode: "pr", autoMerge: false, method: "merge" },
            conflicts: { maxAttempts: 3 },
          },
        },
      },
    },
    repository = { id: "app", github: "o/app", landing: "off" },
    store = repositoryStore(repository);
  assert.deepEqual(landingSettings(config, "o/app", repository), {
    mode: "pr",
    autoMerge: false,
    method: "merge",
    mergeBatch: "auto",
    commitPrefix: "",
    maxAttempts: 3,
  });
  const settings = repositoryOf(config, "o/app");
  assert.equal(mergeMethodOf(settings), "MERGE");
  assert.equal(effectiveShip(settings), "manual");
  assert.equal(
    shipMode(deliveryPolicy(config), { repository: "app" }, store),
    "manual",
  );
  // A task's pin still wins over the repository.
  assert.equal(
    shipMode(
      deliveryPolicy(config),
      { repository: "app", ship: "auto-merge" },
      store,
    ),
    "auto-merge",
  );
  // The tick copies the mode onto the checkout's repository row.
  assert.deepEqual(
    applyLandingModes(store, config).map((p) => p.landing),
    ["pr"],
  );
  assert.equal(store.get("repositories", "app").landing, "pr");

  // Nearby inputs: each older spelling the block replaced.
  assert.throws(
    () => deliveryPolicy({ delivery: { ship: "manual" } }),
    /delivery\.ship/,
  );
  assert.throws(
    () =>
      deliveryPolicy({
        delivery: { repositories: { app: { ship: "manual" } } },
      }),
    /delivery\.repositories\.app/,
  );
  assert.throws(
    () =>
      normalizeGitHubPolicy({
        repositories: { "o/app": { merge: { method: "merge" } } },
      }),
    /merge/,
  );
  assert.throws(
    () =>
      normalizeGitHubPolicy({
        repositories: { "o/app": { landing: { mode: "train" } } },
      }),
    /landing\.mode must be direct, pr or off/,
  );
});

test("the block is validated, and 0 tries asks at once", () => {
  const entry = (more) => ({
    repositories: { "o/app": { baseBranch: "main", ...more } },
  });
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { mode: "fast" } })),
    /landing\.mode must be direct, pr or off/,
  );
  assert.throws(
    () => normalizeGitHubPolicy(entry({ landing: { autoMerge: "yes" } })),
    /landing\.autoMerge must be true or false/,
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
    entry({ landing: { method: "merge", autoMerge: false } }),
  );
  assert.deepEqual(normalizeGitHubPolicy(once).repositories, once.repositories);
});
