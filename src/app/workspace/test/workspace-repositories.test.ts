import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.ts";
import { RepositorySettings } from "../../settings/repository-settings.ts";
import { Store } from "../../store/store.ts";
import { fixture, snapshot } from "../../test/fixtures.ts";
import { storedRow } from "../../test/view-shapes.ts";
import { testRepository as repository } from "../../test/git-repository.ts";

// What repositories.configure answers, for the fields this test reads.
interface Configured {
  id: string;
  github: string;
  planning: boolean;
  issueAuthorization: { enabled: boolean };
}

class FakeGitHub {
  private: boolean;
  labels: string[];
  constructor() {
    this.private = true;
    this.labels = [];
  }
  available() {
    return true;
  }
  async repository(repository: { id: string }) {
    return {
      node_id: `node:${repository.id}`,
      full_name: repository.id,
      private: this.private,
    };
  }
  async currentUser() {
    return { login: "operator" };
  }
  async ensureLabel(_repository: unknown, label: { name: string }) {
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

  const configured = await operations.execute<Configured>(
    "repositories.configure",
    {
      id: "compiler",
      name: "Compiler",
      localCheckout: checkout,
      github: "example/compiler",
      planning: true,
      editable: true,
      issueAuthorization: true,
      assignee: "operator",
      checks: [["npm", "test"]],
    },
  );

  assert.equal(configured.id, "compiler");
  assert.equal(configured.github, "example/compiler");
  assert.equal(configured.planning, true);
  assert.equal(configured.issueAuthorization.enabled, true);
  assert.equal(
    storedRow(store, "repositories", "compiler").root,
    fs.realpathSync.native(checkout),
  );
  assert.equal(
    storedRow(store, "github_repositories", "example/compiler")
      .workspaceRepositoryId,
    "compiler",
  );
  assert.deepEqual(github.labels, [], "no label is made");

  const saved = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  assert.equal(saved.repositories.compiler.planning, true);
  // Repository setup's "issues here" writes a GitHub source (R110.3).
  assert.equal(saved.github, undefined);
  assert.equal(
    saved.intake.sources["github-example-compiler"].executionRepository,
    "compiler",
  );

  await operations.execute("repositories.remove", {
    id: "compiler",
    confirm: true,
  });
  // Removing the repository removes its GitHub source.
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")).intake,
    undefined,
  );
  assert.equal(store.get("repositories", "compiler"), null);
  assert.equal(store.get("github_repositories", "example/compiler"), null);
});

test("a rebuilt database gets its repositories back from .avoozl.json", async (t) => {
  const { root, store } = fixture(t),
    checkout = path.join(root, "compiler"),
    filename = path.join(root, ".avoozl.json");
  repository(checkout);
  await new Operations(store, {
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
    github: new FakeGitHub(),
  }).execute("repositories.configure", {
    id: "compiler",
    name: "Compiler",
    localCheckout: checkout,
    github: "example/compiler",
    issueAuthorization: true,
    assignee: "operator",
    checks: [["npm", "test"]],
  });
  const before = {
      repository: storedRow(store, "repositories", "compiler"),
      github: storedRow(store, "github_repositories", "example/compiler"),
    },
    text = fs.readFileSync(filename, "utf8");

  // Delete the database and rebuild it.
  store.close();
  for (const name of fs.readdirSync(root))
    if (name.startsWith("workspace.sqlite")) fs.rmSync(path.join(root, name));
  const rebuilt = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => rebuilt.close());
  rebuilt.initialize(snapshot());
  const result = await new Operations(rebuilt, {
    configuration: new RepositorySettings(rebuilt, { workspaceRoot: root }),
    github: new FakeGitHub(),
  }).execute<{ repositories: unknown }>("workspace.rebuild", {});

  assert.deepEqual(result.repositories, {
    repositories: ["compiler"],
    github: ["example/compiler"],
  });
  const restored = storedRow(rebuilt, "repositories", "compiler");
  for (const key of ["root", "name", "checks", "github", "baseBranch"])
    assert.deepEqual(restored[key], before.repository[key], key);
  const github = storedRow(rebuilt, "github_repositories", "example/compiler");
  for (const key of ["repositoryId", "assignee", "owner", "repo"])
    assert.equal(github[key], before.github[key], key);
  assert.equal(
    fs.readFileSync(filename, "utf8"),
    text,
    "the file is unchanged",
  );
});

test("a repository with a GitHub repository projects as one repository", (t) => {
  const { store } = fixture(t),
    operations = new Operations(store);
  store.put("repositories", {
    id: "code",
    name: "Code",
    root: "/tmp/code",
    github: "example/code",
    baseBranch: "main",
    checks: [],
  });

  return operations
    .execute<{ items: Configured[] }>("repositories.list")
    .then(({ items }) => {
      assert.equal(items.length, 1);
      assert.equal(items[0].id, "code");
      assert.equal(items[0].github, "example/code");
    });
});
