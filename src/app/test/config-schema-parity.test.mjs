// src/avoozl-config.schema.json is what an editor checks a `.avoozl.json`
// against, so a key the loader accepts and the schema lacks is flagged in a
// valid file (simplification audit §2.3, F19). These tests hold the schema to
// the validators' own key lists, and every closed object in the schema to
// one of those lists.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ruleKeys, whenKeys } from "../agent-instructions.mjs";
import {
  HARNESS_ROLES,
  MODEL_ROLES,
  PLAN_REVIEW_KEYS,
  RETIRED_ROLES,
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
  FIELD_KEYS,
  GITHUB_BLOCK_KEYS,
  LEGACY_KEYS,
  MANAGED_LABEL_KEYS,
  POLICY_KEYS,
  RADAR_KEYS,
  STATUS_VALUE_KEYS,
} from "../github-policy.mjs";
import { SOURCE_KEYS } from "../intake.mjs";
import { INVESTIGATE_KEYS } from "../investigate.mjs";
import {
  LEASE_KEYS,
  MACHINE_PLATFORM_KEYS,
  MECHANICAL_KEYS,
  PLATFORM_COMMAND_KEYS,
  TARGET_KEYS,
  TRAIN_KEYS,
} from "../landing-config.mjs";
import { DEFAULT_LANES } from "../lanes.mjs";
import { avoozlConfigSchemaPath } from "../layered-config.mjs";
import { MIRROR_KEYS } from "../mirror-policy.mjs";
import { ENTRY_KEYS } from "../plugins.mjs";
import {
  CONVERSATION_KEYS,
  ISSUE_INTAKE_KEYS,
  PLANNING_REPOSITORY_KEYS,
  PROJECT_KEYS,
  QUEUE_KEYS,
  SANDBOX_KEYS,
} from "../repository-settings.mjs";

const schema = JSON.parse(fs.readFileSync(avoozlConfigSchemaPath, "utf8"));

// The schema object a JSON pointer names, or undefined.
const at = (pointer) =>
  pointer
    .split("/")
    .slice(1)
    .reduce((node, part) => node?.[part], schema);

const REPOSITORY = "#/$defs/githubRepositoryPolicy/properties";
const TRAINS = "#/properties/landing/properties/trains";
const TARGET = `${TRAINS}/properties/targets/additionalProperties`;

// One train block: its own keys, then each group of settings inside it.
const trainPairs = (base, shape) => [
  [base, Object.keys(shape)],
  ...Object.entries(shape)
    .filter(([, spec]) => spec.leaf !== true)
    .map(([group, spec]) => [`${base}/properties/${group}`, Object.keys(spec)]),
  [
    `${base}/properties/validation/properties/full/additionalProperties`,
    PLATFORM_COMMAND_KEYS,
  ],
  [`${base}/properties/conflicts/properties/mechanical/items`, MECHANICAL_KEYS],
];

// The settings below one `flow` group, from the dotted paths.
const flowGroup = (group) =>
  FLOW_PATHS.filter((path) => path.startsWith(`${group}.`)).map((path) =>
    path.slice(group.length + 1),
  );

// Each closed schema object and the keys its validator accepts.
const PAIRS = [
  ["#/properties/models", [...MODEL_ROLES, ...RETIRED_ROLES]],
  ["#/properties/harnesses", HARNESS_ROLES],
  ["#/properties/planReview", PLAN_REVIEW_KEYS],
  ["#/properties/lanes", Object.keys(DEFAULT_LANES)],
  ["#/properties/lease", Object.keys(LEASE_KEYS)],
  [
    "#/properties/machine/properties/platforms/additionalProperties",
    MACHINE_PLATFORM_KEYS,
  ],
  // `targets` is read beside the shared train keys.
  ...trainPairs(TRAINS, { ...TRAIN_KEYS, targets: { leaf: true } }),
  ...trainPairs(TARGET, { ...TRAIN_KEYS, ...TARGET_KEYS }),
  ["#/properties/plugins/items", ENTRY_KEYS],
  ["#/properties/intake/properties/sources/additionalProperties", SOURCE_KEYS],
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
  // and flowPolicy in flow.mjs reads it, beside the keys projectInput lists.
  ["#/$defs/project", [...PROJECT_KEYS, "flow"]],
  ["#/$defs/project/properties/sandbox", SANDBOX_KEYS],
  ["#/$defs/planningRepository", PLANNING_REPOSITORY_KEYS],
  ["#/$defs/github", [...LEGACY_KEYS, ...POLICY_KEYS]],
  ["#/$defs/github/properties/subIssues", GITHUB_BLOCK_KEYS.subIssues],
  ["#/$defs/github/properties/issues", GITHUB_BLOCK_KEYS.issues],
  ["#/$defs/githubProject", GITHUB_BLOCK_KEYS.project],
  ["#/$defs/githubProject/properties/fields", FIELD_KEYS],
  ["#/$defs/githubProject/properties/statusValues", STATUS_VALUE_KEYS],
  ["#/$defs/githubRule", GITHUB_BLOCK_KEYS.rule],
  ["#/$defs/githubIssueIntake", ISSUE_INTAKE_KEYS],
  ["#/$defs/githubQueueRepository", QUEUE_KEYS],
  ["#/$defs/githubLabelBehaviors", BEHAVIOR_NAMES],
  ["#/$defs/githubMirror", MIRROR_KEYS],
  ["#/$defs/githubRepositoryPolicy", GITHUB_BLOCK_KEYS.repository],
  [`${REPOSITORY}/radar`, RADAR_KEYS],
  [`${REPOSITORY}/radar/properties/crew`, GITHUB_BLOCK_KEYS.crew],
  [`${REPOSITORY}/managedLabels`, MANAGED_LABEL_KEYS],
  [`${REPOSITORY}/crewLabels`, CREW_LABEL_KEYS],
  [`${REPOSITORY}/approval`, GITHUB_BLOCK_KEYS.approval],
  [`${REPOSITORY}/pullRequestReviews`, GITHUB_BLOCK_KEYS.pullRequestReviews],
  [`${REPOSITORY}/commentSteering`, GITHUB_BLOCK_KEYS.commentSteering],
  [`${REPOSITORY}/discussions`, GITHUB_BLOCK_KEYS.discussions],
  [`${REPOSITORY}/untriaged`, GITHUB_BLOCK_KEYS.untriaged],
  [`${REPOSITORY}/conflicts`, GITHUB_BLOCK_KEYS.conflicts],
  [`${REPOSITORY}/merge`, GITHUB_BLOCK_KEYS.merge],
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
