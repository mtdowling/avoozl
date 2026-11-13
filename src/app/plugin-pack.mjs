// Config packs (design §4.14, Requirement 55): the settings part of a
// plugin. A pack is one JSON file in the plugin folder, `avoozl-pack.json`
// unless the manifest names another. It holds settings only and never runs
// code. Avoozl checks every key against the same validators Settings uses,
// previews each setting as create, change, keep or skip against this
// repository's `.avoozl.json`, and copies it in once when a person imports
// the exact preview they saw (import mode: no follow mode, no org minimums).
// `.avoozl.json` `packs` records which pack and version each imported
// setting came from.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateContentRules } from "./content-rules.mjs";
import { deliveryPolicy } from "./delivery.mjs";
import { FLOW_KEYS, flowSection, readKey } from "./flow.mjs";
import {
  DEFAULT_PERMISSION,
  normalizeGitHubPolicy,
  PERMISSIONS,
} from "./github-policy.mjs";
import { assertSafeConfig } from "./layered-config.mjs";
import { fail } from "./store.mjs";

export const PACK_FILE = "avoozl-pack.json";
const MAX_PACK_BYTES = 256 * 1024;

// What a pack may set, by group (R55.4). Anything else is refused by name.
export const PACK_SETTINGS = Object.freeze({
  // Each key applies to every repository the person picks at import.
  repositories: [
    "rules",
    "untriaged",
    "allowedActors",
    "minimumPermission",
    "requiredChecks",
    "priority",
    // Order inside Ready and Up next, never the lane; and labels that mean
    // the item waits on someone outside. Absent: no change.
    "priorityLabels",
    "waitingLabels",
    "managedLabels",
    "concurrency",
  ],
  project: ["fields", "statusValues"],
  epicIssueType: null,
  contentRules: ["sets"],
  delivery: ["reviewers", "agent", "model", "runner", "concurrency"],
  flow: null,
});

const record = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const PLACEHOLDER = "pack/repository";

// Run one existing validator and say where in the pack it failed.
function checked(run, from, to) {
  try {
    return run();
  } catch (error) {
    fail(`Pack: ${error.message.replaceAll(from, to)}`);
  }
}

function only(value, allowed, where) {
  if (!record(value)) fail(`Pack ${where} must be an object.`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      fail(`Pack key ${where}.${key} is not a pack setting.`);
}

// The pack file's shape, checked without any repository: every key known,
// every value valid for the setting it names, and nothing that could hold
// a credential or a content rule pattern.
export function validatePack(value) {
  only(value, ["description", "settings"], "pack");
  if (
    value.description !== undefined &&
    (typeof value.description !== "string" ||
      !value.description.trim() ||
      value.description.length > 300)
  )
    fail("Pack description must be 1-300 characters.");
  const settings = value.settings;
  only(settings, Object.keys(PACK_SETTINGS), "settings");
  if (!Object.keys(settings).length)
    fail("Pack settings must set at least one setting.");
  checked(() => assertSafeConfig(value, "the pack"), "", "");
  for (const [group, keys] of Object.entries(PACK_SETTINGS))
    if (keys && settings[group] !== undefined)
      only(settings[group], keys, `settings.${group}`);
  if (settings.repositories)
    checked(
      () =>
        normalizeGitHubPolicy({
          repositories: { [PLACEHOLDER]: settings.repositories },
        }),
      `github.repositories.${PLACEHOLDER}`,
      "settings.repositories",
    );
  if (settings.project)
    checked(
      () =>
        normalizeGitHubPolicy({
          project: { owner: "pack", number: 1, ...settings.project },
        }),
      "github.project",
      "settings.project",
    );
  if (settings.epicIssueType !== undefined)
    checked(
      () => normalizeGitHubPolicy({ epicIssueType: settings.epicIssueType }),
      "github.epicIssueType",
      "settings.epicIssueType",
    );
  if (settings.contentRules)
    checked(
      () => validateContentRules(settings.contentRules),
      "contentRules",
      "settings.contentRules",
    );
  if (settings.delivery)
    checked(
      () => deliveryPolicy({ delivery: settings.delivery }),
      "delivery",
      "settings.delivery",
    );
  if (settings.flow !== undefined)
    checked(() => flowSection(settings.flow, "settings.flow"), "", "");
  return value;
}

// The pack a plugin folder holds, checked. `file` comes from the manifest.
export function readPack(location, file = PACK_FILE) {
  const full = path.join(location, file);
  let text;
  try {
    text = fs.readFileSync(full, "utf8");
  } catch (error) {
    fail(
      error.code === "ENOENT"
        ? `The plugin provides a pack but has no ${file}.`
        : `${file} is unreadable: ${error.message}`,
    );
  }
  if (Buffer.byteLength(text) > MAX_PACK_BYTES)
    fail(`${file} is larger than 256 KB.`);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(`${file} is not JSON: ${error.message}`);
  }
  return validatePack(value);
}

// One line per setting a pack sets, as a path into `.avoozl.json`. A unit
// with `skip` cannot apply here and says why.
function units(settings, current, repositories) {
  const list = [];
  const github = record(current.github) ? current.github : {};
  for (const key of Object.keys(settings.repositories ?? {}))
    if (!repositories.length)
      list.push({
        path: ["github", "repositories", "*", key],
        skip: "No GitHub repository is chosen. Add one in Settings > Repositories, then preview again.",
      });
    else
      for (const repository of repositories)
        list.push({
          path: ["github", "repositories", repository, key],
          value: settings.repositories[key],
        });
  for (const group of ["fields", "statusValues"])
    for (const [key, value] of Object.entries(settings.project?.[group] ?? {}))
      list.push(
        record(github.project)
          ? { path: ["github", "project", group, key], value }
          : {
              path: ["github", "project", group, key],
              skip: "No GitHub Project is set. Set one in Settings > GitHub, then preview again.",
            },
      );
  if (settings.epicIssueType !== undefined)
    list.push({
      path: ["github", "epicIssueType"],
      value: settings.epicIssueType,
    });
  for (const set of settings.contentRules?.sets ?? [])
    list.push({ path: ["contentRules", "sets", set.id], value: set });
  for (const [key, value] of Object.entries(settings.delivery ?? {}))
    list.push({ path: ["delivery", key], value });
  for (const key of Object.keys(FLOW_KEYS)) {
    const value = readKey(settings.flow, key);
    if (value !== undefined)
      list.push({ path: ["flow", ...key.split(".")], value });
  }
  return list;
}

// Content rule sets are a list keyed by id; every other path is objects.
function read(value, [head, ...rest]) {
  if (head === "contentRules" && rest[0] === "sets") {
    const sets = value?.contentRules?.sets;
    return Array.isArray(sets)
      ? sets.find((s) => s?.id === rest[1])
      : undefined;
  }
  return [head, ...rest].reduce(
    (v, key) => (record(v) ? v[key] : undefined),
    value,
  );
}

function write(value, [head, ...rest], next) {
  if (head === "contentRules" && rest[0] === "sets") {
    value.contentRules = record(value.contentRules) ? value.contentRules : {};
    const sets = Array.isArray(value.contentRules.sets)
      ? value.contentRules.sets
      : (value.contentRules.sets = []);
    const at = sets.findIndex((s) => s?.id === rest[1]);
    if (at < 0) sets.push(structuredClone(next));
    else sets[at] = structuredClone(next);
    return;
  }
  const keys = [head, ...rest];
  let at = value;
  for (const key of keys.slice(0, -1)) {
    if (!record(at[key])) at[key] = {};
    at = at[key];
  }
  at[keys.at(-1)] = structuredClone(next);
}

// Who counts on one repository entry (R10.2): named actors, and the
// permission that counts, which defaults to write when nobody is named.
function whoCounts(entry) {
  const actors = Array.isArray(entry?.allowedActors) ? entry.allowedActors : [];
  return {
    actors,
    permission:
      entry?.minimumPermission ?? (actors.length ? null : DEFAULT_PERMISSION),
  };
}
const rank = (permission) =>
  permission === null ? Infinity : PERMISSIONS.indexOf(permission);

// What lets more people give orders after the import than before (R55.6).
function lowered(before, after, repository) {
  const notes = [];
  if (rank(after.permission) < rank(before.permission))
    notes.push(
      `Lowers who counts on ${repository}: ${before.permission ? `${before.permission} access` : "named people only"} becomes ${after.permission} access.`,
    );
  const known = new Set(before.actors.map((a) => a.toLowerCase())),
    added = after.actors.filter((a) => !known.has(a.toLowerCase()));
  if (added.length)
    notes.push(`Adds people who count on ${repository}: ${added.join(", ")}.`);
  return notes;
}

export const settingName = (unit) => unit.path.join(".");

// The import preview (R55.5): each setting as create, change, keep or skip,
// any who-counts change spelled out, and the hash an import must name.
export function packPreview({
  plugin,
  pack,
  current,
  repositories,
  pluginIds = [],
}) {
  const configured = Object.keys(
    record(current.github?.repositories) ? current.github.repositories : {},
  );
  const chosen = repositories ?? configured;
  for (const repository of chosen)
    if (!configured.includes(repository))
      fail(
        `${repository} is not a repository in .avoozl.json. Add it in Settings > Repositories first.`,
      );
  const next = structuredClone(current),
    changes = [];
  for (const unit of units(pack.settings, current, chosen)) {
    if (unit.skip) {
      changes.push({
        setting: settingName(unit),
        action: "skip",
        reason: unit.skip,
      });
      continue;
    }
    const from = read(current, unit.path);
    write(next, unit.path, unit.value);
    changes.push({
      setting: settingName(unit),
      action:
        from === undefined
          ? "create"
          : same(from, unit.value)
            ? "keep"
            : "change",
      ...(from === undefined ? {} : { from }),
      to: unit.value,
    });
  }
  const warnings = [];
  for (const repository of chosen) {
    const notes = lowered(
      whoCounts(current.github.repositories[repository]),
      whoCounts(next.github.repositories[repository]),
      repository,
    );
    if (!notes.length) continue;
    warnings.push(...notes);
    for (const change of changes)
      if (
        change.setting.startsWith(`github.repositories.${repository}.`) &&
        /\.(?:allowedActors|minimumPermission)$/.test(change.setting)
      )
        change.warning = notes.join(" ");
  }
  // The result must still be a valid `.avoozl.json`.
  checked(
    () => {
      if (next.github !== undefined) normalizeGitHubPolicy(next.github);
      validateContentRules(next.contentRules, { pluginIds });
      flowSection(next.flow);
      deliveryPolicy(next);
    },
    /^/g,
    "importing would make .avoozl.json invalid: ",
  );
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        id: plugin.id,
        version: plugin.version,
        hash: plugin.hash,
        chosen,
        changes,
      }),
    )
    .digest("hex");
  return {
    id: plugin.id,
    version: plugin.version,
    description: pack.description ?? null,
    repositories: chosen,
    changes,
    warnings,
    previewHash,
    imported: record(current.packs?.[plugin.id])
      ? current.packs[plugin.id]
      : null,
    next,
  };
}

// `.avoozl.json` after an import: the settings, and `packs` naming where
// each one came from. A setting another pack set before moves to this one.
export function withProvenance(preview, { at, by }) {
  const next = structuredClone(preview.next),
    names = preview.changes
      .filter((change) => change.action !== "skip")
      .map((change) => change.setting);
  const packs = record(next.packs) ? next.packs : {};
  for (const [id, entry] of Object.entries(packs))
    if (id !== preview.id && Array.isArray(entry?.settings))
      entry.settings = entry.settings.filter((name) => !names.includes(name));
  packs[preview.id] = {
    version: preview.version,
    importedAt: at,
    ...(by ? { importedBy: by } : {}),
    settings: names,
  };
  next.packs = packs;
  return next;
}
