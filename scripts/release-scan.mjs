#!/usr/bin/env node
// Release scan (design §13 gates 5 and 7, R24.2). Lists what the npm package
// and the Kiro Crew app package would ship, and fails when either holds an
// excluded file or a secret, private name, or machine path that is not
// allowed below.
//
//   node scripts/release-scan.mjs            scan the two packages, plugin docs and
//                                            fake plugins; exit 1 on a finding
//   node scripts/release-scan.mjs --tree     also count findings in every tracked file
//   node scripts/release-scan.mjs --history  also count findings added anywhere in HEAD's history
//   --json                                   print the report as JSON
//
// Research under docs/research/ and receipts under docs/evidence/ record
// what was seen at the time and are never rewritten (AGENTS.md). The
// exclusion list keeps them, plans, specs, scripts, and tests out of both
// packages instead.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchLine, parseTerms } from "../src/app/content-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Public rules. Names that are themselves private (internal systems, the
// managed remote harness, private repositories, machine names) are not
// written here: they come from a local terms file, one `rule: regex` per
// line, at $AVOOZL_RELEASE_TERMS or .avoozl/local/release-terms.txt. Its
// `allow:` and `allow <rule>:` lines cancel that file's own matches on the
// same line, never a public rule's (R40.15).
const PUBLIC_RULES = [
  ["secret", "aws-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  [
    "secret",
    "github-token",
    /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{22,}/,
  ],
  ["secret", "private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["secret", "slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["secret", "api-key", /\bsk-(?:ant|proj)-[A-Za-z0-9_-]{12,}/],
  ["absolute-path", "macos-home", /\/Users\/[A-Za-z0-9._-]+/],
  ["absolute-path", "macos-temp", /\/private\/(?:tmp|var)\//],
  ["absolute-path", "linux-home", /\/home\/[a-z][a-z0-9_-]*\//],
  ["absolute-path", "windows-home", /\b[A-Za-z]:\\+Users\\+/],
].map(([category, rule, pattern]) => ({ category, rule, pattern }));

// The terms parser and per-line matcher are content-rules.mjs's (design
// §4.9): one format, so a company writes one list.
export { parseTerms };

function localTerms() {
  const file =
    process.env.AVOOZL_RELEASE_TERMS ||
    path.join(root, ".avoozl", "local", "release-terms.txt");
  return fs.existsSync(file) ? parseTerms(fs.readFileSync(file, "utf8")) : [];
}

export const RULES = [...PUBLIC_RULES, ...localTerms()];
export const PRIVATE_TERMS_LOADED = RULES.length > PUBLIC_RULES.length;

// Paths that never ship. A package that would contain one fails the scan.
export const EXCLUDED = [
  /^docs\/evidence\//,
  /^docs\/research\//,
  /^plans\//,
  /^\.kiro\//,
  /^scripts\//,
  /(^|\/)test\//,
  /\.test\.mjs$/,
  /^\.avoozl\.json$/,
  /(^|\/)node_modules\//,
];

// Kiro Crew copies the whole app directory, so the page's own unit tests ship
// in the app package. They are scanned like every other file.
const APP_SHIPS = /^kirocrew-app\/ui\/test\//;

// Findings a package may hold, each with its reason.
export const ALLOWED = [];

// Every rule that matches one line of text. A private-term finding carries
// no text: terminal output gets pasted into chats and CI logs (R40.13).
export function scanText(text, rules = RULES) {
  const hits = [];
  text.split("\n").forEach((line, index) => {
    for (const { category, rule } of matchLine(line, rules))
      hits.push({
        category,
        rule,
        line: index + 1,
        ...(category === "private-name"
          ? {}
          : { text: line.trim().slice(0, 160) }),
      });
  });
  return hits;
}

export function npmFiles() {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    },
  );
  return JSON.parse(output)[0].files.map((file) => file.path);
}

// Kiro Crew copies the whole app directory except these names.
const APP_COPY_SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv"]);
function appFiles() {
  const app = path.join(root, "kirocrew-app");
  if (!fs.existsSync(path.join(app, "bin", "lib", "cli.mjs")))
    throw Error("Build the app package first: npm run build:kirocrew-app");
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (APP_COPY_SKIP.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile())
        files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(app);
  return files;
}

const binary = (buffer) => buffer.subarray(0, 8000).includes(0);

function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(root, file));
    if (binary(buffer)) continue;
    for (const hit of scanText(buffer.toString("utf8")))
      findings.push({ file, ...hit });
  }
  return findings;
}

const allowed = (finding) =>
  ALLOWED.find(
    (entry) =>
      entry.rule === finding.rule &&
      (entry.file === finding.file ||
        entry.file === finding.file.replace(/^kirocrew-app\/bin\/lib\//, "")),
  );

export function scanPackages() {
  const packages = { npm: npmFiles(), app: appFiles() },
    report = {};
  for (const [name, files] of Object.entries(packages)) {
    const findings = scanFiles(files);
    report[name] = {
      files: files.length,
      excluded: files.filter(
        (file) =>
          EXCLUDED.some((pattern) => pattern.test(file)) &&
          !(name === "app" && APP_SHIPS.test(file)),
      ),
      findings: findings.filter((finding) => !allowed(finding)),
      allowed: findings
        .filter(allowed)
        .map((finding) => ({ ...finding, reason: allowed(finding).reason })),
    };
  }
  return report;
}

// Plugin docs and the fake plugins (R34.10, task 8.8). The fakes stay out of
// both packages, but they are public in the repository, so they are scanned
// on their own and any finding fails the scan: no company-internal tool may
// be named in them.
export const PLUGIN_PATHS = [
  "docs/plugins.md",
  "src/app/test/fixtures/plugins",
];

export function pluginFiles() {
  const files = [];
  const walk = (relative) => {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isDirectory())
      for (const name of fs.readdirSync(full).sort())
        walk(path.posix.join(relative, name));
    else files.push(relative);
  };
  for (const entry of PLUGIN_PATHS) walk(entry);
  return files;
}

export function scanPlugins() {
  const files = pluginFiles();
  return { files: files.length, findings: scanFiles(files) };
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
}

function tally(findings) {
  const rules = {};
  for (const finding of findings) {
    const entry = (rules[finding.rule] ||= {
      category: finding.category,
      hits: 0,
      files: new Set(),
      commits: new Set(),
    });
    entry.hits++;
    entry.files.add(finding.file);
    if (finding.commit) entry.commits.add(finding.commit);
  }
  return Object.fromEntries(
    Object.entries(rules).map(([rule, entry]) => [
      rule,
      {
        category: entry.category,
        hits: entry.hits,
        files: [...entry.files].sort(),
        commits: entry.commits.size,
      },
    ]),
  );
}

export function scanTree() {
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  return tally(
    scanFiles(files.filter((file) => fs.existsSync(path.join(root, file)))),
  );
}

// Lines added by every commit reachable from HEAD.
export function scanHistory() {
  const findings = [];
  let commit = null,
    file = null;
  const log = git([
    "log",
    "-p",
    "--no-color",
    "--no-ext-diff",
    "--format=commit %H",
    "HEAD",
  ]);
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7);
    else if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ (b\/)?/, "");
    else if (line.startsWith("+") && file !== "/dev/null")
      for (const hit of scanText(line.slice(1)))
        findings.push({ ...hit, file, commit });
  }
  return {
    commits: Number(git(["rev-list", "--count", "HEAD"]).trim()),
    rules: tally(findings),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = new Set(process.argv.slice(2)),
    report = {
      privateTerms: PRIVATE_TERMS_LOADED,
      packages: scanPackages(),
      plugins: scanPlugins(),
    };
  if (!PRIVATE_TERMS_LOADED)
    console.error(
      "No local release terms: private names were not checked. See the header of this script.",
    );
  if (args.has("--tree")) report.tree = scanTree();
  if (args.has("--history")) report.history = scanHistory();
  const failed =
    report.plugins.findings.length > 0 ||
    Object.values(report.packages).some(
      (entry) => entry.excluded.length || entry.findings.length,
    );
  if (args.has("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const [name, entry] of Object.entries(report.packages)) {
      console.log(
        `${name} package: ${entry.files} files, ${entry.excluded.length} excluded, ${entry.findings.length} findings, ${entry.allowed.length} allowed`,
      );
      for (const file of entry.excluded)
        console.log(`  excluded file: ${file}`);
      for (const finding of entry.findings)
        console.log(
          `  ${finding.file}:${finding.line} ${finding.rule}` +
            (finding.text === undefined ? "" : `: ${finding.text}`),
        );
    }
    console.log(
      `plugin docs and fixtures: ${report.plugins.files} files, ${report.plugins.findings.length} findings`,
    );
    for (const finding of report.plugins.findings)
      console.log(
        `  ${finding.file}:${finding.line} ${finding.rule}` +
          (finding.text === undefined ? "" : `: ${finding.text}`),
      );
    for (const scope of ["tree", "history"]) {
      if (!report[scope]) continue;
      const rules = scope === "history" ? report[scope].rules : report[scope];
      console.log(
        scope === "history"
          ? `history: ${report.history.commits} commits`
          : "tree:",
      );
      for (const [rule, entry] of Object.entries(rules))
        console.log(
          `  ${entry.category} ${rule}: ${entry.hits} hits in ${entry.files.length} files` +
            (scope === "history" ? `, ${entry.commits} commits` : ""),
        );
    }
  }
  process.exitCode = failed ? 1 : 0;
}
