// Managed issue marker, version 2 (design §3.4), and the plans-repo leak
// rules (§6.6). Everything here lands in public issue bodies, so the marker
// holds IDs and hashes only and is screened before every write.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { COMPLETIONS, TASK_KINDS } from "../work-model.mjs";
import { fail } from "./store.mjs";
import { secretReason } from "./workspace-repository.mjs";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
// The issues above tasks: one per cross-plan epic and one per plan. Their
// marker taskId is `epic.<id>` or `plan.<id>`.
export const PARENT_KINDS = Object.freeze(["epic", "plan"]);
// shortcut: a marker of kind "epic" whose taskId does not start with
// "epic." is an issue projected for a task before Requirement 59, which now
// reads as a package. A spec folder named "epic" would be misread; rename it.
export const isParentMarker = (marker) =>
  marker?.kind === "plan" ||
  (marker?.kind === "epic" && String(marker.taskId || "").startsWith("epic."));
// Generated as RFC 4648 base32; read as any 16 lowercase letters and digits,
// so the design's own example (`avz_k3q9m2x7v4d8p1ta`) stays valid.
export const NAMESPACE = /^avz_[a-z0-9]{16}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/;
const NODE_ID = /^[A-Za-z0-9_=-]{1,100}$/;
const MARKER = /<!--\s*avoozl-task\s*\n([\s\S]*?)\n-->/;
const ABSOLUTE_PATH = /^(?:\/|~[\\/]|[A-Za-z]:[\\/]|\\\\|file:)/i;

// `avz_` plus 16 base32 characters: exactly 80 random bits.
export function generateNamespace() {
  const bytes = randomBytes(10);
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let text = "";
  for (let i = 15; i >= 0; i -= 1)
    text += BASE32[Number((bits >> BigInt(i * 5)) & 31n)];
  return "avz_" + text;
}

// The planning workspace's own `.avoozl.json`: its namespace, in plans-repo
// mode the planning repository the marker must never name, the epic issue
// type, and per-repository policy (labels, concurrency) projection reads.
export function planningIdentity(workspaceRoot) {
  let value = {};
  if (workspaceRoot) {
    const filename = path.join(workspaceRoot, ".avoozl.json");
    try {
      value = JSON.parse(fs.readFileSync(filename, "utf8")) || {};
    } catch (error) {
      if (error.code !== "ENOENT")
        fail("Could not read .avoozl.json: " + error.message);
    }
  }
  const namespace = value.namespace ?? null;
  if (namespace !== null && !NAMESPACE.test(namespace))
    fail(
      "The .avoozl.json namespace must be avz_ and 16 lowercase letters or digits.",
    );
  // Local only (`local`) is no GitHub mode.
  const named = value.github?.mode ?? null,
    mode = named === "local" ? null : named,
    planningRepository =
      mode === "plans-repo" ? value.github?.planningRepository || null : null;
  return {
    namespace,
    mode,
    planningRepository,
    epicIssueType: value.github?.epicIssueType || null,
    // Read here as written; the Settings validator refuses a bad value.
    maxPerParent:
      Number.isSafeInteger(value.github?.subIssues?.maxPerParent) &&
      value.github.subIssues.maxPerParent >= 1
        ? value.github.subIssues.maxPerParent
        : 100,
    repositories: value.github?.repositories || {},
  };
}

export function requireNamespace(identity) {
  if (!identity?.namespace)
    fail(
      `Add "namespace": "${generateNamespace()}" to .avoozl.json before projecting to GitHub. It must never change.`,
      409,
    );
  return identity.namespace;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value, allowed, name) {
  if (!isRecord(value)) fail(`Marker ${name} must be an object.`, 422);
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length)
    fail(`Marker ${name} has unsupported fields: ${extra.join(", ")}.`, 422);
}

function check(condition, message) {
  if (!condition) fail("Invalid marker: " + message + ".", 422);
}

function strings(value, trail = []) {
  if (typeof value === "string") return [[trail.join("."), value]];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      strings(item, [...trail, String(index)]),
    );
  if (isRecord(value))
    return Object.entries(value).flatMap(([key, item]) => [
      [[...trail, key].join(".") + " (key)", key],
      ...strings(item, [...trail, key]),
    ]);
  return [];
}

function repositoryNames(planningRepository) {
  if (!planningRepository) return [];
  const name = String(planningRepository).toLowerCase();
  return [name, "github.com/" + name, name + "#"];
}

// Rejects a marker that could leak: an absolute path, a credential, or the
// planning repository's name (R10.7, R28.11), then checks every field's shape.
export function validateMarker(marker, { planningRepository } = {}) {
  onlyKeys(
    marker,
    [
      "version",
      "taskId",
      "namespace",
      "kind",
      "parent",
      "source",
      "compiler",
      "edges",
      "applied",
      "order",
    ],
    "",
  );
  const forbidden = repositoryNames(planningRepository);
  for (const [field, text] of strings(marker)) {
    if (ABSOLUTE_PATH.test(text) || text.includes("\\"))
      fail(`Marker field ${field} contains a path.`, 422);
    const secret = secretReason(text);
    if (secret) fail(`Marker field ${field} contains a ${secret}.`, 422);
    const lower = text.toLowerCase();
    if (forbidden.some((name) => lower.includes(name)))
      fail(`Marker field ${field} names the planning repository.`, 422);
  }
  check(marker.version === 2, "version must be 2");
  check(TASK_ID.test(marker.taskId || ""), "taskId");
  check(NAMESPACE.test(marker.namespace || ""), "namespace");
  // An epic or plan issue (Requirement 59.8) carries kind epic or plan.
  check([...TASK_KINDS, ...PARENT_KINDS].includes(marker.kind), "kind");
  check(marker.parent === undefined || TASK_ID.test(marker.parent), "parent");
  onlyKeys(marker.source, ["commit", "manifest"], "source");
  check(
    marker.source.commit === null || COMMIT.test(marker.source.commit || ""),
    "source.commit must be a 40-hex commit or null",
  );
  check(SHA256.test(marker.source.manifest || ""), "source.manifest");
  check(
    marker.compiler === undefined || SHA256.test(marker.compiler),
    "compiler",
  );
  if (marker.edges !== undefined) {
    onlyKeys(marker.edges, ["conditions", "supports"], "edges");
    for (const [id, level] of Object.entries(marker.edges.conditions || {}))
      check(TASK_ID.test(id) && COMPLETIONS.includes(level), "edge condition");
    check(
      (marker.edges.supports || []).every((id) => TASK_ID.test(id)),
      "supports edge",
    );
  }
  onlyKeys(
    marker.applied,
    ["title", "body", "labels", "blockers", "project"],
    "applied",
  );
  check(SHA256.test(marker.applied.title || ""), "applied.title");
  check(SHA256.test(marker.applied.body || ""), "applied.body");
  check(
    Array.isArray(marker.applied.labels) &&
      marker.applied.labels.every(
        (label) => typeof label === "string" && label.length <= 50,
      ),
    "applied.labels",
  );
  check(
    Array.isArray(marker.applied.blockers) &&
      marker.applied.blockers.every((id) => NODE_ID.test(String(id))),
    "applied.blockers",
  );
  if (marker.applied.project !== undefined) {
    onlyKeys(
      marker.applied.project,
      ["Release", "Wave", "Iteration"],
      "applied.project",
    );
    const { Release, Wave, Iteration } = marker.applied.project;
    check(
      Release === undefined ||
        (typeof Release === "string" && Release.length <= 100),
      "applied.project.Release",
    );
    check(
      Wave === undefined || (Number.isInteger(Wave) && Wave >= 0),
      "applied.project.Wave",
    );
    check(
      Iteration === undefined ||
        (typeof Iteration === "string" && Iteration.length <= 100),
      "applied.project.Iteration",
    );
  }
  if (marker.order !== undefined) validateOrder(marker.order);
  return marker;
}

function validateOrder(order) {
  onlyKeys(order, ["actor", "reason", "closedAt"], "order");
  check(LOGIN.test(order.actor || ""), "order.actor");
  check(["COMPLETED", "NOT_PLANNED"].includes(order.reason), "order.reason");
  check(
    typeof order.closedAt === "string" &&
      !Number.isNaN(Date.parse(order.closedAt)),
    "order.closedAt",
  );
}

export function renderMarker(marker, options) {
  validateMarker(marker, options);
  return `<!-- avoozl-task\n${JSON.stringify(marker)}\n-->`;
}

// Version 1 markers stay readable so issues projected before version 2 are
// reused rather than duplicated.
export function parseMarker(body) {
  const match = String(body || "").match(MARKER);
  if (!match) return null;
  let value;
  try {
    value = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (value?.version === 1) return value;
  if (value?.version !== 2) return null;
  try {
    return validateMarker(value);
  } catch {
    return null;
  }
}

// `order` records an allowed actor's close without code (§6.5), copied from
// the issue's own close event; reopening removes it.
export function withOrder(marker, { actor, reason, closedAt }) {
  const order = { actor, reason, closedAt };
  validateOrder(order);
  return { ...marker, order };
}

export function withoutOrder(marker) {
  const { order: _order, ...rest } = marker;
  return rest;
}

// Plans-repo mode keeps every sub-issue link and dependency between planning
// issues, so no code-repository issue shows a link into the plan (R28.7).
export function assertPlanningLink(identity, ...repositories) {
  if (identity?.mode !== "plans-repo") return;
  const planning = String(identity.planningRepository || "").toLowerCase();
  for (const repository of repositories)
    if (String(repository || "").toLowerCase() !== planning)
      fail(
        "In plans-repo mode Avoozl links only planning issues; " +
          repository +
          " is not the planning repository.",
        409,
      );
}

// Plans-repo mode adds only planning issues to the Project, never code pull
// requests or code issues, so no Project event lands on public code (F40).
export function assertPlanningProjectItem(identity, item) {
  if (identity?.mode !== "plans-repo") return;
  if (item?.pullRequest)
    fail("In plans-repo mode Avoozl adds no pull request to the Project.", 409);
  assertPlanningLink(identity, item?.repository);
}
