// The workspace the report command's tests run in: a checkout `app` under
// `root` with one commit, and a store at the workspace's database path with
// tasks a and b on that repository.
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import { workspaceConfig } from "../settings/config.ts";
import { Store } from "../store/store.ts";
import { git } from "./delivery-fixture.ts";
import { snapshot } from "./fixtures.ts";

export function reportWorkspace(t: TestContext, root: string) {
  const checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "T");
  git(checkout, "config", "user.email", "t@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  const task = (id: string) => ({
    id,
    title: "Task " + id,
    kind: "leaf",
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    tags: [],
    acceptance: ["Works."],
    checks: [],
    repository: "app",
  });
  store.initialize({
    ...snapshot(),
    tasks: [task("a"), task("b")],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  return store;
}
