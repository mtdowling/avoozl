#!/usr/bin/env node
// Maps changed paths to the tests that can be affected. Pull requests and
// `npm run test:changed` use it; main and the nightly run always run it with
// --full. Anything it cannot classify selects every test.
//
//   node scripts/test/select-tests.mjs [--base REV] [--full] [--json] [--github-output]
//
// shortcut: the "reads" tables below were taken from a trace of which repo
// files each test opens. A new test that reads docs, examples or app files is
// not in a table until someone adds it. Main and the nightly run cover it.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
// Test files and their helpers sit in a test/ folder beside the modules.
const IN_TEST_DIR = /^src\/app\/(.+\/)?test\//;

// Tests that read repository files outside src/ while they run.
const READS = {
  docs: [
    "epic-templates",
    "no-sage",
    "proof-p32",
    "release-scan",
    "spec-manifests-on-tree",
  ],
  examples: [
    "codex-definition",
    "epic-templates",
    "mcp-tools",
    "no-sage",
    "process-executor",
    "process-roles",
    "proof-rc-p7",
    "proof-rc-p17",
    "release-scan",
    "workspace",
  ],
  ui: [
    "executor-boundary",
    "github-branch-rules",
    "installed-app-files",
    "kirocrew-app",
    "kirocrew-app-package",
    "no-sage",
    "page-operations",
    "release-scan",
    "role-prompts",
    "spec-builder-grant",
  ],
};

const SCANNERS = ["no-sage", "release-scan"];

const list = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
export const nodeTestFiles = () =>
  [
    ...list("git", [
      "ls-files",
      "-co",
      "--exclude-standard",
      "src/*.test.mjs",
      "src/app/*test/*.test.mjs",
    ]),
  ].sort();
export const uiTestFiles = () =>
  list("git", [
    "ls-files",
    "-co",
    "--exclude-standard",
    "kirocrew-app/ui/test/*.test.mjs",
  ]).sort();

// The local files a module imports, by static import, re-export, or a
// literal import() call.
const IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
function closure(entry, cache = new Map()) {
  const seen = new Set(),
    todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let deps = cache.get(file);
    if (!deps) {
      deps = [];
      let text = "";
      try {
        text = fs.readFileSync(path.join(root, file), "utf8");
      } catch {}
      for (const m of text.matchAll(IMPORT)) {
        const rel = path.posix.join(path.posix.dirname(file), m[1]);
        if (fs.existsSync(path.join(root, rel))) deps.push(rel);
      }
      cache.set(file, deps);
    }
    todo.push(...deps);
  }
  return seen;
}

// A test that starts a node process may run any file the command line loads.
const STARTS_PROCESS = /process\.execPath|cli\.mjs|avoozl\.mjs|\bfork\s*\(/;
const SPAWN_ENTRIES = ["cli.mjs", "kirocrew-app/bin/avoozl.mjs"];

const directImports = (file) => {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  return [...text.matchAll(IMPORT)].map((m) =>
    path.posix.join(path.posix.dirname(file), m[1]),
  );
};
const base = (f) => path.posix.basename(f).replace(/\.test\.mjs$/, "");
const pick = (names, files) =>
  files.filter((f) => IN_TEST_DIR.test(f) && names.includes(base(f)));

export function select(
  changed,
  { all = nodeTestFiles(), ui = uiTestFiles() } = {},
) {
  const out = {
    full: false,
    reasons: [],
    node: new Set(),
    ui: false,
    specLint: false,
  };
  const full = (why) => {
    out.full = true;
    out.reasons.push(why);
  };
  if (!changed.length) full("no changed files could be read");
  const cache = new Map(),
    srcChanged = [];
  for (const f of changed) {
    if (out.full) break;
    const isTest = /\.test\.mjs$/.test(f);
    if (f === "scripts/test/run-tests.mjs")
      full(`${f}: the selector or runner changed`);
    else if (/^scripts\/proofs\//.test(f)) {
      for (const t of pick(SCANNERS, all)) out.node.add(t);
      out.reasons.push(`${f}: live proof script, read only by the scanners`);
    } else if (
      /^(package(-lock)?\.json|\.github\/|scripts\/|bin\/|\.nvmrc|\.node-version|biome\.json$)/.test(
        f,
      )
    )
      full(`${f}: package, CI or script file`);
    else if (IN_TEST_DIR.test(f) && !isTest) full(`${f}: test helper`);
    else if (isTest && all.includes(f)) {
      out.node.add(f);
      out.reasons.push(`${f}: changed test`);
    } else if (/^kirocrew-app\/ui\/test\//.test(f)) {
      // Page tests and their browser helpers; only the repository scanners read them.
      out.ui = true;
      for (const t of pick(SCANNERS, all)) out.node.add(t);
      out.reasons.push(`${f}: page test or helper`);
    } else if (/^scripts\/proofs\//.test(f)) {
      for (const t of pick(SCANNERS, all)) out.node.add(t);
      out.reasons.push(`${f}: live proof script, read only by the scanners`);
    } else if (/^kirocrew-app\/ui\/(src|assets)\//.test(f)) {
      out.ui = true;
      for (const t of pick(READS.ui, all)) out.node.add(t);
      out.reasons.push(`${f}: UI source`);
    } else if (f.startsWith("kirocrew-app/") && !/\.md$/.test(f))
      full(`${f}: app file`);
    else if (f.startsWith("prompts/")) full(`${f}: prompt read at run time`);
    else if (/^src\/.+\.mjs$/.test(f)) srcChanged.push(f);
    else if (f.startsWith("src/")) full(`${f}: non-module file under src`);
    else if (f === "cli.mjs") srcChanged.push(f);
    else if (f.startsWith("examples/")) {
      for (const t of pick(READS.examples, all)) out.node.add(t);
      out.reasons.push(`${f}: example read by tests`);
    } else if (
      /^docs\//.test(f) ||
      /^\.kiro\/specs\//.test(f) ||
      /^[A-Za-z_-]+\.md$/.test(f) ||
      /^kirocrew-app\/.*\.md$/.test(f)
    ) {
      for (const t of pick(READS.docs, all)) out.node.add(t);
      out.specLint = true;
      out.reasons.push(`${f}: docs or spec`);
    } else full(`${f}: not classified`);
  }
  if (!out.full && srcChanged.length) {
    out.ui = true;
    const map = JSON.parse(
      fs.readFileSync(path.join(root, "scripts/test/test-map.json"), "utf8"),
    ).files;
    for (const s of srcChanged) {
      const ran = (map[s] ?? []).filter((t) => all.includes(t));
      for (const t of ran) out.node.add(t);
      // A file no test ran a function of (or that is not in the map) falls
      // back to the tests that import it or start the CLI.
      if (!ran.length) {
        const cli = new Set(
          SPAWN_ENTRIES.flatMap((e) => [...closure(e, cache)]),
        );
        for (const t of all) {
          const text = fs.readFileSync(path.join(root, t), "utf8");
          if (
            closure(t, cache).has(s) ||
            (STARTS_PROCESS.test(text) && cli.has(s))
          )
            out.node.add(t);
        }
      }
      // Tests that import the file directly always run.
      for (const t of all)
        if (closure(t, cache).has(s) && directImports(t).includes(s))
          out.node.add(t);
    }
    out.reasons.push(
      `${srcChanged.length} source file(s): tests that run their functions (scripts/test/test-map.json) or import them`,
    );
  }
  if (out.full) {
    out.node = new Set(all);
    out.ui = true;
    out.specLint = true;
  }
  return {
    ...out,
    node: [...out.node].sort(),
    nodeTotal: all.length,
    uiFiles: out.ui ? ui : [],
    uiTotal: ui.length,
  };
}

export function changedFiles(base) {
  const merge = list("git", ["merge-base", base, "HEAD"])[0];
  return [
    ...new Set([
      ...list("git", ["diff", "--name-only", "--no-renames", merge]),
      ...list("git", ["ls-files", "--others", "--exclude-standard"]),
    ]),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const files = args.includes("--full")
    ? []
    : changedFiles(at("--base") ?? "origin/main");
  const sel = select(files);
  if (args.includes("--full")) sel.reasons = ["--full: every test runs"];
  if (args.includes("--json")) console.log(JSON.stringify(sel, null, 2));
  else {
    console.log(`Changed files: ${files.length}`);
    for (const r of sel.reasons.slice(0, 12)) console.log(`  ${r}`);
    if (sel.reasons.length > 12)
      console.log(`  ... ${sel.reasons.length - 12} more`);
    console.log(
      `Node tests: ${sel.node.length} of ${sel.nodeTotal}${sel.full ? " (full run)" : ""}`,
    );
    console.log(`UI tests: ${sel.uiFiles.length} of ${sel.uiTotal}`);
    if (!sel.full)
      console.log(
        `Skipped: ${sel.nodeTotal - sel.node.length} node test files, ${sel.uiTotal - sel.uiFiles.length} UI test files; their inputs did not change`,
      );
  }
  if (args.includes("--github-output") && process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `any=${sel.node.length || sel.uiFiles.length ? "true" : "false"}\n`,
    );
}
