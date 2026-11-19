// One landing block per repository and one conflict count (design §4.25,
// R80.1, R87.1, R87.6): the block wins, older keys still load silently, and
// today's two workspaces keep their behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPolicy, shipMode } from "../delivery.mjs";
import { mergeMethodOf, normalizeGitHubPolicy } from "../github-policy.mjs";
import { applyLandingModes, landingSettings } from "../landing-config.mjs";
import { effectiveShip } from "../radar-merge-path.mjs";

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
    maxAttempts: 2,
  });
  const task = { id: "t", repository: "avoozl" };
  assert.equal(shipMode(deliveryPolicy(config), task, store), "auto-merge");
  assert.deepEqual(applyLandingModes(store, config), []);
  assert.equal(store.get("repositories", "avoozl").landing, "pr");
});

test("Nupp keeps its workspace delivery.ship and core-dev landing", () => {
  const config = {
      version: 1,
      delivery: { ship: "auto-merge" },
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
    maxAttempts: 2,
  });
  assert.equal(
    shipMode(deliveryPolicy(config), { repository: "nupp" }, store),
    "auto-merge",
  );
  assert.equal(
    effectiveShip(config.delivery, repository.github, settings),
    "auto-merge",
  );
  assert.equal(mergeMethodOf(settings), "SQUASH");
});

test("older keys map to the block, and the block wins over them", () => {
  const old = {
      delivery: {
        ship: "auto-merge",
        repositories: { app: { ship: "manual" } },
      },
      landing: { conflictRounds: 1 },
      github: {
        repositories: {
          "o/app": { baseBranch: "main", merge: { method: "merge" } },
        },
      },
    },
    repository = { id: "app", github: "o/app", landing: "off" },
    store = repositoryStore(repository);
  assert.deepEqual(landingSettings(old, "o/app", repository), {
    mode: "off",
    autoMerge: false,
    method: "merge",
    mergeBatch: "auto",
    maxAttempts: 1,
  });
  assert.equal(mergeMethodOf(repositoryOf(old, "o/app")), "MERGE");
  assert.equal(
    shipMode(deliveryPolicy(old), { repository: "app" }, store),
    "manual",
  );

  const next = structuredClone(old);
  next.github.repositories["o/app"].landing = {
    mode: "pr",
    autoMerge: true,
    method: "squash",
  };
  next.github.repositories["o/app"].conflicts = { maxAttempts: 3 };
  assert.deepEqual(landingSettings(next, "o/app", repository), {
    mode: "pr",
    autoMerge: true,
    method: "squash",
    mergeBatch: "auto",
    maxAttempts: 3,
  });
  const settings = repositoryOf(next, "o/app");
  assert.equal(mergeMethodOf(settings), "SQUASH");
  assert.equal(effectiveShip(next.delivery, "o/app", settings), "auto-merge");
  assert.equal(
    shipMode(deliveryPolicy(next), { repository: "app" }, store),
    "auto-merge",
  );
  // A task's pin still wins over the repository.
  assert.equal(
    shipMode(
      deliveryPolicy(next),
      { repository: "app", ship: "manual" },
      store,
    ),
    "manual",
  );
  // The tick copies the mode onto the checkout's repository row.
  assert.deepEqual(
    applyLandingModes(store, next).map((p) => p.landing),
    ["pr"],
  );
  assert.equal(store.get("repositories", "app").landing, "pr");
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
