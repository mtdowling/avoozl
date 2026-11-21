// Setup is two commands (simplify sim-4.5, §D12): `avoozl repository
// configure ID --root PATH` adds a checkout, and `avoozl rebuild` fills the
// cache from git and GitHub: the specs, their ticks, the claim branches and
// the spec issues. A fake GitHub answers reads and records every write; it
// must see none.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OWNER, specCheckout } from "./spec-checkout.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

const SPEC = {
  "requirements.md":
    "# Requirements\n\n### Requirement P1: Parse\n\n1. It SHALL parse.\n",
  "design.md": "# Design\n\nOne parser.\n",
  "tasks.md": [
    "---",
    "repo: app",
    "---",
    "# Tasks",
    "",
    "- [x] `p-1` Parse the input [P1]",
    "  - It parses.",
    "- [ ] `p-2` Check the input [P1]",
    "  - It checks.",
    "- [ ] `p-3` Print the input [P1]",
    "  - It prints.",
    "",
  ].join("\n"),
};

// A fake GitHub for acme/app: one claim branch and one spec issue. Any
// request that is not a GET is a write.
function fakeGitHub(t) {
  const writes = [],
    reads = [],
    server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://x"),
        send = (status, body) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(body));
        };
      if (req.method !== "GET") {
        writes.push(`${req.method} ${url.pathname}`);
        return send(403, { message: "No writes in this test." });
      }
      reads.push(url.pathname);
      const page = Number(url.searchParams.get("page") || 1);
      if (url.pathname === "/repos/acme/app/git/matching-refs/heads/avoozl/")
        return send(
          200,
          page > 1
            ? []
            : [
                {
                  ref: "refs/heads/avoozl/parser/p-3",
                  object: { sha: "c".repeat(40) },
                },
              ],
        );
      if (url.pathname === "/repos/acme/app/issues")
        return send(
          200,
          page > 1
            ? []
            : [
                {
                  number: 7,
                  id: 70,
                  node_id: "I_7",
                  title: "parser",
                  state: "open",
                  html_url: "https://github.com/acme/app/issues/7",
                  author_association: "OWNER",
                  body: "Spec issue.\n\n<!-- avoozl-spec:parser -->",
                  assignees: [],
                },
              ],
        );
      send(404, { message: "Not Found" });
    });
  t.after(() => server.close());
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        writes,
        reads,
      }),
    ),
  );
}

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("repository configure then rebuild finds the specs, ticks, claims and spec issues, with no GitHub write", async (t) => {
  const github = await fakeGitHub(t),
    machine = temporaryDirectory("avoozl-setup-machine-"),
    env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|GH|GITHUB)_/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: path.join(machine, "home"),
    XDG_CONFIG_HOME: path.join(machine, "config"),
    XDG_STATE_HOME: path.join(machine, "state"),
    AVOOZL_GITHUB_TOKEN: "fake-token",
    GITHUB_API_URL: github.url,
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  // The checkout: an approved spec with one tick, on GitHub as acme/app.
  const checkout = specCheckout("avoozl-setup-app-");
  for (const [file, text] of Object.entries(SPEC)) {
    const at = path.join(checkout.root, ".kiro", "specs", "parser", file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, text);
  }
  fs.writeFileSync(
    path.join(checkout.root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "single-repo",
        repositories: {
          "acme/app": {
            baseBranch: "main",
            allowedActors: [OWNER],
            approvalTrust: "branch-protection",
          },
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(checkout.root, ".gitignore"),
    "*.sqlite*\n.avoozl/\n",
  );
  checkout.run(["add", "-A"]);
  checkout.run(["commit", "-q", "-m", "Approve spec parser"]);
  checkout.run(["remote", "add", "origin", "https://github.com/acme/app.git"]);
  const workspace = ["--workspace", checkout.root];
  let out = await run(["init", checkout.root], env);
  assert.equal(out.status, 0, out.stderr);
  out = await run(
    ["repository", "configure", "app", "--root", checkout.root, ...workspace],
    env,
  );
  assert.equal(out.status, 0, out.stderr);
  out = await run(["rebuild", ...workspace], env);
  assert.equal(out.status, 0, out.stderr);
  const rebuilt = JSON.parse(out.stdout);
  assert.deepEqual(rebuilt.approved, ["parser"]);
  assert.deepEqual(rebuilt.done, ["p-1"]);
  assert.deepEqual(rebuilt.claims, ["p-3"]);
  assert.deepEqual(
    rebuilt.specIssues.map(({ id, number }) => [id, number]),
    [["parser", 7]],
  );
  out = await run(["next", ...workspace], env);
  assert.equal(out.status, 0, out.stderr);
  const next = JSON.parse(out.stdout);
  assert.deepEqual(
    next.ready.map((item) => item.id),
    ["p-2"],
  );
  assert.deepEqual(
    next.running.map((item) => [item.id, item.branch]),
    [["p-3", "avoozl/parser/p-3"]],
  );
  assert.deepEqual(
    next.done.map((item) => item.id),
    ["p-1"],
  );
  assert.deepEqual(github.writes, [], "no GitHub write");
});
