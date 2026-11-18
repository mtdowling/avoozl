import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  globalAvoozlConfigPath,
  loadLayeredConfig,
} from "../layered-config.mjs";
import { leaseSettings, trainSettings } from "../landing-config.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function setup({ repo, global } = {}) {
  const workspaceRoot = temporaryDirectory("avoozl-trains-config-"),
    xdg = temporaryDirectory("avoozl-trains-xdg-"),
    env = { XDG_CONFIG_HOME: xdg },
    globalFile = globalAvoozlConfigPath({ env, home: "/unused" }),
    repositoryFile = path.join(workspaceRoot, ".avoozl.json");
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, ...value }));
  };
  if (global) write(globalFile, global);
  if (repo) write(repositoryFile, repo);
  return {
    load: () => loadLayeredConfig({ workspaceRoot, env }),
    globalFile,
    repositoryFile,
  };
}

const macNative = { platforms: { "macos-arm64": { kind: "native" } } };
const trains = (extra = {}, target = {}) => ({
  landing: {
    trains: {
      validation: {
        cheap: [["git", "diff", "--check"]],
        full: { "macos-arm64": { command: ["npm", "test"] } },
      },
      ...extra,
      targets: { main: { policy: "gated", ...target } },
    },
  },
});

test("a valid train block loads and every default applies", () => {
  const { load } = setup({ repo: trains(), global: { machine: macNative } });
  const { config, warnings } = load();
  assert.deepEqual(warnings, []);
  const s = trainSettings(config, "main");
  assert.equal(s.branchPrefix, "avoozl-batch/");
  assert.deepEqual(s.trigger, {
    minBranches: 3,
    maxWaitMinutes: 15,
    maxBranches: 10,
    cooldownSeconds: 60,
  });
  assert.deepEqual(s.failure, {
    action: "return",
    retries: 2,
    trunk: "revert",
    maxBisects: 2,
    maxRebases: 3,
    flakyReruns: 1,
  });
  assert.equal(s.ci.waitForLastTrain, false);
  assert.deepEqual(s.conflicts.mechanical, []);
  assert.deepEqual(leaseSettings(config), {
    heartbeatSeconds: 60,
    missedHeartbeats: 3,
  });
});

test("a block with no trains setting loads as before", () => {
  const { load } = setup({ repo: { landing: { conflictRounds: 1 } } });
  assert.equal(trainSettings(load().config, "main"), null);
});

test("a target override replaces the trains-level key", () => {
  const { load } = setup({
    repo: trains(
      { trigger: { minBranches: 2, maxBranches: 6 } },
      { trigger: { maxBranches: 4 } },
    ),
    global: { machine: macNative },
  });
  const s = trainSettings(load().config, "main");
  assert.equal(s.trigger.maxBranches, 4);
  assert.equal(s.trigger.minBranches, 2);
  assert.equal(s.trigger.cooldownSeconds, 60);
});

const refused = [
  ["an unknown key", trains({ nonsense: 1 }), /landing\.trains\.nonsense/],
  [
    "an unknown nested key",
    trains({ trigger: { minBranches: 1, soon: 1 } }),
    /landing\.trains\.trigger\.soon/,
  ],
  [
    "minBranches out of range",
    trains({ trigger: { minBranches: 0 } }),
    /trigger\.minBranches must be a whole number 1–32/,
  ],
  [
    "maxWaitMinutes out of range",
    trains({ trigger: { maxWaitMinutes: 1441 } }),
    /maxWaitMinutes must be a whole number 0–1440/,
  ],
  [
    "cooldownSeconds out of range",
    trains({ trigger: { cooldownSeconds: -1 } }),
    /cooldownSeconds/,
  ],
  [
    "flakyReruns out of range",
    trains({ failure: { flakyReruns: 4 } }),
    /failure\.flakyReruns must be a whole number 0–3/,
  ],
  [
    "a bad failure action",
    trains({ failure: { action: "ignore" } }),
    /failure\.action must be one of return, eject/,
  ],
  [
    "a bad prefix",
    trains({ branchPrefix: "batch" }),
    /branchPrefix must be a valid ref prefix/,
  ],
  [
    "minBranches above maxBranches",
    trains({ trigger: { minBranches: 5, maxBranches: 4 } }),
    /minBranches is above maxBranches/,
  ],
  [
    "a target without policy",
    {
      landing: {
        trains: {
          validation: { full: { "macos-arm64": { command: ["x"] } } },
          targets: { main: {} },
        },
      },
    },
    /targets\.main\.policy is required/,
  ],
  [
    "a regenerate rule without a command",
    trains({
      conflicts: {
        mechanical: [{ paths: ["package-lock.json"], strategy: "regenerate" }],
      },
    }),
    /mechanical\.0 is a regenerate rule and needs a command/,
  ],
  [
    "a needed platform with no environment and no workflow",
    trains({
      validation: { full: { "windows-x64": { command: ["npm", "test"] } } },
    }),
    /validation\.full\.windows-x64 needs a machine environment/,
  ],
];
for (const [name, repo, message] of refused)
  test(`refuses ${name}, naming the key and the file`, () => {
    const { load, repositoryFile } = setup({
      repo,
      global: { machine: macNative },
    });
    assert.throws(load, (error) => {
      assert.match(error.message, message);
      assert.ok(error.message.includes(repositoryFile), error.message);
      return true;
    });
  });

test("machine and lease keys in .avoozl.json are refused, naming the global file", () => {
  for (const repo of [
    { machine: macNative },
    { machine: { slots: { vm: 1 } } },
    { lease: { heartbeatSeconds: 30 } },
  ]) {
    const { load, repositoryFile, globalFile } = setup({ repo });
    assert.throws(load, (error) => {
      assert.ok(error.message.includes(repositoryFile));
      assert.ok(error.message.includes(globalFile));
      return true;
    });
  }
});

test("machine and lease values are checked in the global file", () => {
  const bad = [
    [{ lease: { heartbeatSeconds: 5 } }, /lease\.heartbeatSeconds/],
    [{ lease: { missedHeartbeats: 11 } }, /lease\.missedHeartbeats/],
    [{ machine: { slots: { vm: 0 } } }, /machine\.slots\.vm/],
    [
      { machine: { platforms: { w: { kind: "vm" } } } },
      /machine\.platforms\.w\.wrapper/,
    ],
    [
      {
        machine: {
          platforms: { w: { kind: "vm", wrapper: ["w"], slot: "x" } },
        },
      },
      /machine\.platforms\.w\.slot names x/,
    ],
  ];
  for (const [global, message] of bad) {
    const { load, globalFile } = setup({ global });
    assert.throws(load, (error) => {
      assert.match(error.message, message);
      assert.ok(error.message.includes(globalFile));
      return true;
    });
  }
  const { load } = setup({
    global: {
      machine: {
        platforms: {
          "windows-x64": {
            kind: "vm",
            wrapper: ["wrap", "--"],
            cleanup: ["wrap", "--revert"],
            slot: "windows-vm",
          },
        },
        slots: { "windows-vm": 1 },
      },
      lease: { heartbeatSeconds: 30, missedHeartbeats: 4 },
    },
  });
  assert.deepEqual(leaseSettings(load().config), {
    heartbeatSeconds: 30,
    missedHeartbeats: 4,
  });
});

test("a gated target with a CI-only platform loads with the extra-run warning", () => {
  const { load } = setup({
    repo: trains({
      ci: { workflow: "test.yml" },
      validation: {
        full: {
          "macos-arm64": { command: ["npm", "test"] },
          "windows-x64": { command: ["npm", "test"] },
        },
      },
    }),
    global: { machine: macNative },
  });
  const { warnings } = load();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /windows-x64.*one extra CI run/);
});

test("conflicts.resolver defaults to rules, accepts chat and refuses other values", () => {
  const load = (conflicts) =>
    setup({
      repo: trains(conflicts ? { conflicts } : {}),
      global: { machine: macNative },
    }).load();
  assert.equal(
    trainSettings(load().config, "main").conflicts.resolver,
    "rules",
  );
  assert.equal(
    trainSettings(load({ resolver: "chat" }).config, "main").conflicts.resolver,
    "chat",
  );
  assert.throws(
    () => load({ resolver: "agent" }),
    /conflicts\.resolver must be one of rules, chat/,
  );
});

test("pullRequests keys load with defaults, and a template placeholder must be known", () => {
  const ok = setup({
    repo: trains({
      pullRequests: { commentTemplate: "Landed as {position}." },
    }),
    global: { machine: macNative },
  }).load();
  const s = trainSettings(ok.config, "main");
  assert.equal(s.pullRequests.mode, "review-only");
  assert.equal(s.pullRequests.commentTemplate, "Landed as {position}.");
  const dflt = setup({ repo: trains(), global: { machine: macNative } }).load();
  assert.match(
    trainSettings(dflt.config, "main").pullRequests.commentTemplate,
    /\{train\}/,
  );
  assert.throws(
    () =>
      setup({
        repo: trains({ pullRequests: { commentTemplate: "Hi {name}" } }),
        global: { machine: macNative },
      }).load(),
    /\{name\}.*not a placeholder/,
  );
  assert.throws(
    () =>
      setup({
        repo: trains({ pullRequests: { mode: "always" } }),
        global: { machine: macNative },
      }).load(),
    /pullRequests\.mode must be one of review-only/,
  );
});

test("scheduling.overlap defaults to same-train and refuses other values", () => {
  const ok = setup({ repo: trains(), global: { machine: macNative } }).load();
  assert.equal(
    trainSettings(ok.config, "main").scheduling.overlap,
    "same-train",
  );
  assert.throws(
    () =>
      setup({
        repo: trains({ scheduling: { overlap: "never" } }),
        global: { machine: macNative },
      }).load(),
    /scheduling\.overlap must be one of same-train, serialize/,
  );
});

test("capacity.ci and ci.jobPlatforms load, and bad counts are refused", () => {
  const ok = setup({
    repo: trains({
      ci: {
        jobPlatforms: { "test (macos)": "macos-arm64" },
        bisectOnRed: true,
      },
      capacity: { ci: { "macos-arm64": 2 } },
    }),
    global: { machine: macNative },
  }).load();
  const s = trainSettings(ok.config, "main");
  assert.deepEqual(s.capacity.ci, { "macos-arm64": 2 });
  assert.equal(s.ci.jobPlatforms["test (macos)"], "macos-arm64");
  assert.equal(s.ci.bisectOnRed, true);
  assert.deepEqual(
    trainSettings(
      setup({ repo: trains(), global: { machine: macNative } }).load().config,
      "main",
    ).capacity,
    { ci: {} },
  );
  assert.throws(
    () =>
      setup({
        repo: trains({ capacity: { ci: { "macos-arm64": 0 } } }),
        global: { machine: macNative },
      }).load(),
    /capacity\.ci\.macos-arm64 must be a whole number 1–32/,
  );
});
