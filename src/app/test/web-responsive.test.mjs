import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("the Canvas toolbar keeps essential phone controls without overflowing labels", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /className="mobile-menu"/);
  assert.match(app, /className="toolbar-action toolbar-settings"/);
  assert.match(app, /className="toolbar-action toolbar-fullscreen"/);
  assert.match(app, /className="toolbar-action toolbar-reset"/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(
    styles,
    /\.canvas-host \.canvas-view-tabs \{\s*display: none;\s*\}/,
  );
  assert.match(styles, /\.canvas-host > \.app-nav \{\s*display: flex;\s*\}/);
  assert.match(styles, /\.toolbar-new-trigger > span,[\s\S]*?display: none;/);
  assert.match(
    styles,
    /\.app-toolbar \.toolbar-fullscreen,[\s\S]*?\.app-toolbar \.toolbar-reset,[\s\S]*?display: none;/,
  );
});

test("Settings distinguishes local execution projects and supports updating them", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(
    app,
    /Execution projects are local Git checkouts where OpenHands creates/,
  );
  assert.match(app, /Add or update a project/);
  assert.match(app, /Update project/);
  assert.match(app, /Select it above to update it/);
  assert.match(
    app,
    /This does not monitor its GitHub repository; connect\s+that\s+separately under GitHub/,
  );
});

test("Settings loads real agent catalogs and describes Driver handoff", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const host = fs.readFileSync(
    path.join(root, "src/app/agent-host.mjs"),
    "utf8",
  );

  assert.match(app, /function AgentCatalogRows/);
  assert.match(app, /command<ModelCatalog>\("models"/);
  assert.match(app, /profiles\?\.llmProfiles\.length/);
  assert.doesNotMatch(app, /`\$\{provider\.models\?\.length \|\| 0\} models`/);
  assert.match(app, /safely hands off to a replacement Driver/);
  assert.match(host, /"usage\.limits"/);
});

test("Queue exposes repository and execution-project filters with manual sync", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /aria-label="Queue filters"/);
  assert.match(app, /Repository[\s\S]*?All repositories/);
  assert.match(app, /Execution project[\s\S]*?All local projects/);
  assert.match(app, /busy === "sync" \? "Syncing…" : "Sync now"/);
});

test("the Avoozl header and Now activity visuals keep the compact live-work contract", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /\{ id: "reports", label: "Saved"/);
  assert.match(app, /view === "overview"\s*\?\s*null/);
  assert.equal(
    app.match(/className=\{inFlightCount \? "brand-in-flight" : ""\}/g)?.length,
    2,
  );
  assert.match(styles, /\.brand-label small\.brand-in-flight \{/);
  assert.match(styles, /\.canvas-connection \{[\s\S]*?order: 100;/);
  assert.match(
    styles,
    /\.recent-now \.agent-pin\.working > span \{[\s\S]*?animation: none !important;[\s\S]*?transform: none !important;/,
  );
  assert.match(
    styles,
    /\.recent-now \.agent-pin > span::before \{\s*display: none;/,
  );
  assert.match(
    styles,
    /\.recent-now \.hub-work-row:has\(\.hub-work-marker\.is-working\) \{[\s\S]*?border-radius: 0 !important;[\s\S]*?background: transparent !important;/,
  );
  assert.match(
    styles,
    /\.recent-now \.hub-row-actions \.hub-session-open \{[\s\S]*?order: 99;[\s\S]*?margin-left: auto;/,
  );
  const pulse = styles.match(
    /@keyframes openhands-running-pulse \{([\s\S]*?)\n\}/,
  )?.[1];
  assert.ok(pulse);
  assert.match(pulse, /background:/);
  assert.match(pulse, /box-shadow:/);
  assert.doesNotMatch(pulse, /opacity:/);
});
