#!/usr/bin/env node
// One-time migration of the old rule-based routing keys (removed
// 2026-11-13) to the one routing prompt (design §4.10).
//
//   node scripts/migrate-routing.mjs <file> [<file> ...]
//
// Each file is a workspace .avoozl.json or this machine's
// ~/.config/avoozl/config.json. Rules, presets and the router become plain
// prompt lines. A machine file gets them as its `routing.prompt`; a tracked
// .avoozl.json may not hold a prompt (it can name private machines), so its
// old keys are removed and the lines are printed to paste into Settings ›
// Routing. Old provider keys (cooldownMinutes, windowHours, groups,
// fallback) are dropped. A copy of each changed file is kept beside it as
// <file>.before-routing-prompt. Running it twice changes nothing.
//
// shortcut: this is the only reader of the old keys; delete it once the
// owner's machines are migrated (there are no other users).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const record = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.join(", ") : String(v));

// One old rule as one prompt line.
export function ruleLine(rule, where = "") {
  const when = Object.entries(rule.when || {})
    .map(([key, value]) => `${key} ${list(value)}`)
    .join(" and ");
  const then = [];
  if (rule.keepLocal) then.push("keep it on local");
  if (rule.on && rule.on !== "local")
    then.push(
      rule.on === "any"
        ? "it may run on any crew"
        : rule.on.startsWith("tags:")
          ? `it may run on a crew tagged ${rule.on.slice(5)}`
          : `run it on crew ${rule.on}`,
    );
  if (rule.requireTags?.length)
    then.push(`only on a crew tagged ${list(rule.requireTags)}`);
  if (rule.forbidTags?.length)
    then.push(`never on a crew tagged ${list(rule.forbidTags)}`);
  const s = rule.session;
  if (s?.model || s?.agent)
    then.push(`use ${[s.agent, s.model].filter(Boolean).join(" / ")}`);
  if (s?.choices?.length)
    then.push(
      `split it across ${s.choices
        .map((c) => `${c.model || c.agent} (weight ${c.weight ?? 1})`)
        .join(", ")}`,
    );
  if (rule.route) then.push(`route ${rule.route}`);
  return `- ${where}${when ? `When ${when}: ` : "Every task: "}${then.join("; ") || "no change"}.`;
}

const PRESET_LINES = {
  "keep-local": "- Keep tasks on local unless local is full.",
  "spread-out":
    "- Spread tasks across crews; prefer the crew running the fewest chats.",
};

// The prompt lines and the cleaned value for one parsed file.
export function migrate(value, { tracked }) {
  const lines = [],
    dropped = [];
  const take = (routing, where) => {
    if (!record(routing)) return;
    for (const rule of routing.rules || []) lines.push(ruleLine(rule, where));
    const preset = routing.pick?.preset;
    if (preset && PRESET_LINES[preset]) lines.push(PRESET_LINES[preset]);
    if (routing.pick?.weights) dropped.push("routing.pick.weights");
    if (routing.router?.instructions)
      lines.unshift(routing.router.instructions.trim());
  };
  const next = structuredClone(value);
  const old = (r) =>
    record(r) && ["rules", "pick", "router"].some((k) => k in r);
  let changed = false;
  if (old(next.routing)) {
    take(next.routing, "");
    const router = next.routing.router || {};
    delete next.routing.rules;
    delete next.routing.pick;
    delete next.routing.router;
    if (!tracked) {
      if (lines.length) next.routing.prompt = lines.join("\n");
      if (router.enabled === true) next.routing.enabled = true;
      if (router.model) next.routing.model = router.model;
    }
    if (!Object.keys(next.routing).length) delete next.routing;
    changed = true;
  }
  for (const [id, project] of Object.entries(
    record(next.projects) ? next.projects : {},
  ))
    if (record(project) && project.routing !== undefined) {
      take(project.routing, `In repository ${id}: `);
      delete project.routing;
      changed = true;
    }
  if (record(next.providers))
    for (const key of ["cooldownMinutes", "windowHours", "groups", "fallback"])
      if (key in next.providers) {
        dropped.push(`providers.${key}`);
        delete next.providers[key];
        changed = true;
      }
  return { value: next, lines, dropped, changed };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error(
      "Usage: node scripts/migrate-routing.mjs <file> [<file> ...]",
    );
    process.exit(2);
  }
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8"),
      tracked = path.basename(file) === ".avoozl.json",
      result = migrate(JSON.parse(text), { tracked });
    if (!result.changed) {
      console.log(`${file}: nothing to migrate.`);
      continue;
    }
    fs.writeFileSync(`${file}.before-routing-prompt`, text);
    fs.writeFileSync(file, JSON.stringify(result.value, null, 2) + "\n");
    console.log(`${file}: migrated.`);
    if (result.dropped.length)
      console.log(`  Dropped: ${result.dropped.join(", ")}.`);
    if (tracked && result.lines.length)
      console.log(
        "  Paste these lines into Settings › Routing › Routing prompt:\n" +
          result.lines.map((l) => `    ${l}`).join("\n"),
      );
  }
}
