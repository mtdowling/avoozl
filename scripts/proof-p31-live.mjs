#!/usr/bin/env node
// Proof P31 action (8): `untriaged.view` with `refresh: true` against real
// GitHub with the owner's `gh` login, read only. It runs on a copy of a
// workspace's `.avoozl.json` and database in a temporary directory, so the
// workspace itself is never opened for writing. Every request goes through
// a guard that allows only the read-only search on the named repositories
// and refuses anything else before it leaves the machine.
//
//   node scripts/proof-p31-live.mjs --workspace <root> --repository o/a [--repository o/b]
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { GitHubClient } from "../src/app/github.mjs";
import { Operations } from "../src/app/operations.mjs";
import { Store } from "../src/app/store.mjs";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" },
    repository: { type: "string", multiple: true },
  },
});
if (!values.workspace || !values.repository?.length) {
  console.error(
    "Name the workspace with --workspace and each repository to read with --repository.",
  );
  process.exit(2);
}
const source = path.resolve(values.workspace),
  allowed = new Set(values.repository.map((name) => name.toLowerCase())),
  sourceDb = path.join(source, ".avoozl", "local", "workspace.sqlite");

const hash = (file) =>
  fs.existsSync(file)
    ? createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : null;
const hashes = () => ({
  ".avoozl.json": hash(path.join(source, ".avoozl.json")),
  "workspace.sqlite": hash(sourceDb),
});
const before = hashes();

// The copy: the policy, keeping only the allowed repositories, and a
// SQLite backup made with the source opened read only.
const copy = fs.mkdtempSync(
  path.join(process.env.KIROCREW_SCRATCH || os.tmpdir(), "avoozl-p31-live-"),
);
const config = JSON.parse(
  fs.readFileSync(path.join(source, ".avoozl.json"), "utf8"),
);
for (const name of Object.keys(config.github?.repositories || {}))
  if (!allowed.has(name.toLowerCase())) delete config.github.repositories[name];
fs.writeFileSync(path.join(copy, ".avoozl.json"), JSON.stringify(config));
fs.mkdirSync(path.join(copy, ".avoozl", "local"), { recursive: true });
const copyDb = path.join(copy, ".avoozl", "local", "workspace.sqlite");
if (fs.existsSync(sourceDb))
  execFileSync("sqlite3", ["-readonly", sourceDb, `.backup '${copyDb}'`]);

// The guard. Only POST /graphql with a search (no mutation) whose query
// names an allowed repository leaves the machine.
const requests = { allowed: 0, refused: [] };
const guarded = async (url, init = {}) => {
  const method = init.method || "GET",
    target = new URL(url);
  let ok = false;
  if (method === "POST" && target.pathname === "/graphql") {
    const body = JSON.parse(init.body || "{}"),
      repository = /^repo:(\S+)\s/.exec(body.variables?.q || "")?.[1];
    ok =
      !/\bmutation\b/.test(body.query || "") &&
      /search\(query/.test(body.query || "") &&
      allowed.has(String(repository).toLowerCase());
  }
  if (!ok) {
    requests.refused.push(`${method} ${target.pathname}`);
    throw new Error(`P31 live guard refused ${method} ${target.pathname}`);
  }
  requests.allowed += 1;
  return fetch(url, init);
};

const started = Date.now(),
  store = new Store(copyDb);
let view;
try {
  const ops = new Operations(store, {
    github: new GitHubClient({ fetch: guarded }),
    workspaceRoot: copy,
  });
  view = await ops.execute("untriaged.view", { refresh: true });
} finally {
  store.close();
}
const after = hashes();

const report = {
  mode: view.mode,
  enabled: view.enabled,
  repositories: view.repositories.map((row) => ({
    repository: row.repository,
    searched: row.searched,
    untriaged: row.count,
    issues: view.items.filter(
      (item) => item.repository === row.repository && item.kind === "issue",
    ).length,
    pullRequests: view.items.filter(
      (item) => item.repository === row.repository && item.kind === "pr",
    ).length,
    truncated: row.truncated,
    error: row.error,
    query: row.query,
  })),
  requests: { searches: requests.allowed, refused: requests.refused },
  seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
  hashes: { before, after },
};
console.log(JSON.stringify(report, null, 2));
process.exit(
  report.requests.refused.length ||
    !report.sourceUnchanged ||
    report.repositories.some((row) => row.error)
    ? 1
    : 0,
);
