// Installing Avoozl enables no trigger rule (R24.3): a new workspace ticks
// past an issue that carries every label Avoozl has ever defaulted to, and
// neither reads nor writes GitHub issues for it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import { normalizeGitHubPolicy, readGitHubPolicy } from "../github-policy.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

test("a new workspace has no trigger rule and takes no issue on tick", async (t) => {
  const root = path.join(temporaryDirectory("avoozl-norule-"), "workspace");
  initializeWorkspace(root, { name: "Fresh" });
  const policy = readGitHubPolicy(root);
  assert.equal(policy.mode, null);
  assert.deepEqual(policy.repositories, {});

  const fake = new FakeGitHub(),
    calls = [];
  fake.issues = [
    {
      id: 1,
      node_id: "issue-node-1",
      number: 1,
      state: "open",
      title: "Labeled as every old default",
      body: "## Acceptance criteria\n\n- [ ] It works",
      html_url: "https://example.test/example/code/issues/1",
      assignees: [{ login: "worker" }],
      user: { login: "worker" },
      labels: [{ name: "avoozl:ready" }, { name: "avoozl:auto" }],
    },
  ];
  const github = new Proxy(fake, {
    get(target, name) {
      const value = target[name];
      if (typeof value !== "function") return value;
      return (...args) => {
        calls.push(String(name));
        return value.apply(target, args);
      };
    },
  });
  const store = new Store(workspaceConfig({ workspace: root }).dbPath);
  t.after(() => store.close());
  const ops = new Operations(store, { github, workspaceRoot: root });
  const result = await ops.execute("workspace.tick", { sessions: [] });

  assert.deepEqual(result.dispatch, []);
  assert.deepEqual(store.list("github_repositories"), []);
  assert.deepEqual(store.list("github_issues"), []);
  assert.deepEqual(store.read().tasks, []);
  assert.deepEqual(
    calls.filter((name) => /issue|label|comment|assign/i.test(name)),
    [],
  );
  assert.deepEqual(
    [fake.created, fake.updated, fake.labels, fake.comments],
    [[], [], [], []],
  );
});

test("every example policy in docs/policies.md validates", () => {
  const text = fs.readFileSync(
      new URL("../../../docs/policies.md", import.meta.url),
      "utf8",
    ),
    blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
      JSON.parse(m[1]),
    );
  assert.ok(blocks.length);
  for (const block of blocks) normalizeGitHubPolicy(block.github);
});
