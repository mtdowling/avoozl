import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("Canvas switches isolated Avoozl workspaces through qualified APIs", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const api = fs.readFileSync(path.join(root, "src/web/api.ts"), "utf8");
  const hooks = fs.readFileSync(path.join(root, "src/web/hooks.ts"), "utf8");

  assert.match(app, /function WorkspaceSwitcher/);
  assert.match(app, /<option value="__all__">All workspaces<\/option>/);
  assert.match(app, /function AllWorkspaces/);
  assert.match(app, /workspaceLocationKey\(activeWorkspaceId\)/);
  assert.match(app, /configureWorkspaceScope\(nextWorkspaceId\)/);
  assert.match(
    api,
    /\/api\/workspaces\/\$\{encodeURIComponent\(activeWorkspaceId\)\}\/operations/,
  );
  assert.doesNotMatch(app, /apiPath: apiUrl/);
  assert.match(app, /apiPath: workspaceApiUrl/g);
  assert.match(hooks, /workspaceApiUrl\("\/api\/events" \+ query\)/);
});

test("workspace concurrency is configurable without stopping active work", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /function WorkspaceConcurrencySettings/);
  assert.match(
    app,
    /command\("workspace\.concurrency\.configure", \{ limit \}\)/,
  );
  assert.match(app, /Set zero to pause new dispatch/);
  assert.match(app, /Existing sessions are never\s+stopped when this changes/);
});

test("the workspace switcher collapses to an accessible control on phones", () => {
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(styles, /\.host-workspace-switcher \{/);
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.host-workspace-switcher select \{[\s\S]*?opacity: 0\.01;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.host-workspace-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  );
});
