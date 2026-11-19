// One intake list (Requirement 110, design §4.39): GitHub sources in
// `intake.sources`. Temporary workspaces only.
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

const FILE = {
  version: 1,
  intake: {
    sources: {
      "github-example-app": {
        via: "github",
        repository: "Example/App",
        project: "app",
        assignee: "bot",
      },
    },
  },
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("source ids use source id letters and stay unique", () => {
  assert.equal(githubSourceId("Big_Org/my.repo"), "github-big-org-my-repo");
  assert.equal(
    githubSourceId("a/b", new Set(["github-a-b", "github-a-b-2"])),
    "github-a-b-3",
  );
  assert.match(
    githubSourceId(`o/${"x".repeat(100)}`),
    /^[a-z][a-z0-9-]{0,60}$/,
  );
});

test("a write upserts and removes by repository", () => {
  const value = structuredClone(FILE);
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

test("Intake sources lists GitHub sources; poll and submit never see them", (t) => {
  const workspaceRoot = temporaryDirectory(),
    settingsFile = path.join(temporaryDirectory(), "plugins.json"),
    options = { workspaceRoot, settingsFile };
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(workspaceRoot, ".avoozl.json"),
    JSON.stringify(FILE),
  );
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
