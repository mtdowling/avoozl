import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repository(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Avoozl test"]);
  git(root, ["config", "user.email", "avoozl@example.test"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Test\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "Initialize"]);
}

class FakeGitHub {
  constructor() {
    this.private = true;
    this.labels = [];
  }
  available() {
    return true;
  }
  async repository(repository) {
    return {
      node_id: `node:${repository.id}`,
      full_name: repository.id,
      private: this.private,
    };
  }
  async currentUser() {
    return { login: "operator" };
  }
  async ensureLabel(_repository, label) {
    this.labels.push(label.name);
  }
}

test("unified repositories preserve legacy execution and GitHub records", async (t) => {
  const { root, store } = fixture(t),
    checkout = path.join(root, "compiler");
  repository(checkout);
  const configuration = new RepositorySettings(store, {
      workspaceRoot: root,
    }),
    github = new FakeGitHub(),
    operations = new Operations(store, { configuration, github });

  const configured = await operations.execute("repositories.configure", {
    id: "compiler",
    name: "Compiler",
    localCheckout: checkout,
    github: "example/compiler",
    planning: true,
    editable: true,
    issueAuthorization: true,
    assignee: "operator",
    allowedActors: ["maintainer"],
    readyLabel: "team:ready",
    managedLabel: "team:managed",
    labelBehaviors: {
      ready: ["team:ready"],
      blocked: ["team:blocked"],
      review: ["team:review"],
      quarantined: ["team:quarantined"],
    },
    checks: [["npm", "test"]],
  });

  assert.equal(configured.id, "compiler");
  assert.equal(configured.github, "example/compiler");
  assert.equal(configured.planning, true);
  assert.equal(configured.issueAuthorization.enabled, true);
  assert.deepEqual(configured.labels.ready, ["team:ready"]);
  assert.equal(
    store.get("projects", "compiler").root,
    fs.realpathSync(checkout),
  );
  assert.equal(
    store.get("github_repositories", "example/compiler").workspaceRepositoryId,
    "compiler",
  );
  assert.deepEqual(github.labels, ["team:ready", "team:managed"]);

  const saved = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  assert.equal(saved.projects.compiler.planning, true);
  assert.equal(saved.github.queue, undefined);
  assert.equal(
    saved.github.issueIntake["example/compiler"].workspaceRepositoryId,
    "compiler",
  );

  await operations.execute("repositories.remove", { id: "compiler" });
  assert.equal(store.get("projects", "compiler"), null);
  assert.equal(
    store.get("github_queue_repositories", "example/compiler"),
    null,
  );
  assert.equal(store.get("github_repositories", "example/compiler"), null);
});

test("legacy project and Queue records project as one repository", (t) => {
  const { store } = fixture(t),
    operations = new Operations(store);
  store.put("projects", {
    id: "code",
    name: "Code",
    root: "/tmp/code",
    repository: "example/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_queue_repositories", {
    id: "example/code",
    visibility: "private",
    includeIssues: true,
    includePullRequests: true,
  });

  return operations.execute("repositories.list").then(({ items }) => {
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "code");
    assert.equal(items[0].github, "example/code");
  });
});
