// The privacy scan (Requirement 102.23-102.25, design §4.32.4, task 56.11).
// No public Avoozl write names the machine it ran on: no hostname or IP
// literal, no internal domain, no home path, and not this machine's own
// hostname or username. It runs inside content rules (`check` in
// content-rules.mjs) as the always-on set `builtin:privacy`, so a hit
// refuses the write before it is made, names the rule and line but never
// the text, and a false hit uses the existing allow-once path.
//
// Two scopes. `text` (GitHub writes, commit messages, ref names, journal
// records) gets every rule. `code` (a pushed diff's added lines) keeps only
// this machine's own names (which covers its own home path) and the private
// domain list, because code and test fixtures legitimately say
// `options.local`, `127.0.0.1` or a made-up home path in a fixture.
//
// The owner's internal domains are a private, machine-local list in the
// machine config (`privacy.internalDomains`), never in a repository. This
// machine's hostname and username are read at scan time. A machine is named
// in records only by its public alias (`machine.alias` in machine config);
// unset, a neutral two-word name is generated once and stored.
import { randomInt } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fail } from "./store.mjs";

export const PRIVACY_SET = "builtin:privacy";
const ALIAS = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Account and host names that identify nobody (CI runners, defaults).
// shortcut: a fixed list; extend it when a shared default causes false hits.
const GENERIC = new Set([
  "admin",
  "administrator",
  "ec2-user",
  "localhost",
  "root",
  "runner",
  "runneradmin",
  "ubuntu",
  "user",
]);

// Rules every public text gets: [rule, RegExp, scopes].
const OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
const SHAPE_RULES = [
  [
    "ip-literal",
    new RegExp(String.raw`(?<![\w.])(?:${OCTET}\.){3}${OCTET}(?![\w.])`),
  ],
  // shortcut: IPv6 needs three colons and a digit, so `a::b` code paths and
  // clock times pass; `::1` alone is caught by the loopback rule.
  [
    "ip-literal",
    /(?<![\w:.])(?=[0-9a-f:]*\d)(?=(?:[0-9a-f]{0,4}:){3})[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){3,7}(?![\w:])/i,
  ],
  ["loopback", /(?<![\w.-])localhost(?![\w-])|(?<![\w:])::1(?![\w:])/i],
  [
    "internal-domain",
    /(?<![\w-])(?:[a-z0-9-]+\.)+(?:corp|internal|local|lan)(?![\w.-])/i,
  ],
];
const PATH_RULES = [
  ["home-path", /\/Users\/[A-Za-z0-9._-]+/],
  ["home-path", /\/home\/[A-Za-z0-9._-]+/],
  ["home-path", /\b[A-Za-z]:\\+Users\\+[^\\\s]+/i],
  ["home-path", /(?<![\w.:/~$%-])~\//],
];

function readConfig(configFile) {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8")) || {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

// This machine's names, read now. `override` ({hostname, username}) is for
// tests, which use made-up names only.
function machineFacts(override = null) {
  if (override) return override;
  let username = "";
  try {
    username = os.userInfo().username;
  } catch {}
  return { hostname: os.hostname(), username };
}

// The names that identify this machine: the full hostname, its first label,
// and the username, without generic or very short ones.
function ownNames({ hostname, username } = {}) {
  const host = String(hostname ?? "").trim(),
    names = new Set([host, host.split(".")[0], String(username ?? "").trim()]);
  return [...names].filter(
    (name) => name.length >= 3 && !GENERIC.has(name.toLowerCase()),
  );
}

// The owner's private internal domains, from machine config.
export function internalDomains(configFile) {
  const listed = configFile
    ? readConfig(configFile)?.privacy?.internalDomains
    : null;
  return Array.isArray(listed)
    ? listed
        .filter((d) => typeof d === "string")
        .map((d) => d.trim().replace(/^\*?\./, ""))
        .filter((d) => /^[A-Za-z0-9.-]+$/.test(d) && d.includes("."))
    : [];
}

// [{rule, pattern}] for one scope, built from this machine's facts.
export function privacyRules({ scope = "text", machine, configFile } = {}) {
  const word = (value) =>
      new RegExp(`(?<![A-Za-z0-9_])${escape(value)}(?![A-Za-z0-9_])`, "i"),
    rules = [
      ...ownNames(machineFacts(machine)).map((name) => [
        "machine-name",
        word(name),
      ]),
      ...internalDomains(configFile).map((domain) => [
        "internal-domain",
        new RegExp(
          `(?<![A-Za-z0-9-])(?:[A-Za-z0-9-]+\\.)*${escape(domain)}(?![A-Za-z0-9-])`,
          "i",
        ),
      ]),
      ...(scope === "text" ? [...PATH_RULES, ...SHAPE_RULES] : []),
    ];
  return rules.map(([rule, pattern]) => ({ rule, pattern }));
}

// Each hit as {index, rule}, at most one per rule and line; never the text.
// `decode` undoes the encodings a name can hide behind.
export function privacyHits(lines, rules, decode = (value) => value) {
  const hits = [];
  lines.forEach((raw, index) => {
    const plain = decode(raw);
    for (const rule of [...new Set(rules.map((r) => r.rule))])
      if (
        rules.some(
          (r) =>
            r.rule === rule &&
            (r.pattern.test(raw) || (plain !== raw && r.pattern.test(plain))),
        )
      )
        hits.push({ index, rule });
  });
  return hits;
}

// Whether `alias` may name this machine in public records.
export function aliasProblem(alias, machine) {
  if (typeof alias !== "string" || !ALIAS.test(alias))
    return "An alias is a letter, then up to 39 letters, digits or dashes.";
  const lower = alias.toLowerCase();
  if (
    ownNames(machineFacts(machine)).some((n) => lower.includes(n.toLowerCase()))
  )
    return "An alias may not contain this machine's hostname or username.";
  return null;
}

const ADJECTIVES = [
  "amber",
  "brisk",
  "calm",
  "clear",
  "dawn",
  "deep",
  "early",
  "fair",
  "gentle",
  "green",
  "keen",
  "light",
  "lucky",
  "mild",
  "noble",
  "quiet",
  "rapid",
  "silver",
  "steady",
  "swift",
  "tidy",
  "warm",
  "wise",
  "young",
];
const NOUNS = [
  "badger",
  "beacon",
  "cedar",
  "comet",
  "falcon",
  "fern",
  "harbor",
  "heron",
  "lantern",
  "maple",
  "meadow",
  "otter",
  "pebble",
  "pine",
  "raven",
  "river",
  "robin",
  "sparrow",
  "summit",
  "thistle",
  "willow",
  "wren",
  "yarrow",
  "zephyr",
];
const pick = (list) => list[randomInt(list.length)];
const titled = (word) => word[0].toUpperCase() + word.slice(1);

// This machine's public alias: `machine.alias` in machine config, else a
// neutral two-word name generated once and stored there. Never derived from
// the hostname or username.
export function machineAlias({ configFile, machine = null } = {}) {
  if (!configFile) fail("Name the machine config file.", 400);
  const config = readConfig(configFile),
    stored = config?.machine?.alias;
  if (typeof stored === "string" && !aliasProblem(stored, machine))
    return stored;
  let alias;
  do alias = `${titled(pick(ADJECTIVES))}-${titled(pick(NOUNS))}`;
  while (aliasProblem(alias, machine));
  return setMachineAlias({ configFile, alias, machine });
}

// Saves the owner's pick; refuses one that names this machine.
export function setMachineAlias({ configFile, alias, machine = null }) {
  const problem = aliasProblem(alias, machine);
  if (problem) fail(problem, 400);
  const config = readConfig(configFile);
  config.machine = { ...(config.machine || {}), alias };
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  return alias;
}
