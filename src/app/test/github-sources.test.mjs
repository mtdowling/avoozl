// One intake list (Requirement 109, design §4.38): GitHub sources in
// `intake.sources`, old `github.issueIntake` and `github.queue` read and
// moved silently. Temporary workspaces only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  githubSourceId,
  githubSources,
  writeGitHubSources,
} from "../github-sources.mjs";
import { declaredSources, editSource, sourceMap } from "../intake.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const OLD = {
  version: 1,
  github: {
    issueIntake: {
      "Example/App": {
        projectId: "app",
        workspaceRepositoryId: "app",
        assignee: "bot",
        label: "go",
        allowedActors: ["sam"],
      },
      "example/off": { projectId: "off", assignee: "bot", enabled: false },
    },
    queue: { "example/watch": { projectId: "watch", labelBehaviors: {} } },
  },
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("an old issue intake entry reads as its GitHub source; disabled and queue entries are none", () => {
  const sources = githubSources(OLD);
  assert.deepEqual(
    sources.map((source) => [source.id, source.repository, source.legacy]),
    [["github-example-app", "Example/App", true]],
  );
  assert.deepEqual(sources[0].entry, {
    via: "github",
    repository: "Example/App",
    project: "app",
    label: "go",
    assignee: "bot",
    autoStart: false,
    provider: null,
    model: null,
    allowedActors: ["sam"],
    minimumPermission: "write",
  });
  // A declared source for the same repository wins over the old entry.
  const declared = githubSources({
    ...OLD,
    intake: {
      sources: {
        mine: {
          via: "github",
          repository: "example/app",
          project: "app",
          assignee: "riley",
        },
      },
    },
  });
  assert.deepEqual(
    declared.map((source) => [source.id, source.settings.assignee]),
    [["mine", "riley"]],
  );
});

test("source ids use source id letters and stay unique", () => {
  assert.equal(githubSourceId("Big_Org/my.repo"), "github-big-org-my-repo");
  assert.equal(
    githubSourceId("a/b", new Set(["github-a-b", "github-a-b-2"])),
    "github-a-b-3",
  );
  assert.match(githubSourceId(`o/${"x".repeat(100)}`), /^[a-z][a-z0-9-]{0,60}$/);
});

test("a write moves old entries once, then upserts and removes by repository", () => {
  const value = writeGitHubSources(structuredClone(OLD));
  assert.equal(value.github, undefined, "both old keys and the empty block go");
  assert.deepEqual(Object.keys(value.intake.sources), ["github-example-app"]);
  writeGitHubSources(value, {
    upsert: {
      repository: "example/app",
      settings: { projectId: "app", assignee: "riley" },
    },
  });
  assert.deepEqual(Object.keys(value.intake.sources), ["github-example-app"]);
  assert.equal(value.intake.sources["github-example-app"].assignee, "riley");
  writeGitHubSources(value, { remove: ["EXAMPLE/APP"] });
  assert.equal(value.intake, undefined);
});

test("an old file loads with no apply flag, and the next write moves it", (t) => {
  const { root, store } = fixture(t),
    filename = path.join(root, ".avoozl.json");
  fs.writeFileSync(filename, JSON.stringify(OLD));
  store.put("github_repositories", {
    id: "Example/App",
    projectId: "app",
    workspaceRepositoryId: "app",
    assignee: "bot",
    label: "go",
    allowedActors: ["sam"],
  });
  const configuration = new RepositorySettings(store, { workspaceRoot: root });
  assert.deepEqual(configuration.metadata().pending, []);
  assert.equal(configuration.metadata().repository.error, null);
  configuration.updateConversationSettings({ autoArchiveCompleted: false });
  const moved = read(filename);
  assert.equal(moved.github, undefined);
  assert.equal(moved.intake.sources["github-example-app"].label, "go");
  assert.deepEqual(configuration.reload().pending, []);
});

test("Intake sources lists GitHub sources; poll and submit never see them", (t) => {
  const workspaceRoot = temporaryDirectory(),
    settingsFile = path.join(temporaryDirectory(), "plugins.json"),
    options = { workspaceRoot, settingsFile };
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspaceRoot, ".avoozl.json"), JSON.stringify(OLD));
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      intake: {
        sources: {
          "github-here": {
            via: "github",
            repository: "example/here",
            project: "here",
            assignee: "bot",
          },
          tickets: { via: "mcp", repository: "app" },
        },
      },
    }),
  );
  const rows = declaredSources(options);
  assert.deepEqual(
    rows.map((row) => [row.id, row.scope, Boolean(row.error)]),
    [
      ["github-example-app", "repository", false],
      ["github-here", "machine", true],
      ["tickets", "machine", false],
    ],
  );
  assert.match(rows[1].error, /Repository setup/);
  assert.deepEqual([...sourceMap(options).keys()], ["tickets"]);
  // A GitHub source is changed in Repository setup, never here.
  assert.throws(
    () =>
      editSource(options, {
        scope: "repository",
        id: "x",
        entry: {
          via: "github",
          repository: "example/x",
          project: "x",
          assignee: "bot",
        },
        confirmPublic: true,
      }),
    /Repository setup/,
  );
  assert.throws(
    () =>
      editSource(options, {
        scope: "repository",
        id: "github-example-app",
        remove: true,
      }),
    /Repository setup/,
  );
  // Adding another source to .avoozl.json moves the old keys too.
  editSource(options, {
    scope: "repository",
    id: "desk",
    entry: { via: "mcp", repository: "app" },
    confirmPublic: true,
  });
  const file = read(path.join(workspaceRoot, ".avoozl.json"));
  assert.equal(file.github, undefined);
  assert.deepEqual(Object.keys(file.intake.sources).sort(), [
    "desk",
    "github-example-app",
  ]);
});
