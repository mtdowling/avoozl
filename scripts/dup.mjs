#!/usr/bin/env node
// Copy/paste check with jscpd, configured in .jscpd.json.
//
//   node scripts/dup.mjs              whole repo; fails when duplicated lines
//                                     grew past scripts/dup-baseline.json
//   node scripts/dup.mjs --update     same, then lowers the baseline to the
//                                     current count (never raises it)
//   node scripts/dup.mjs --changed [--base REF]
//                                     clones that touch files changed since
//                                     the merge base with REF (origin/main);
//                                     fails when the change adds or grows one
//
// The whole-repo count is the gate on main. --changed is the fast step
// before a pull request: it scans only the changed files and the files that
// share a run of lines with them, at the merge base and now, and compares
// clones by file pair.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const jscpd = require("jscpd");
// jscpd's own file finder and defaults, so --changed scans the files the
// whole-repo run scans.
const inner = createRequire(require.resolve("jscpd"));
const { getFilesToDetect } = inner("@jscpd/finder");
const { getDefaultOptions } = inner("@jscpd/core");

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const git = (...a) =>
  execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });

const root = git("rev-parse", "--show-toplevel").trim();
process.chdir(root);
const config = JSON.parse(fs.readFileSync(".jscpd.json", "utf8"));
const BASELINE = "scripts/dup-baseline.json";

const detect = (paths, extra = {}) =>
  jscpd.detectClonesAndStatistic({
    ...config,
    ...extra,
    path: paths,
    silent: true,
    reporters: [],
  });

// The files jscpd scans, sorted, with their text. Detection then gets this
// explicit list: jscpd pairs each copy with the copy it saw first, so a
// fixed order gives the same count on every system.
const scannedFiles = () =>
  new Map(
    getFilesToDetect({ ...getDefaultOptions(), ...config, path: ["."] })
      .map((f) => [f.path.replace(/^\.\//, ""), f.content])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
const detectFiles = (files) =>
  files.length
    ? detect(files, { gitignore: false, ignore: [] })
    : { clones: [], statistic: null };

// Lines a clone covers, counted as jscpd counts them. The shorter side is
// used: jscpd 4 sometimes reports an end line far past the copy on one side.
const linesOf = (c) =>
  Math.min(
    c.duplicationA.end.line - c.duplicationA.start.line,
    c.duplicationB.end.line - c.duplicationB.start.line,
  );
const site = (d) => `${d.sourceId}:${d.start.line}-${d.end.line}`;
const describe = (c) =>
  `${linesOf(c)} lines  ${site(c.duplicationA)}  ${site(c.duplicationB)}`;
const round = (n) => Math.round(n * 100) / 100;

async function whole() {
  const started = Date.now();
  const { clones, statistic } = await detectFiles([...scannedFiles().keys()]);
  const t = statistic.total;
  const lines = clones.reduce((sum, c) => sum + linesOf(c), 0);
  const now = {
    duplicatedLines: lines,
    percentage: round((100 * lines) / t.lines),
  };
  const base = fs.existsSync(BASELINE)
    ? JSON.parse(fs.readFileSync(BASELINE, "utf8"))
    : null;
  console.log(
    `jscpd: ${clones.length} clones, ${now.duplicatedLines} duplicated lines (${now.percentage}%) in ${t.sources} files, ${((Date.now() - started) / 1000).toFixed(1)} s.`,
  );
  const top = Number(flag("--top") ?? 10);
  if (top > 0) {
    console.log(`Largest ${top}:`);
    for (const c of [...clones]
      .sort((a, b) => linesOf(b) - linesOf(a))
      .slice(0, top))
      console.log(`  ${describe(c)}`);
  }
  if (base)
    console.log(
      `Baseline: ${base.duplicatedLines} duplicated lines (${base.percentage}%).`,
    );
  if (base && now.duplicatedLines > base.duplicatedLines) {
    console.log(
      `Duplication grew by ${now.duplicatedLines - base.duplicatedLines} lines. Run \`npm run dup:changed\` on the change that added it, and share the code instead of copying it.`,
    );
    return 1;
  }
  if (args.includes("--update")) {
    if (base?.duplicatedLines === now.duplicatedLines) return 0;
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n");
    console.log(`Wrote ${BASELINE}.`);
  } else if (!base) {
    console.log(`No ${BASELINE}; run \`npm run dup -- --update\` to make it.`);
    return 1;
  } else if (now.duplicatedLines < base.duplicatedLines) {
    console.log(
      "Duplication fell; run `npm run dup -- --update` to lower the baseline.",
    );
  }
  return 0;
}

// Changed paths since the merge base, in the working tree, with untracked
// files. Maps each path to its path at the base (null when it is new).
function changes(mergeBase) {
  const out = new Map();
  const fields = git("diff", "--name-status", "-M", "-z", mergeBase).split(
    "\0",
  );
  for (let i = 0; i < fields.length - 1; ) {
    const status = fields[i++];
    if (status[0] === "R") {
      const from = fields[i++];
      out.set(fields[i++], from);
    } else {
      const file = fields[i++];
      if (status !== "D") out.set(file, status === "A" ? null : file);
    }
  }
  for (const file of git("ls-files", "-o", "--exclude-standard", "-z").split(
    "\0",
  ))
    if (file) out.set(file, null);
  return out;
}

// Each run of whole non-blank lines, whitespace removed, that starts a line
// and holds at least 120 characters (and at least three lines). Two copies
// of one 70-token clone share such a run in practice: over the 54 latest
// commits on main this found every clone pair a full scan found, while
// scanning about 85 files per commit instead of 1,250.
// shortcut: copies broken across lines differently share no run and are
// missed here; the whole-repo run on main still counts them.
const MIN_CHARS = 120,
  MIN_LINES = 3;
function windows(text) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, ""))
    .filter(Boolean);
  const out = new Set();
  for (let i = 0; i < lines.length; i++) {
    let run = "",
      k = i;
    while (k < lines.length && (k - i < MIN_LINES || run.length < MIN_CHARS))
      run += lines[k++] + "\n";
    if (run.length >= MIN_CHARS && k - i >= MIN_LINES) out.add(run);
  }
  return out;
}

// Reads many blobs at REF with one git process.
function blobsAt(ref, files) {
  const run = spawnSync("git", ["cat-file", "--batch"], {
    input: files.map((f) => `${ref}:${f}\n`).join(""),
    maxBuffer: 1 << 28,
  });
  const buf = run.stdout,
    out = new Map();
  let at = 0;
  for (const file of files) {
    const nl = buf.indexOf(10, at);
    const header = buf.subarray(at, nl).toString();
    at = nl + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ")[2]);
    out.set(file, buf.subarray(at, at + size));
    at += size + 1;
  }
  return out;
}

// Duplicated lines per file pair, for the clones that touch a changed file.
function byPair(clones, changed) {
  const pairs = new Map();
  for (const c of clones) {
    const a = c.duplicationA.sourceId,
      b = c.duplicationB.sourceId;
    if (!changed.has(a) && !changed.has(b)) continue;
    const key = [a, b].sort().join("\0");
    const entry = pairs.get(key) ?? { lines: 0, clones: [] };
    entry.lines += linesOf(c);
    entry.clones.push(c);
    pairs.set(key, entry);
  }
  return pairs;
}

async function changedOnly() {
  const started = Date.now();
  const ref = flag("--base") ?? "origin/main";
  const mergeBase = git("merge-base", "HEAD", ref).trim();
  const text = scannedFiles();
  const moved = changes(mergeBase);
  const changed = new Set([...moved.keys()].filter((f) => text.has(f)));
  if (!changed.size) {
    console.log(`dup:changed: no changed files to check since ${ref}.`);
    return 0;
  }

  const wanted = new Set();
  for (const f of changed) for (const w of windows(text.get(f))) wanted.add(w);
  const candidates = [...text.keys()].filter((f) => {
    if (changed.has(f)) return true;
    for (const w of windows(text.get(f))) if (wanted.has(w)) return true;
    return false;
  });

  const now = byPair((await detectFiles(candidates)).clones, changed);

  // The same files at the merge base, under their current names.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-dup-"));
  let before;
  try {
    const old = candidates.map((f) => (moved.has(f) ? moved.get(f) : f));
    const blobs = blobsAt(mergeBase, old.filter(Boolean));
    const present = [];
    candidates.forEach((f, i) => {
      const blob = old[i] && blobs.get(old[i]);
      if (!blob) return;
      fs.mkdirSync(path.join(temp, path.dirname(f)), { recursive: true });
      fs.writeFileSync(path.join(temp, f), blob);
      present.push(f);
    });
    process.chdir(temp);
    before = byPair((await detectFiles(present)).clones, changed);
  } finally {
    process.chdir(root);
    fs.rmSync(temp, { recursive: true, force: true });
  }

  let worse = 0;
  const rows = [...now.entries()].sort((x, y) => y[1].lines - x[1].lines);
  for (const [key, entry] of rows) {
    const was = before.get(key)?.lines ?? 0;
    const mark =
      entry.lines <= was ? "kept" : was ? `grew from ${was} lines` : "new";
    if (entry.lines > was) worse++;
    for (const c of entry.clones)
      console.log(`  ${mark.padEnd(20)} ${describe(c)}`);
  }
  console.log(
    `dup:changed: ${changed.size} changed files, ${candidates.length} scanned, ${rows.length} file pairs with clones, ${worse} new or grown, ${((Date.now() - started) / 1000).toFixed(1)} s.`,
  );
  if (worse)
    console.log(
      "Share the code (a helper, a loop, a table) instead of copying it. Don't suppress the clone.",
    );
  return worse ? 1 : 0;
}

process.exitCode = await (args.includes("--changed") ? changedOnly() : whole());
