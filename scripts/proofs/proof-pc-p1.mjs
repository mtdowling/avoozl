#!/usr/bin/env node
// Proof pc-p1 (plugin-credentials PC1 to PC13): per-job tokens from a
// credentials plugin, a high-risk Allow and Cancel, a changed plugin (the
// refusal), a clash and its pick, and env, against a fake GitHub this script
// starts on 127.0.0.1. It mints installation-style tokens at
// POST /app/installations/1/access_tokens, enforces each token's
// permissions on every REST call and git push, and serves two repositories'
// bare remotes over smart HTTP (git http-backend).
//
//   PLAYWRIGHT_CORE=DIR node scripts/proofs/proof-pc-p1.mjs --root DIR
//
// The page clicks (Approve, Use this one, Remove) are made by Playwright in
// a throwaway `avoozl serve` page; screenshots go to DIR/shots. Landing
// setup is `avoozl setup`: `--yes` is the Allow, a run without it the
// Cancel. PLAYWRIGHT_CORE is a playwright-core package directory with a
// browser installed (no package of this repository depends on it).
//
// Everything lives under --root: the Avoozl config and state homes, the
// plugin, the remotes, the checkouts and the logs. Nothing else is read or
// written; no real GitHub, gh login, Kiro Crew or Avoozl home is used.
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const { values } = parseArgs({ options: { root: { type: "string" } } });
if (!values.root) throw Error("Usage: proof-pc-p1.mjs --root DIR");
if (!process.env.PLAYWRIGHT_CORE)
  throw Error("Set PLAYWRIGHT_CORE to a playwright-core directory.");
const ROOT = path.resolve(values.root);
fs.mkdirSync(ROOT, { recursive: true });
if (fs.readdirSync(ROOT).length) throw Error(`${ROOT} must be empty.`);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const run = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// ---- The fake GitHub ------------------------------------------------------

const { serveGit } = await import(path.join(REPO, "src/app/test/git-http.mjs"));
const { restNeeds, missingFrom } = await import(
  path.join(REPO, "src/app/github/github-jobs.mjs")
);
const tokens = new Map(), // token -> {id, repositories, permissions, purpose}
  log = [],
  writes = [],
  project = path.join(ROOT, "remotes");
let minted = 0;
const GH_TOKEN = "gh-token-octo",
  ENV_TOKEN = "env-token-all";
const allowedFor = (token, repository) => {
  if (token === ENV_TOKEN) return { permissions: "all" };
  if (token === GH_TOKEN)
    return repository?.startsWith("octo/") ? { permissions: "all" } : null;
  const t = tokens.get(token);
  if (!t) return null;
  const [owner, name] = (repository || "").split("/");
  if (repository && (owner !== "acme" || !t.repositories.includes(name)))
    return null;
  return t;
};
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (url.pathname === "/app/installations/1/access_tokens") {
    const asked = JSON.parse(body || "{}"),
      token = `ghs_fake${String(++minted).padStart(4, "0")}${"x".repeat(32)}`;
    tokens.set(token, {
      id: minted,
      repositories: asked.repositories || [],
      permissions: asked.permissions || {},
      purpose: asked.purpose,
    });
    log.push({ kind: "mint", id: minted, ...asked });
    return json(res, 201, {
      token,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      permissions: asked.permissions,
    });
  }
  if (url.pathname.startsWith("/api/")) {
    const pathname = url.pathname.slice(4),
      token = (req.headers.authorization || "").replace(/^Bearer /, ""),
      repository = /^\/repos\/([^/]+\/[^/]+)/.exec(pathname)?.[1] ?? null,
      grant = allowedFor(token, repository);
    const entry = {
      kind: "api",
      method: req.method,
      path: pathname,
      repository,
      token:
        tokens.get(token)?.id ??
        (token === GH_TOKEN ? "gh" : token === ENV_TOKEN ? "env" : "?"),
      purpose: tokens.get(token)?.purpose ?? null,
    };
    log.push(entry);
    if (pathname === "/user") {
      if (token === GH_TOKEN) return json(res, 200, { login: "person-gh" });
      if (token === ENV_TOKEN) return json(res, 200, { login: "person-env" });
      return json(res, 403, {
        message: "Resource not accessible by integration",
      });
    }
    if (!grant) return json(res, 401, { message: "Bad credentials" });
    if (grant.permissions !== "all") {
      const missing = missingFrom(
        grant.permissions,
        restNeeds(req.method, pathname),
      );
      if (missing.length) {
        entry.refused = missing;
        return json(res, 403, {
          message: `Resource not accessible by integration (${missing.join(", ")})`,
        });
      }
    }
    if (req.method !== "GET")
      writes.push({ ...entry, body: body ? JSON.parse(body) : null });
    if (/^\/repos\/[^/]+\/[^/]+$/.test(pathname) && req.method === "GET")
      return json(res, 200, {
        full_name: repository,
        private: true,
        default_branch: "main",
        permissions: { admin: true, push: true, pull: true },
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: true,
      });
    if (/\/issues\/\d+$/.test(pathname))
      return json(res, 200, { number: 1, title: "x", state: "open" });
    if (/\/issues$/.test(pathname) && req.method === "POST")
      return json(res, 201, {
        number: 2,
        html_url: `https://github.example/${repository}/issues/2`,
      });
    if (/\/comments$/.test(pathname)) return json(res, 201, { id: 9 });
    if (/\/rulesets$/.test(pathname))
      return json(
        res,
        req.method === "GET" ? 200 : 201,
        req.method === "GET" ? [] : { id: 1 },
      );
    if (/\/actions\/variables$/.test(pathname))
      return json(
        res,
        req.method === "GET" ? 200 : 201,
        req.method === "GET" ? { variables: [] } : {},
      );
    if (req.method === "PATCH") return json(res, 200, {});
    return json(res, 404, { message: "Not Found" });
  }
  // Smart HTTP git, Basic auth: x-access-token and the token. Git asks once
  // without, gets the 401 challenge, then asks its helper (logged as none).
  const [user, token] = Buffer.from(
      (req.headers.authorization || "").replace(/^Basic /, ""),
      "base64",
    )
      .toString()
      .split(":"),
    repository = url.pathname
      .split("/")
      .slice(1, 3)
      .join("/")
      .replace(/\.git$/, ""),
    pushing =
      url.searchParams.get("service") === "git-receive-pack" ||
      url.pathname.endsWith("git-receive-pack"),
    grant = user === "x-access-token" ? allowedFor(token, repository) : null,
    needs = pushing ? { contents: "write" } : { contents: "read" },
    entry = {
      kind: "git",
      path: url.pathname,
      repository,
      push: pushing,
      token:
        tokens.get(token)?.id ??
        (token === GH_TOKEN
          ? "gh"
          : token === ENV_TOKEN
            ? "env"
            : token
              ? "?"
              : "none"),
      purpose: tokens.get(token)?.purpose ?? null,
    };
  log.push(entry);
  if (
    !grant ||
    (grant.permissions !== "all" &&
      missingFrom(grant.permissions, needs).length)
  ) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="fake"' });
    return res.end();
  }
  serveGit(req, res, project, body ? Buffer.from(body, "latin1") : undefined);
});
// Pushes carry binary pack data: read the body as latin1 so it survives.
server.on("request", (req) => req.setEncoding("latin1"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port,
  BASE = `http://127.0.0.1:${PORT}`,
  HOST = `127.0.0.1:${PORT}`;

// ---- An isolated machine --------------------------------------------------

const bin = path.join(ROOT, "bin"),
  ghLog = path.join(ROOT, "gh.log");
fs.mkdirSync(bin);
fs.writeFileSync(
  path.join(bin, "gh"),
  `#!/bin/sh\necho "$@" >> "${ghLog}"\necho ${GH_TOKEN}\n`,
  { mode: 0o755 },
);
Object.assign(process.env, {
  PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  AVOOZL_GIT_URL: BASE,
  GITHUB_API_URL: `${BASE}/api`,
  XDG_CONFIG_HOME: path.join(ROOT, "config"),
  XDG_STATE_HOME: path.join(ROOT, "state"),
  KIROCREW_HOME: path.join(ROOT, "crew"),
});
for (const name of [
  "AVOOZL_GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "KIROCREW_SPAWNED",
  "KIRO_SESSION_ID",
  "AVOOZL_CHILD",
])
  delete process.env[name];

const {
  machineCredentials,
  credentialsNeedsYou,
  recordCredentialEvents,
  pickCredentials,
} = await import(path.join(REPO, "src/app/github/github-credentials.mjs"));
const { GitHubClient } = await import(
  path.join(REPO, "src/app/github/github.mjs")
);
const { withJob, processGrants, confirmStep } = await import(
  path.join(REPO, "src/app/github/github-jobs.mjs")
);
const { remoteGit } = await import(path.join(REPO, "src/app/git/git.mjs"));
const { sandboxEnv } = await import(
  path.join(REPO, "src/app/executors/sandbox.mjs")
);
const { previewLanding, applyLanding } = await import(
  path.join(REPO, "src/app/github/setup-landing.mjs")
);
const plugins = await import(path.join(REPO, "src/app/plugins/plugins.mjs"));
const { Store } = await import(path.join(REPO, "src/app/store/store.mjs"));
const { snapshot } = await import(path.join(REPO, "src/app/test/fixtures.mjs"));

const settingsFile = plugins.pluginSettingsPath(),
  workspaceRoot = path.join(ROOT, "workspace"),
  fixture = path.join(REPO, "src/app/test/fixtures/plugins/fake-credentials");
// Asynchronous: the fake GitHub lives in this process and must keep answering.
const avoozl = (...args) => {
  const pending = promisify(execFile)(
    process.execPath,
    [path.join(REPO, "cli.mjs"), ...args],
    { encoding: "utf8", env: process.env, timeout: 120_000 },
  );
  pending.child.stdin.end();
  return pending.then((done) => done.stdout);
};
// A real, empty workspace the throwaway app serves.
await avoozl("init", workspaceRoot);
await avoozl("workspace", "add", "proof", "--root", workspaceRoot);
await avoozl("workspace", "set-default", "proof");
const pluginDir = (id) => {
  const dir = path.join(ROOT, "plugins", id);
  fs.cpSync(fixture, dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "avoozl-plugin.json"),
    JSON.stringify({
      id,
      version: "1.0.0",
      contract: 1,
      provides: ["credentials"],
      credentials: { entry: "token.mjs", hosts: [HOST], owners: ["acme"] },
    }),
  );
  return dir;
};
const entry = (id) => ({
  id,
  path: pluginDir(id),
  contract: 1,
  config: {
    mintUrl: `${BASE}/app/installations/1/access_tokens`,
    login: "acme-bot[bot]",
    person: "acme-dev",
  },
});
// Declared on this machine, not yet approved: the page's Approve is step 0.
plugins.writePluginSettings(settingsFile, { plugins: [entry("acme-github")] });
// A copy under another id in the workspace's .avoozl.json.
fs.cpSync(
  path.join(ROOT, "plugins", "acme-github"),
  path.join(workspaceRoot, "acme-copy"),
  { recursive: true },
);
fs.writeFileSync(
  path.join(workspaceRoot, "acme-copy", "avoozl-plugin.json"),
  JSON.stringify({
    ...JSON.parse(
      fs.readFileSync(
        path.join(workspaceRoot, "acme-copy", "avoozl-plugin.json"),
      ),
    ),
    id: "acme-copy",
  }),
);
const workspaceFile = path.join(workspaceRoot, ".avoozl.json"),
  readWorkspaceFile = () => JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
fs.writeFileSync(
  workspaceFile,
  JSON.stringify({
    ...readWorkspaceFile(),
    plugins: [{ id: "acme-copy", path: "acme-copy", contract: 1 }],
  }),
);
const options = { workspaceRoot, settingsFile };

const store = new Store(path.join(ROOT, "workspace.sqlite"));
store.initialize({ ...snapshot(), tasks: [], edges: [] });
const client = () => {
  const credentials = machineCredentials({ settingsFile });
  recordCredentialEvents(store, credentials);
  return new GitHubClient({ credentials }).bind(store);
};
const ghRuns = () =>
  fs.existsSync(ghLog)
    ? fs.readFileSync(ghLog, "utf8").trim().split("\n").filter(Boolean)
    : [];

// Two bare remotes and a checkout of each, each with one first commit.
for (const repo of ["acme/api", "octo/tools"]) {
  const dir = path.join(project, `${repo}.git`);
  fs.mkdirSync(dir, { recursive: true });
  run(dir, "init", "-q", "--bare", "-b", "main");
  run(dir, "config", "http.receivepack", "true");
}
const commit = (dir, file, text) => {
  fs.writeFileSync(path.join(dir, file), text);
  run(dir, "add", file);
  run(dir, "commit", "-qm", `Add ${file}`);
};
const checkout = (repo, origin) => {
  const dir = path.join(ROOT, "checkouts", repo);
  fs.mkdirSync(dir, { recursive: true });
  run(dir, "init", "-q", "-b", "main");
  run(dir, "config", "user.name", "Proof Person");
  run(dir, "config", "user.email", "person@example.com");
  commit(dir, "README.md", `${repo}\n`);
  run(
    dir,
    "push",
    "-q",
    path.join(project, `${repo}.git`),
    "HEAD:refs/heads/main",
  );
  run(dir, "remote", "add", "origin", origin);
  return dir;
};
const api = checkout("acme/api", `git@127.0.0.1:acme/api.git`),
  tools = checkout("octo/tools", `${BASE}/octo/tools.git`),
  hookEnv = path.join(ROOT, "pre-push-env.txt");
fs.writeFileSync(
  path.join(api, ".git", "hooks", "pre-push"),
  `#!/bin/sh\nenv > "${hookEnv}"\ncat > /dev/null\n`,
  { mode: 0o755 },
);
await avoozl(
  "repository",
  "configure",
  "api",
  "--root",
  api,
  "--workspace",
  workspaceRoot,
);
await avoozl(
  "repository",
  "configure",
  "tools",
  "--root",
  tools,
  "--workspace",
  workspaceRoot,
);

// ---- The throwaway app and its browser --------------------------------------

const { chromium } = await import(
  path.join(process.env.PLAYWRIGHT_CORE, "index.mjs")
);
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let serve = null;
const startServe = async () => {
  serve = spawn(process.execPath, [path.join(REPO, "cli.mjs"), "serve"], {
    env: process.env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const link = await new Promise((resolve, reject) => {
    serve.once("exit", () => reject(Error("avoozl serve exited")));
    serve.stdout.on("data", (chunk) => {
      const found = /http:\/\/\S+\/login\?token=\S+/.exec(String(chunk));
      if (found) resolve(found[0]);
    });
  });
  await page.goto(link);
  await page.waitForSelector("[data-nav-head]");
};
const stopServe = () => {
  serve?.kill();
  serve = null;
};
// Settings > <tab>, by the left navigation.
const settings = async (tab) => {
  const head = page.locator("[data-nav-head]", { hasText: "Settings" });
  if ((await head.getAttribute("data-open")) === null) await head.click();
  await page.locator("[data-nav-item]", { hasText: tab }).first().click();
  await page.waitForTimeout(800);
};
const text = () => page.locator("main").innerText();
// A screenshot under --root (never in git), for the receipt's look check.
const shot = (name) =>
  page.screenshot({
    path: path.join(ROOT, "shots", `${name}.png`),
    fullPage: true,
  });
// Settings > GitHub's GitHub calls tab, where the sign-in lines are.
const callsTab = async () => {
  await page.getByRole("tab", { name: "GitHub calls" }).click();
  await page.waitForTimeout(800);
};
const press = async (name) => {
  await page.getByRole("button", { name }).first().click();
  await page.waitForTimeout(800);
};

// ---- (0) approve the plugin in Settings > Plugins ---------------------------

{
  await startServe();
  await settings("Plugins");
  const waiting = /Needs approval/.test(await text());
  await press(/Approve version 1\.0\.0/);
  await shot("0-approved");
  check(
    "0 Settings > Plugins offers Approve for acme-github, and Approved follows",
    waiting && /acme-github\s+Approved/.test(await text()),
  );
  check(
    "0 the approval is on this machine",
    plugins.inspectPlugins(options).find((p) => p.id === "acme-github")
      ?.state === "approved",
  );
}
// Both repositories on GitHub, landing `direct`, with landing setup's checks.
await avoozl(
  "github",
  "configure",
  "acme/api",
  "--repo",
  "api",
  "--workspace",
  workspaceRoot,
);
await avoozl(
  "github",
  "configure",
  "octo/tools",
  "--repo",
  "tools",
  "--workspace",
  workspaceRoot,
);
fs.writeFileSync(
  workspaceFile,
  JSON.stringify({
    ...readWorkspaceFile(),
    github: {
      mode: "single-repo",
      repositories: {
        "acme/api": {
          baseBranch: "main",
          requiredChecks: ["Linux", "macOS", "Windows"],
          landing: { mode: "direct" },
        },
        "octo/tools": { baseBranch: "main", landing: { mode: "direct" } },
      },
    },
  }),
);

// ---- (1) per-job tokens, the helper push, gh for octo ----------------------

{
  const inspected = plugins.inspectPlugins(options),
    copy = inspected.find((p) => p.id === "acme-copy");
  check(
    "1 the .avoozl.json copy is invalid naming .avoozl.json plugins.0",
    copy?.state === "invalid" &&
      /^\.avoozl\.json plugins\.0:/.test(copy.reason),
    copy?.reason,
  );
  const github = client();
  await withJob("check-in", () => github.issue("acme/api", 1));
  await withJob("spec-issues", () =>
    github.createIssue("acme/api", { title: "Spec: pc", body: "x" }),
  );
  commit(api, "task-1.txt", "one\n");
  commit(api, "task-2.txt", "two\n");
  await withJob("land", () =>
    remoteGit(api, ["push", "-q", "origin", "HEAD:refs/heads/main"], {
      job: "land",
    }),
  );
  await withJob("check-in", () => github.issue("octo/tools", 1));
  commit(tools, "task-3.txt", "three\n");
  await remoteGit(tools, ["push", "-q", "origin", "HEAD:refs/heads/main"], {
    job: "land",
  });
  const mints = log.filter((e) => e.kind === "mint"),
    byPurpose = Object.fromEntries(
      mints.map((m) => [m.purpose, m.permissions]),
    );
  check(
    "1 separate token requests for check-in, spec-issues and land with D6's permission sets",
    byPurpose["check-in"]?.issues === "read" &&
      byPurpose["spec-issues"]?.issues === "write" &&
      byPurpose.land?.contents === "write",
    JSON.stringify(byPurpose),
  );
  check(
    "1 each plugin token was used only on acme/api",
    log
      .filter((e) => typeof e.token === "number" && e.repository)
      .every((e) => e.repository === "acme/api"),
  );
  const pushes = log.filter(
    (e) =>
      e.kind === "git" &&
      e.repository === "acme/api" &&
      e.push &&
      typeof e.token === "number",
  );
  check(
    "1 the acme/api landing push authenticated through the helper over the rewritten https URL",
    pushes.length > 0 && pushes.every((e) => e.purpose === "land"),
    `${pushes.length} push requests`,
  );
  const octo = log.filter(
    (e) => e.repository === "octo/tools" && !["?", "none"].includes(e.token),
  );
  check(
    "1 octo/tools read and landed with gh's token",
    octo.length > 0 && octo.every((e) => e.token === "gh"),
  );
  check(
    "1 the fake gh ran only for octo/tools",
    ghRuns().length > 0 &&
      ghRuns().every((line) => line.includes(HOST)) &&
      !log.some((e) => e.repository?.startsWith("acme/") && e.token === "gh"),
    ghRuns().join("; "),
  );
  const authors = ["acme/api", "octo/tools"].flatMap((repo) =>
    run(
      path.join(project, `${repo}.git`),
      "log",
      "--format=%an <%ae> | %cn <%ce>",
      "main",
    ).split("\n"),
  );
  check(
    "1 every commit on both remotes has the person's git author and committer",
    authors.every(
      (line) =>
        line ===
        "Proof Person <person@example.com> | Proof Person <person@example.com>",
    ),
    `${authors.length} commits`,
  );
  const allTokens = [...tokens.keys(), GH_TOKEN];
  const hook = fs.existsSync(hookEnv) ? fs.readFileSync(hookEnv, "utf8") : "";
  const worker = JSON.stringify(sandboxEnv(process.env));
  check(
    "1 the pre-push hook's environment and a worker environment hold no token",
    hook && !allTokens.some((t) => hook.includes(t) || worker.includes(t)),
  );
  const lines = github.credentials
    .signIns()
    .map((l) => l.provider + ":" + JSON.stringify(l.owners) + ":" + l.login);
  check(
    "1 Settings data: acme through acme-github as acme-bot[bot], everything else with gh",
    lines.some((l) => l.startsWith('acme-github:["acme"]:acme-bot[bot]')) &&
      lines.some((l) => l.startsWith('gh:"other"')),
    lines.join(" | "),
  );
}

// ---- Settings > GitHub after (1) --------------------------------------------

{
  // The page's own process signs in: a read of acme/api's settings there
  // mints its own check-in token, so the line carries the login and life.
  const reply = await page.evaluate(async () => {
    const r = await fetch("/apps/avoozl/api/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "github.repository.inspect",
        input: { repository: "acme/api", baseBranch: "main" },
        workspaceId: "proof",
      }),
    });
    return r.status;
  });
  await settings("Plugins");
  await settings("GitHub");
  await callsTab();
  await shot("1-sign-in-lines");
  const shown = await text();
  check(
    "1 Settings > GitHub: acme through acme-github as acme-bot[bot] with a remaining life, everything else with gh",
    reply === 200 &&
      shown.includes(
        `${HOST} · acme: signed in through acme-github as acme-bot[bot] (per-job permissions) · token good for`,
      ) &&
      shown.includes(`${HOST} · everything else: signed in with gh`),
    shown
      .split("\n")
      .filter((l) => l.includes("signed in"))
      .join(" | "),
  );
}

// ---- (2) landing setup: Allow (--yes), then Cancel (no --yes) ---------------
// The current design has no landing setup page: `avoozl setup` shows each
// high-risk step with its permissions, `--yes` is the person's Allow, and a
// run without it writes nothing.

{
  const setupArgs = [
      "setup",
      "acme/api",
      "--repo",
      "api",
      "--landing",
      "pr",
      "--methods",
      "squash",
      "--workspace",
      workspaceRoot,
    ],
    before = writes.length;
  const allowed = await promisify(execFile)(
    process.execPath,
    [path.join(REPO, "cli.mjs"), ...setupArgs, "--yes"],
    { encoding: "utf8", env: process.env, timeout: 120_000 },
  );
  const confirm = allowed.stderr,
    applied = JSON.parse(allowed.stdout);
  check(
    "2 the confirm names acme/api, the action and administration: write",
    /on acme\/api\n\s+landing-setup asks GitHub for [^\n]*administration: write/.test(
      confirm,
    ),
    confirm.split("\n").slice(0, 3).join(" / "),
  );
  const rulesets = writes
    .slice(before)
    .filter((w) => /\/rulesets$/.test(w.path) && w.method === "POST");
  check(
    "2 Allow writes the ruleset",
    rulesets.length === 1 && applied.written?.includes("ruleset"),
    JSON.stringify(applied.written),
  );
  const again = writes.length,
    cancelled = JSON.parse(
      await avoozl(
        ...setupArgs.slice(0, 4),
        "--landing",
        "pr",
        "--workspace",
        workspaceRoot,
      ),
    );
  check(
    "2 Cancel writes nothing and setup shows the step not applied",
    writes.length === again &&
      cancelled.applied === false &&
      cancelled.github.some((s) => s.id === "ruleset" && s.status === "change"),
    cancelled.github.map((s) => `${s.id}: ${s.status}`).join(", "),
  );
}

// ---- (3) the plugin changes ------------------------------------------------

{
  fs.appendFileSync(
    path.join(ROOT, "plugins", "acme-github", "token.mjs"),
    "\n// edited after approval\n",
  );
  const github = client(),
    runsBefore = ghRuns().length;
  const error = await withJob("check-in", () =>
    github.issue("acme/api", 1),
  ).catch((e) => e);
  check(
    "3 every call for acme refuses with approve acme-github again",
    /approve (acme-github )?(it )?again/i.test(error?.message || ""),
    error?.message,
  );
  check("3 the fake gh did not run for acme", ghRuns().length === runsBefore);
  await withJob("check-in", () => github.issue("octo/tools", 1));
  check(
    "3 octo/tools still reads with gh",
    log.at(-1)?.repository === "octo/tools" && log.at(-1)?.token === "gh",
  );
  await settings("GitHub");
  await settings("Plugins");
  await shot("3-changed");
  check(
    "3 Settings > Plugins shows acme-github changed",
    /acme-github\s+Changed: approve again/.test(await text()),
  );
}

// ---- (4) a clash and its pick ----------------------------------------------

{
  await press(/Approve version 1\.0\.0/);
  const settingsNow = plugins.readPluginSettings(settingsFile);
  settingsNow.plugins.push(entry("acme-github-two"));
  plugins.writePluginSettings(settingsFile, settingsNow);
  await settings("GitHub");
  await settings("Plugins");
  await press(/Approve version 1\.0\.0/);
  check(
    "4 both copies approved in Settings > Plugins",
    ["acme-github", "acme-github-two"].every(
      (id) =>
        plugins.inspectPlugins(options).find((p) => p.id === id)?.state ===
        "approved",
    ),
  );
  const github = client(),
    calls = log.length;
  const error = await withJob("check-in", () =>
    github.issue("acme/api", 1),
  ).catch((e) => e);
  const rows = credentialsNeedsYou(store).filter((r) =>
    r.actions?.some((a) => a.label === "Use this one"),
  );
  await settings("GitHub");
  await settings("Plugins");
  const pick = page
    .locator("[data-signin-clash]")
    .getByRole("button", { name: /^Use this one: / });
  await shot("4-clash");
  check(
    "4 the clash item appears with Use this one",
    rows.length === 1 &&
      rows[0].actions.length === 2 &&
      (await pick.count()) === 2,
    error?.message,
  );
  check(
    "4 no GitHub call is made until the pick",
    log.slice(calls).every((e) => e.kind !== "api"),
  );
  // The pick for acme-github, by its own button in the clash box.
  await page
    .locator("[data-signin-clash]")
    .getByRole("button", { name: "Use this one: acme-github", exact: true })
    .click();
  await page.waitForTimeout(800);
  const picked =
    plugins.readPluginSettings(settingsFile).credentialsPick?.[HOST];
  const after = await page.locator("[data-signin-clash]").innerText();
  await withJob("check-in", () => client().issue("acme/api", 1));
  check(
    "4 the pick is acme-github, the page says so, and work resumes after it",
    picked === "acme-github" &&
      after.includes("Signing in through acme-github.") &&
      log
        .slice(calls)
        .some((e) => e.kind === "api" && e.repository === "acme/api"),
    `picked ${picked}`,
  );
}

// ---- (5) env ---------------------------------------------------------------

{
  // Remove both in Settings > Plugins: Remove, then the confirm's Remove plugin.
  for (const id of ["acme-github-two", "acme-github"]) {
    await settings("GitHub");
    await settings("Plugins");
    await page
      .locator(`[data-form-section="${id}"]`)
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await press("Remove plugin");
  }
  check(
    "5 both plugins removed in Settings > Plugins",
    !plugins
      .inspectPlugins(options)
      .some((p) => p.id === "acme-github" || p.id === "acme-github-two"),
    plugins
      .inspectPlugins(options)
      .map((p) => p.id)
      .join(", "),
  );
  process.env.AVOOZL_GITHUB_TOKEN = ENV_TOKEN;
  stopServe();
  await startServe();
  const github = client();
  await withJob("check-in", () => github.issue("acme/api", 1));
  commit(api, "task-4.txt", "four\n");
  const at = log.length;
  await remoteGit(api, ["push", "-q", "origin", "HEAD:refs/heads/main"], {
    job: "land",
  });
  const line = github.credentials.signIns()[0];
  await settings("GitHub");
  await callsTab();
  await shot("5-env");
  const shown = await text();
  check(
    "5 Settings shows signed in with env and full access",
    line?.provider === "env" &&
      line.granted === "all" &&
      line.owners === "all" &&
      shown.includes(`${HOST} · every owner: signed in with env (full access)`),
    shown
      .split("\n")
      .filter((l) => l.includes("signed in"))
      .join(" | "),
  );
  check(
    "5 the tick reads and lands with that token",
    log
      .slice(at)
      .filter((e) => e.kind === "git" && e.token !== "none")
      .every((e) => e.token === "env") &&
      log.some((e) => e.kind === "api" && e.token === "env") &&
      run(
        path.join(project, "acme/api.git"),
        "log",
        "-1",
        "--format=%s",
        "main",
      ) === "Add task-4.txt",
  );
}

await browser.close();
stopServe();

server.close();
store.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(
  path.join(ROOT, "results.json"),
  JSON.stringify({ results, log }, null, 2),
);
console.log(
  `\n${results.length - failed.length} of ${results.length} checks passed.`,
);
process.exit(failed.length ? 1 : 0);
