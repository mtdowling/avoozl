import {
  COMMAND_SINK_KEYS,
  NOTIFICATIONS_KEYS,
  WEBHOOK_SINK_KEYS,
} from "../notification-sinks.mjs";
// src/avoozl-config.schema.json is what an editor checks a `.avoozl.json`
// against, so a key the loader accepts and the schema lacks is flagged in a
// valid file (simplification audit §2.3, F19). These tests hold the schema to
// the validators' own key lists, every closed object in the schema to one of
// those lists, every open object to the keys its reader reads, and mark as
// ignored exactly the keys accepted only so an old file loads.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ruleKeys, whenKeys } from "../agent-instructions.mjs";
import { CONTENT_RULES_KEYS, RULE_SET_KEYS } from "../content-rules.mjs";
import {
  AGENT_ROLE_FIELDS,
  HARNESS_ROLE_FIELDS,
  PLAN_REVIEW_KEYS,
  ROLE_FIELDS,
  ROLES,
} from "../chat-models.mjs";
import {
  DELIVERY_KEYS,
  DELIVERY_REPOSITORY_KEYS,
  REVIEWER_KEYS,
} from "../delivery.mjs";
import { FLOW_PATHS } from "../flow.mjs";
import { BEHAVIOR_NAMES } from "../github-label-behaviors.mjs";
import {
  CREW_LABEL_KEYS,
  GITHUB_BLOCK_KEYS,
  MANAGED_LABEL_KEYS,
  POLICY_KEYS,
  RADAR_KEYS,
} from "../github-policy.mjs";
import { SOURCE_KEYS } from "../intake.mjs";
import { SERVE_KEYS } from "../serve-config.mjs";
import { GITHUB_SOURCE_KEYS } from "../github-sources.mjs";
import { INVESTIGATE_KEYS } from "../investigate.mjs";
import { MACHINE_FILE_KEYS } from "../landing-config.mjs";
import { DEFAULT_LANES } from "../lanes.mjs";
import { avoozlConfigSchemaPath } from "../layered-config.mjs";
import { MIRROR_KEYS } from "../mirror-policy.mjs";
import { ENTRY_KEYS } from "../plugins.mjs";
import {
  CONVERSATION_KEYS,
  PLANNING_REPOSITORY_KEYS,
  REPOSITORY_KEYS,
  SANDBOX_KEYS,
} from "../repository-settings.mjs";
import { CHECK_KEYS } from "../repository-checks.mjs";
import { ISOLATION_KEYS } from "../check-isolation.mjs";

const schema = JSON.parse(fs.readFileSync(avoozlConfigSchemaPath, "utf8"));

// The schema object a JSON pointer names, or undefined.
const at = (pointer) =>
  pointer
    .split("/")
    .slice(1)
    .reduce((node, part) => node?.[part], schema);

const REPOSITORY = "#/$defs/githubRepositoryPolicy/properties";

// The settings below one `flow` group, from the dotted paths.
const flowGroup = (group) =>
  FLOW_PATHS.filter((path) => path.startsWith(`${group}.`)).map((path) =>
    path.slice(group.length + 1),
  );

// Each closed schema object and the keys its validator accepts.
const PAIRS = [
  ["#/properties/roles", ROLES],
  ["#/$defs/chatRole", ROLE_FIELDS],
  ["#/$defs/agentRole", AGENT_ROLE_FIELDS],
  ["#/$defs/harnessRole", HARNESS_ROLE_FIELDS],
  ["#/properties/planReview", PLAN_REVIEW_KEYS],
  ["#/properties/lanes", Object.keys(DEFAULT_LANES)],
  ["#/properties/notifications", NOTIFICATIONS_KEYS],
  ["#/$defs/commandSink", COMMAND_SINK_KEYS],
  ["#/$defs/webhookSink", WEBHOOK_SINK_KEYS],
  ["#/properties/serve", SERVE_KEYS],
  ["#/properties/plugins/items", ENTRY_KEYS],
  ["#/properties/contentRules", CONTENT_RULES_KEYS],
  ["#/properties/contentRules/properties/sets/items", RULE_SET_KEYS],
  // Plugin and MCP keys plus the GitHub kind's (§4.39).
  [
    "#/properties/intake/properties/sources/additionalProperties",
    [...new Set([...SOURCE_KEYS, ...GITHUB_SOURCE_KEYS])],
  ],
  ["#/properties/delivery", DELIVERY_KEYS],
  ["#/$defs/deliveryInvestigate", INVESTIGATE_KEYS],
  ["#/$defs/deliveryReviewer", REVIEWER_KEYS],
  [
    "#/properties/delivery/properties/repositories/additionalProperties",
    DELIVERY_REPOSITORY_KEYS,
  ],
  ["#/$defs/flow", [...new Set(FLOW_PATHS.map((path) => path.split(".")[0]))]],
  ...["stopTheLine", "retro", "ci", "verify"].map((group) => [
    `#/$defs/flow/properties/${group}`,
    flowGroup(group),
  ]),
  ["#/$defs/agentInstructionRule", [...ruleKeys]],
  ["#/$defs/agentInstructionWhen", [...whenKeys]],
  ["#/$defs/conversations", [...CONVERSATION_KEYS]],
  // `flow` is the repository's own flow settings: Settings > Flow writes it
  // and flowPolicy in flow.mjs reads it, beside the keys repositoryInput lists.
  ["#/$defs/repository", REPOSITORY_KEYS],
  ["#/$defs/repository/properties/sandbox", SANDBOX_KEYS],
  ["#/$defs/repository/properties/isolation", ISOLATION_KEYS],
  [
    "#/$defs/repository/properties/checks/oneOf/0/additionalProperties/oneOf/1",
    CHECK_KEYS,
  ],
  ["#/$defs/planningRepository", PLANNING_REPOSITORY_KEYS],
  ["#/$defs/github", POLICY_KEYS],
  ["#/$defs/githubRule", GITHUB_BLOCK_KEYS.rule],
  ["#/$defs/githubLabelBehaviors", BEHAVIOR_NAMES],
  ["#/$defs/githubMirror", MIRROR_KEYS],
  ["#/$defs/githubRepositoryPolicy", GITHUB_BLOCK_KEYS.repository],
  [`${REPOSITORY}/radar`, RADAR_KEYS],
  [`${REPOSITORY}/managedLabels`, MANAGED_LABEL_KEYS],
  [`${REPOSITORY}/crewLabels`, CREW_LABEL_KEYS],
  [`${REPOSITORY}/approval`, GITHUB_BLOCK_KEYS.approval],
  [`${REPOSITORY}/pullRequestReviews`, GITHUB_BLOCK_KEYS.pullRequestReviews],
  [`${REPOSITORY}/discussions`, GITHUB_BLOCK_KEYS.discussions],
  [`${REPOSITORY}/untriaged`, GITHUB_BLOCK_KEYS.untriaged],
  [`${REPOSITORY}/triage`, GITHUB_BLOCK_KEYS.triage],
  [`${REPOSITORY}/conflicts`, GITHUB_BLOCK_KEYS.conflicts],
  [`${REPOSITORY}/merge`, GITHUB_BLOCK_KEYS.merge],
  [`${REPOSITORY}/landing`, GITHUB_BLOCK_KEYS.landing],
  [`${REPOSITORY}/release`, GITHUB_BLOCK_KEYS.release],
  [`${REPOSITORY}/release/properties/ranking`, GITHUB_BLOCK_KEYS.ranking],
  [`${REPOSITORY}/release/properties/scopes/items`, GITHUB_BLOCK_KEYS.scope],
];

// Closed schema objects whose validator keeps its few keys inline, so there
// is no list to compare. Each was read against the code named beside it.
const UNPAIRED = new Map([
  ["#/properties/receipts", "build-receipt.mjs reads parser and warmCheck"],
  [
    "#/properties/receipts/properties/report/oneOf/0",
    "validateReportSetting in build-report.mjs",
  ],
  [
    "#/properties/receipts/properties/report/oneOf/1",
    "validateReportSetting in build-report.mjs",
  ],
  ["#/properties/intake", "sourceDeclarations in intake.mjs reads sources"],
  ["#/properties/activity", "validateActivitySettings in activity-log.mjs"],
  ["#/$defs/agentInstructions", "agent-instructions.mjs accepts only rules"],
  ["#/properties/workers", "claimStaleMs in worker-release.mjs"],
]);

// Open schema objects (unknown keys pass) and the keys their readers read.
const OPEN = new Map([
  [
    "#",
    [
      "$schema",
      "version",
      "workspaceId",
      "namespace",
      "name",
      "operator",
      "dbPath",
      "documents",
      "port",
      "host",
      "url",
      "runner",
      "agentInstructions",
      "conversations",
      "repositories",
      "receipts",
      "github",
      "roles",
      "planReview",
      "lanes",
      "landing",
      "planningRepository",
      "plugins",
      "intake",
      "activity",
      "delivery",
      "flow",
      "contentRules",
      "workers",
      "packs",
      "machine",
      "lease",
      "notifications",
      "serve",
    ],
  ],
  // conflictRounds and validateLandingConfig in landing-config.mjs.
  ["#/properties/landing", ["conflictRounds", "trains", "unionPaths"]],
  ["#/properties/machine", MACHINE_FILE_KEYS],
  // plugin-pack.mjs writes each entry.
  [
    "#/properties/packs/additionalProperties",
    ["version", "importedAt", "importedBy", "settings"],
  ],
  // readRunnerConfig in remote-runner.mjs, and poolsOf in worker-offers.mjs.
  [
    "#/$defs/runner",
    [
      "role",
      "crewId",
      "agents",
      "executor",
      "workerMode",
      "remote",
      "checkTimeoutSeconds",
      "checks",
      "repos",
      "pools",
      "sources",
      "lanes",
    ],
  ],
  ["#/$defs/runner/properties/checks/additionalProperties", ["argv"]],
  [
    "#/$defs/runner/properties/pools/items",
    ["spec", "repository", "target", "claims", "issue", "base", "visibility"],
  ],
  ["#/$defs/runner/properties/sources/additionalProperties", ["url", "parent"]],
]);

// Keys a validator accepts only so an old file loads, and never reads.
const IGNORED = new Map([
  ...[
    "#/properties/landing/properties/trains",
    "#/properties/machine/properties/platforms",
    "#/properties/machine/properties/slots",
    "#/properties/lease",
  ].map((pointer) => [
    pointer,
    "Retired by merge batches (landing-config.mjs)",
  ]),
  [
    "#/properties/delivery/properties/runner",
    "deliveryPolicy: tick is ignored, crew-mode holds (worker-paths WP1)",
  ],
]);

// Deprecated keys a reader still reads as an older spelling of a new key.
// They are marked deprecated, but they are not ignored.
const OLDER = new Set([
  "#/properties/landing/properties/conflictRounds",
  "#/properties/delivery/properties/concurrency",
  "#/properties/delivery/properties/ship",
  "#/properties/delivery/properties/repositories/additionalProperties/properties/concurrency",
  "#/properties/delivery/properties/repositories/additionalProperties/properties/ship",
  `${REPOSITORY}/merge`,
]);

// Every closed object in the schema, by pointer.
function closedObjects() {
  const found = [];
  (function walk(node, pointer) {
    if (!node || typeof node !== "object") return;
    if (node.additionalProperties === false) found.push(pointer);
    for (const [key, child] of Object.entries(node))
      walk(child, `${pointer}/${key}`);
  })(schema, "#");
  return found;
}

test("the schema lists every key the validators accept, and no other", () => {
  const problems = [];
  for (const [pointer, keys] of PAIRS) {
    const node = at(pointer);
    if (!node?.properties) {
      problems.push(`${pointer} is not an object schema with properties`);
      continue;
    }
    const listed = Object.keys(node.properties);
    for (const key of keys)
      if (!listed.includes(key))
        problems.push(`${pointer} lacks ${key}, which its validator accepts`);
    // A key only the schema lists is offered by an editor and then refused.
    if (node.additionalProperties === false)
      for (const key of listed)
        if (!keys.includes(key))
          problems.push(`${pointer} lists ${key}, which its validator refuses`);
  }
  assert.deepEqual(problems, []);
});

test("every closed schema object is held to a validator's key list", () => {
  const paired = new Set(PAIRS.map(([pointer]) => pointer));
  for (const pointer of UNPAIRED.keys())
    assert.equal(at(pointer)?.additionalProperties, false, pointer);
  assert.deepEqual(
    closedObjects().filter(
      (pointer) => !paired.has(pointer) && !UNPAIRED.has(pointer),
    ),
    [],
    "pair each new closed object with its validator's key list in PAIRS",
  );
});

test("every open schema object lists exactly the keys its reader reads", () => {
  const paired = new Set(PAIRS.map(([pointer]) => pointer)),
    problems = [];
  for (const [pointer, keys] of OPEN) {
    const listed = Object.keys(at(pointer)?.properties ?? {});
    for (const key of keys)
      if (!listed.includes(key)) problems.push(`${pointer} lacks ${key}`);
    for (const key of listed)
      if (!keys.includes(key))
        problems.push(`${pointer} lists ${key}, which nothing reads`);
  }
  for (const pointer of openObjects())
    if (!OPEN.has(pointer) && !paired.has(pointer))
      problems.push(`${pointer} is open and has no key list in OPEN`);
  assert.deepEqual(problems, []);
});

test("the schema marks ignored exactly the keys accepted only for old files", () => {
  for (const pointer of IGNORED.keys())
    assert.equal(
      at(pointer)?.deprecated,
      true,
      `${pointer} must be deprecated`,
    );
  assert.deepEqual(
    deprecatedKeys().filter(
      (pointer) => !IGNORED.has(pointer) && !OLDER.has(pointer),
    ),
    [],
    "a deprecated key no validator ignores",
  );
});

// Every open object with properties, and every deprecated key, by pointer.
function openObjects() {
  const found = [];
  (function walk(node, pointer) {
    if (!node || typeof node !== "object") return;
    if (node.properties && node.additionalProperties !== false)
      found.push(pointer);
    for (const [key, child] of Object.entries(node))
      walk(child, `${pointer}/${key}`);
  })(schema, "#");
  return found;
}
function deprecatedKeys() {
  const found = [];
  (function walk(node, pointer) {
    if (!node || typeof node !== "object") return;
    if (node.deprecated === true) found.push(pointer);
    for (const [key, child] of Object.entries(node))
      walk(child, `${pointer}/${key}`);
  })(schema, "#");
  return found;
}
