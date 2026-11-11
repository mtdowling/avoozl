import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

test("product design documents solo, team, and pull-request intake workflows", () => {
  const design = fs.readFileSync(
    path.join(root, "docs/design/openhands-github-product.md"),
    "utf8",
  );

  assert.match(design, /### Solo maintainer/);
  assert.match(design, /### Multi-user team/);
  assert.match(design, /### Pull-request review intake/);
  assert.match(design, /label or design approval = authorization/);
  assert.match(design, /GitHub assignee = routing/);
  assert.match(design, /activation lease = machine ownership/);
  assert.ok(design.includes("not a live distributed lock"));

  const solo = design
    .split("### Solo maintainer")[1]
    .split("### Multi-user team")[0]
    .toLowerCase();
  for (const term of [
    "monitors",
    "overlap",
    "task",
    "authorizes",
    "worktree",
    "openhands",
    "steers",
    "validates",
    "pull request",
    "integration",
    "acceptance",
    "archives",
  ])
    assert.ok(solo.includes(term), `solo workflow should include ${term}`);
});

test("OpenHands Automations own scheduled GitHub watching", () => {
  const design = fs.readFileSync(
    path.join(root, "docs/design/openhands-github-product.md"),
    "utf8",
  );

  assert.match(
    design,
    /Native OpenHands Automations own scheduled GitHub watching/,
  );
  assert.match(
    design,
    /Connecting a private repository[\s\S]{0,220}install and enable the deterministic watcher/,
  );
  assert.match(
    design,
    /Loading configuration\s+files alone never mutates OpenHands/,
  );
  assert.match(design, /`queue\.sync` remains an explicit operator action/);
  assert.match(
    design,
    /normal continuous path is the\s+packaged OpenHands watcher/,
  );
  assert.match(design, /custom deterministic Avoozl intake Automation/);
  assert.match(design, /ingest-only credential/);
  assert.match(design, /it cannot approve a design/);
  assert.match(design, /cannot[\s\S]{0,160}start a run/);
  assert.match(design, /actual OpenHands Automation runtime/);
  assert.match(design, /activation lease = machine ownership/);
  assert.doesNotMatch(design, /Each user's Avoozl service polls/);
  assert.doesNotMatch(
    design,
    /A matching user's Avoozl service discovers it by polling/,
  );
  assert.doesNotMatch(design, /A loopback-only Avoozl service polls GitHub/);
  assert.doesNotMatch(design, /There is no reusable Automation callback/);
});

test("GitHub Settings summarizes authority, routing, and machine ownership", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /function GitHubWorkflowSummary/);
  assert.match(app, /A ready label allows work to run/);
  assert.match(app, /Claiming assigns the issue to you/);
  assert.match(app, /only one computer executes it/);
  assert.match(app, /GitHub keeps review and merge/);
});
