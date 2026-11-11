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
    app,
    /visibleViews\.map\(\(\{ id, label, icon: Icon \}\)[\s\S]*?<Icon size=\{15\}/,
  );
  assert.doesNotMatch(
    styles,
    /\.canvas-host \.canvas-view-tabs \{\s*display: none;\s*\}/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1120px\)[\s\S]*?\.canvas-host \.canvas-view-tabs button span \{\s*display: none;/,
  );
  assert.match(styles, /\.canvas-host > \.app-nav \{\s*display: flex;\s*\}/);
  assert.match(styles, /\.toolbar-new-trigger > span,[\s\S]*?display: none;/);
  assert.match(
    styles,
    /\.app-toolbar \.toolbar-fullscreen,[\s\S]*?\.app-toolbar \.toolbar-reset,[\s\S]*?display: none;/,
  );
  assert.match(app, /\{ id: "reports", label: "Saved", icon: Glasses \}/);
  assert.match(
    app,
    /className="toolbar-new-trigger"[\s\S]*?<Plus size=\{16\} \/>[\s\S]*?<\/summary>/,
  );
  assert.doesNotMatch(app, /<Plus size=\{16\} \/>\s*<span>New<\/span>/);
});

test("the Task tree heading and groups stay clear on small screens", () => {
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(styles, /\.tree-screen-heading \{[\s\S]*?width: 100%;/);
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.recent-tree \.tree-screen-heading,[\s\S]*?width: 100%;/,
  );
  assert.match(
    styles,
    /\.recent-tree \.tree-group-toggle strong \{[\s\S]*?color: #eef5f0;[\s\S]*?font-weight: 650;/,
  );
  assert.match(
    styles,
    /\.recent-tree \.tree-group-toggle small \{[\s\S]*?color: #87928b;/,
  );
  assert.match(
    styles,
    /\.recent-tree \.tree-group-cell \{[\s\S]*?border-block: 0;[\s\S]*?border-bottom: 1px solid #2c322e;/,
  );
  assert.match(
    styles,
    /\.recent-tree \.tree-group-toggle \{[\s\S]*?border-bottom: 0;/,
  );
  assert.match(
    styles,
    /\.recent-tree #tasks-view \{[\s\S]*?width: 100%;[\s\S]*?padding: 0 0 12px;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\) and \(min-width: 941px\)[\s\S]*?width: 42%;[\s\S]*?width: 15%;[\s\S]*?width: 17%;[\s\S]*?width: 26%;/,
  );
});

test("Saved searches expose their filter definitions", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /function savedFilterSummary/);
  assert.match(app, /className="report-filter-summary"/);
  assert.match(app, /Archived and historical included/);
  assert.match(styles, /\.report-filter-summary \{[\s\S]*?display: grid;/);
});

test("plan reading and live service details keep usable alignment and scrolling", () => {
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(
    styles,
    /\.document-reading \{[\s\S]*?overflow: auto;[\s\S]*?max-height: 100%;[\s\S]*?touch-action: pan-y;/,
  );
  assert.match(styles, /\.canvas-connection-tip \{[\s\S]*?text-align: left;/);
  assert.match(
    styles,
    /\.canvas-connection-tip span \{[\s\S]*?grid-template-columns: 88px minmax\(0, 1fr\);[\s\S]*?text-align: left;/,
  );
  assert.match(
    styles,
    /\.epic-label-resize-handle \{[\s\S]*?width: 9px;[\s\S]*?height: 100%;/,
  );
});

test("the New menu owns persistent Driver chat and keeps task launches as children", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.doesNotMatch(app, /className="toolbar-driver-control"/);
  assert.match(app, /className="toolbar-workspace-picker"/);
  assert.match(
    app,
    /<strong>\{launchPending \? "Opening…" : "Chat"\}<\/strong>[\s\S]*?void startOpenHandsIntent\("ask", NEW_TASK_PROMPT/,
  );
  assert.match(
    app,
    /void startOpenHandsIntent\("draft", NEW_PLAN_PROMPT,[\s\S]*?<strong>\{launchPending \? "Starting…" : "New plan"\}<\/strong>/,
  );
  assert.match(app, /void openDriver\(true\)/);
  assert.match(
    app,
    /const existing = driver\.data\?\.projects\.find\([\s\S]*?if \(existing\) \{\s*await openRun\(existing\.id\);\s*return;\s*\}/,
  );
  assert.match(
    app,
    /const captured = captureContext\(\{ purpose: "project-chat", scoped \}\);/,
  );
  assert.match(app, /title="Open or return to the persistent Driver"/);
  assert.match(app, /parentRunId: parent\.run\.id/);
  assert.match(
    styles,
    /\.toolbar-new-menu \{[\s\S]*?display: flex;[\s\S]*?align-self: center;[\s\S]*?align-items: center;/,
  );
  assert.match(
    styles,
    /\.app-toolbar \.toolbar-new-options button > svg \{\s*justify-self: center;/,
  );
  assert.match(
    styles,
    /\.toolbar-new-option-copy,[\s\S]*?text-align: left;[\s\S]*?\.toolbar-new-option-copy \{[\s\S]*?justify-self: stretch;/,
  );
  assert.doesNotMatch(app, />Project chat</);
  assert.doesNotMatch(app, />Scoped chat</);
  assert.doesNotMatch(app, /"Work intake"/);
});

test("completed tasks start read-only OpenHands reviews instead of implementation", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const controlPlane = fs.readFileSync(
    path.join(root, "src/web/ControlPlane.tsx"),
    "utf8",
  );

  assert.match(
    app,
    /stateData\.statuses\.find\(\(status\) => status\.id === task\.status\)\?\.complete/,
  );
  assert.match(app, /conversationPurpose: review \? \("review" as const\)/);
  assert.match(app, /mode: review \? "ask" : "implement"/);
  assert.match(controlPlane, /complete\s+\?\s+"Review with agent"/);
  assert.match(controlPlane, /:\s+"Start in OpenHands"/);
});

test("pending external-session checks render no indefinite loading message", () => {
  const workbench = fs.readFileSync(
    path.join(root, "src/workbench.mjs"),
    "utf8",
  );

  assert.match(workbench, /if \(loading\) return "";/);
  assert.doesNotMatch(workbench, /Checking connected sessions/);
});

test("In Flight rows open tasks only through their explicit controls", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const workbench = fs.readFileSync(
    path.join(root, "src/workbench.mjs"),
    "utf8",
  );

  assert.doesNotMatch(app, /openTaskInsteadOfSession/);
  assert.match(workbench, /rowTaskTarget = running \? "" : ` data-task=/);
  assert.match(
    workbench,
    /<article class="hub-work-row hub-session-row"\$\{task \? ' data-workbench-task=/,
  );
});

test("Settings distinguishes local execution projects and supports updating them", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(
    app,
    /Execution projects are local Git checkouts where OpenHands\s+creates/,
  );
  assert.match(app, /onClick=\{\(\) => openProjectModal\(\)\}/);
  assert.match(app, /Add project/);
  assert.match(app, /onClick=\{\(\) => openProjectModal\(project\.id\)\}/);
  assert.match(app, />\s*Edit\s*</);
  assert.match(app, /editingProjectId \? "Edit project" : "Add project"/);
  assert.match(app, /onCancel=\{closeProjectModal\}/);
});

test("Settings can register or change the portable planning repository", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(
    app,
    /workspace\.workspaceRepository\?\.configuration\s*\? "Change planning repository"\s*: "Register planning repository"/,
  );
  assert.match(app, /onClick=\{openPlanningRepository\}/);
  assert.match(app, /setWorkspaceRoot\(configuration\?\.root \|\| ""\)/);
  assert.match(
    app,
    /workspace\.workspaceRepository\?\.configuration\s*\? "Update planning repository"\s*: "Register planning repository"/,
  );
  assert.match(app, /onClick=\{cancelPlanningRepository\}/);
  assert.match(app, />\s*Cancel\s*</);
  assert.match(app, /className="settings-actions planning-repository-actions"/);
  assert.match(app, /className="planning-repository-section"/);
  assert.match(app, />Planning repository</);
  assert.match(
    styles,
    /\.planning-repository-actions \{[\s\S]*?margin-top: 16px;[\s\S]*?flex-wrap: wrap;/,
  );
  assert.match(
    styles,
    /\.planning-repository-section \{[\s\S]*?border: 1px solid var\(--line\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.planning-repository-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
  );
});

test("GitHub repository settings expose normalized label behavior mappings", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /<summary>Label behavior<\/summary>/);
  assert.match(app, /Defaults work without setup/);
  assert.match(app, /setEditingLabels/);
  assert.match(app, /normalizedState \|\| "unclassified"/);
  assert.match(app, /<dt>GitHub status<\/dt>/);
  assert.match(app, /<dt>Avoozl state<\/dt>/);
});

test("Settings defers agent configuration to OpenHands and describes Driver handoff", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");
  const host = fs.readFileSync(
    path.join(root, "src/app/agent-host.mjs"),
    "utf8",
  );

  assert.doesNotMatch(app, /Configured agents/);
  assert.doesNotMatch(app, /function AgentCatalogRows/);
  assert.doesNotMatch(app, /command<ModelCatalog>\("models"/);
  assert.match(app, /command<OpenHandsProfiles>\("openhands\.profiles"\)/);
  assert.match(app, /safely hands off to a replacement Driver/);
  assert.match(styles, /\.driver-agent-settings \{\s*margin-top: 16px;\s*\}/);
  assert.match(
    app,
    /<InfoCallout>\s*Avoozl does not currently expose a Driver compaction preference/,
  );
  assert.match(host, /"usage\.limits"/);
});

test("Conversation settings expose automatic agent routing without inventing context telemetry", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const routing = fs.readFileSync(
    path.join(root, "src/app/agent-routing.mjs"),
    "utf8",
  );

  assert.match(app, /Automatic agent routing/);
  assert.match(app, /Apply agent and model policy/);
  assert.match(app, /\.avoozl\/config\.json/);
  assert.match(app, /records “unknown” instead of\s+estimating it/);
  assert.match(routing, /contextTelemetry:/);
  assert.match(routing, /"unavailable"/);
  assert.match(
    routing,
    /source:\s*explicit\.agentProfile \|\| explicit\.model/,
  );
});

test("Agent instructions keep source context without a scrolling source column", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.doesNotMatch(app, /<th>Source<\/th>/);
  assert.match(app, /className="agent-instruction-source"/);
  assert.match(
    app,
    /agent-instruction-source[\s\S]*?rule\.source\?\.path \|\| "AGENTS\.md"/,
  );
  assert.match(
    styles,
    /\.agent-instruction-table-wrap \{[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    styles,
    /\.agent-instruction-table \{[\s\S]*?table-layout: fixed;/,
  );
  assert.match(
    styles,
    /\.agent-instruction-enabled \{[\s\S]*?text-align: right;/,
  );
  assert.doesNotMatch(styles, /\.agent-instruction-table \{[^}]*min-width:/);
});

test("synced Agent instructions open the complete AGENTS.md source", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /className="agent-instruction-source-summary"/);
  assert.match(app, /aria-haspopup="dialog"/);
  assert.match(app, /className="agent-instruction-source-modal"/);
  assert.match(app, /"agent\.instructions\.source"/);
  assert.match(
    app,
    /The complete file synchronized from the planning repository/,
  );
  assert.match(app, /className="agent-instruction-source-file"/);
  assert.match(app, /<MarkdownSourceViewer/);
  assert.match(app, /text=\{sourceFile\.text\}/);
  assert.match(app, /filename=\{sourceFile\.path\}/);
  assert.doesNotMatch(app, /<pre>\{rule\.instruction\}<\/pre>/);
  assert.match(
    styles,
    /\.agent-instruction-source-file,[\s\S]*?overflow: auto;/,
  );
});

test("the complete AGENTS.md source uses a read-only highlighted Markdown editor", () => {
  const editors = fs.readFileSync(
    path.join(root, "src/web/Editors.tsx"),
    "utf8",
  );

  assert.match(editors, /export function MarkdownSourceViewer/);
  assert.match(editors, /language="markdown"/);
  assert.match(editors, /theme="avoozl-dark"/);
  assert.match(editors, /readOnly: true/);
  assert.match(editors, /value=\{text\}/);
});

test("Queue exposes repository and execution-project filters with manual sync", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /aria-label="Queue filters"/);
  assert.match(app, /Repository[\s\S]*?All repositories/);
  assert.match(app, /Execution project[\s\S]*?All local projects/);
  assert.match(app, /busy === "sync" \? "Syncing…" : "Sync"/);
});

test("Queue separates triage, GitHub history, and all work", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /aria-label="Queue sections"/);
  assert.match(app, /aria-selected=\{queueTab === "triage"\}/);
  assert.match(app, /aria-selected=\{queueTab === "github"\}/);
  assert.match(app, /aria-selected=\{queueTab === "all"\}/);
  assert.match(app, /<h3>Recent GitHub<\/h3>/);
  assert.match(app, /<h3>Approvals<\/h3>/);
  assert.match(app, /Quiet repositories automatically look farther back/);
  assert.match(app, />\s*See all\s*</);
  assert.match(app, />Show processed</);
  assert.match(app, /showProcessed,/);
  assert.match(styles, /\.queue-triage-grid \{/);
  assert.match(styles, /\.queue-tabs button\[aria-selected="true"\]/);
});

test("Queue claims explicitly assign issues without authorizing execution", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const operations = fs.readFileSync(
    path.join(root, "src/app/operations.mjs"),
    "utf8",
  );
  const automations = fs.readFileSync(
    path.join(root, "src/app/openhands-automations.mjs"),
    "utf8",
  );

  assert.match(app, /command<\{[\s\S]*?\}>\("queue\.claim"/);
  assert.match(app, /"Claiming…" : "Claim issue"/);
  assert.match(
    app,
    /does not authorize execution or acquire a machine\s+lease/,
  );
  assert.match(operations, /if \(name === "queue\.claim"\)/);
  assert.match(automations, /explicit user actions such as Claim are separate/);
});

test("Queue pull requests expose bounded in-app changed-file diffs", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /command<QueuePullRequestDiff>\("queue\.diff"/);
  assert.match(app, /<h3 id="queue-diff-title">Files changed<\/h3>/);
  assert.match(app, /aria-label="Changed files"/);
  assert.match(app, /queuePatchLineClass/);
  assert.match(app, /View the complete diff on GitHub/);
  assert.match(styles, /\.queue-patch \.is-added \{/);
  assert.match(styles, /\.queue-patch \.is-removed \{/);
  assert.match(styles, /\.queue-patch \.is-hunk \{/);
});

test("OpenHands automation settings use compact refresh copy and one section boundary", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /aria-label="Refresh automation coverage"/);
  assert.match(app, /title="Refresh automation coverage"/);
  assert.match(
    app,
    /<RefreshCw className=\{coverage\.loading \? "spin" : ""\} size=\{14\} \/>\s*Refresh\s*<\/button>/,
  );
  assert.doesNotMatch(app, />\s*Refresh coverage\s*<\/button>/);
  assert.match(
    styles,
    /\.settings-panel \.openhands-automation-settings > h3 \{[\s\S]*?border-top: 0;/,
  );
});

test("missing GitHub credentials link directly to OpenHands Secrets", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /Missing GitHub credentials/);
  assert.match(app, /GITHUB_PERSONAL_ACCESS_TOKEN/);
  assert.match(app, /openOpenHandsPath\("\/settings\/secrets"\)/);
  assert.match(styles, /\.automation-credential-fix \{/);
});

test("GitHub setup empty states use informational callouts", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /function InfoCallout/);
  assert.match(
    app,
    /<InfoCallout>\s*No repository can authorize work through issue labels yet\./,
  );
  assert.match(app, /<InfoCallout>\s*No repositories are monitored\./);
  assert.match(
    styles,
    /\.info-callout \{[\s\S]*?border: 1px solid #3f4d57;[\s\S]*?background: #1b2227;/,
  );
  assert.equal(
    app.match(/className="button primary add-project-button"/g)?.length,
    3,
  );
  assert.match(
    styles,
    /\.add-project-button \{[\s\S]*?border-color: var\(--bright\);[\s\S]*?background: var\(--bright\);/,
  );
});

test("Configuration active sources render as a bulleted list", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(
    app,
    /<ul className="configuration-sources">[\s\S]*?activeSources\.map[\s\S]*?<li key=\{source\}>\{source\}<\/li>[\s\S]*?<\/ul>/,
  );
  assert.match(styles, /\.configuration-sources \{[\s\S]*?padding-left: 18px;/);
});

test("Configuration guidance uses an informational callout before Git safety", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  const callout = app.match(
    /function ConfigurationPolicyCallout\(\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(callout);
  assert.match(callout, /<InfoCallout>/);
  assert.match(
    callout,
    /Settings edits shared, non-secret choices in the repository/,
  );
  assert.match(callout, /\.avoozl\/config\.json/);
  assert.match(callout, /Commit that file to share policy with/);
  assert.match(callout, /collaborators\. Provider credentials/);
  assert.match(callout, /GitHub authentication, tokens, and/);
  assert.match(
    callout,
    /other secrets stay in their owning tools or process environment and are/,
  );
  assert.match(callout, /never written there\./);
  assert.match(callout, /<\/InfoCallout>/);
  assert.match(
    app,
    /<ConfigurationPolicyCallout \/>\s*<hr className="configuration-section-divider" \/>\s*<MachineLocalIgnoreStatus \/>/,
  );
  assert.match(
    styles,
    /\.configuration-section-divider \{[\s\S]*?border-top: 1px solid var\(--line\);/,
  );
});

test("Queue table sorting is accessible and happens before pagination", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /const \[sort, setSort\] = useState/);
  assert.match(app, /aria-sort=\{active \? sort\.direction : "none"\}/);
  assert.match(app, /sortHeader\("work", "Work"\)/);
  assert.match(app, /sortHeader\("repository", "Repository"\)/);
  assert.match(app, /sortHeader\("project", "Project"\)/);
  assert.match(app, /sortHeader\("assignees", "Assignees"\)/);
  assert.match(app, /sortHeader\("updated", "Updated"\)/);
  assert.match(app, /pageItems = sortedItems\.slice/);
});

test("public monitored repositories can provision observation-only watchers", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.match(app, /provisionAutomation: continuousTracking/);
  assert.match(app, /provisionAutomation: enabled/);
  assert.match(app, /public, read-only/);
  assert.match(app, /Claim issue/);
  assert.doesNotMatch(
    app,
    /provisionAutomation:\s*visibility === "private" && continuousTracking/,
  );
});

test("repository monitoring uses compact status and automation guidance", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /className=\{`repository-status-dot/);
  assert.match(app, /Repository monitoring enabled/);
  assert.doesNotMatch(app, /\{item\.enabled === false \? "Off" : "On"\}/);
  assert.match(app, /OpenHands keeps Queue current;/);
  assert.match(app, /OpenHands keeps this repository’s Queue up to date\./);
  assert.doesNotMatch(app, /<small>\{controlPlane\.reason\}<\/small>/);
  assert.match(app, /state === "missing"\s*\? "Needs setup"/);
  assert.match(app, /\{busy \? "Fixing…" : "Fix"\}/);
  assert.match(app, /!!repository\.relatedAutomations\.length/);
  assert.match(app, />Optional automations</);
  assert.doesNotMatch(app, /Independent conveniences/);
  assert.doesNotMatch(app, /Related OpenHands automations/);
  assert.match(app, /className="native-automation-section"/);
  assert.match(app, />Native OpenHands automations</);
  assert.match(
    styles,
    /\.native-automation-section \{[\s\S]*?border: 1px solid var\(--line\);/,
  );
  assert.match(
    styles,
    /\.repository-status-dot\.enabled \{[\s\S]*?background: var\(--on\);/,
  );
});

test("faceted search uses Status for archived and historical work", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");

  assert.doesNotMatch(app, /Include archived and historical/);
  assert.match(app, /state\.statuses\.filter\(\(item\) => item\.archived\)/);
  assert.match(app, /filters\.statuses\.includes\("recorded"\)/);
});

test("the Avoozl header and Now activity visuals keep the compact live-work contract", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(app, /\{ id: "reports", label: "Saved"/);
  assert.match(app, /view === "overview" \|\| view === "queue"\s*\?\s*null/);
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

test("Epic labels have a persistent accessible resize handle with a mobile fallback", () => {
  const app = fs.readFileSync(path.join(root, "src/web/App.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");

  assert.match(
    app,
    /useStoredSize\(\s*"avoozl-epic-label-width",\s*220,\s*150,\s*480,\s*\)/,
  );
  assert.match(app, /label="Resize Epic label column"/);
  assert.match(app, /className="epic-label-resize-handle"/);
  assert.match(
    styles,
    /\.epic-label-resize-handle \{[\s\S]*?left: calc\(var\(--epic-label-width, 220px\) - 5px\);[\s\S]*?width: 9px;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\) \{[\s\S]*?\.epic-label-resize-handle \{[\s\S]*?display: none;/,
  );
});
