// Home's first load must not wait on the network: every read Home sends
// through the app backend answers while GitHub and Kiro Crew never answer,
// and (off Windows) while `git` and `gh` take seconds to start. The backend
// answers from its last read and refreshes after replying.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { startAppBackend } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// Every read Home's page sends on first load: the shell, the nav, and each
// Home card (DashboardView, ReleaseQueue, TrackerGates, IntegrationBranches,
// ReviewDrafts, the driver cell, setup cards).
const HOME = [
  ["instance.view", {}],
  ["conflicts.view", {}],
  ["untriaged.view", {}],
  ["graph.view", {}],
  ["delivery.view", {}],
  ["plan.list", { limit: 100 }],
  ["radar.crews", {}],
  ["flow.view", { window: "10" }],
  ["github.settings.get", {}],
  ["repositories.list", {}],
  ["gate.list", {}],
  ["radar.releasequeue", {}],
  ["integration.view", {}],
  ["landing.view", {}],
  ["review.drafts", {}],
];
const REPO = "mtdowling/avoozl-home-test";
// Each reply's limit. A slow `git` or `gh` takes 2 s to start below.
const LIMIT_MS = 1500;

function sign(body) {
  const claim = {
      issuedAt: Math.floor(Date.now() / 1000),
      kind: "owner-session",
      ownerId: "owner",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signature = createHmac("sha256", "secret")
    .update(
      [
        "kirocrew-proxy-principal-v1",
        String(claim.issuedAt),
        "POST",
        "/api/command",
        createHash("sha256").update(body).digest("hex"),
        encoded,
      ].join("\n"),
    )
    .digest("hex");
  return `${encoded}.${signature}`;
}

test("no Home read waits on GitHub, Kiro Crew or git", async (t) => {
  const root = temporaryDirectory();
  initializeWorkspace(root);
  const file = path.join(root, ".avoozl.json"),
    saved = JSON.parse(fs.readFileSync(file, "utf8"));
  saved.github = {
    mode: "single-repo",
    repositories: {
      [REPO]: {
        baseBranch: "main",
        coder: "issue-radar",
        minimumPermission: "write",
        managedLabels: { managed: "avoozl:managed", ready: "ready" },
        crewLabels: { needsHuman: "plan me" },
        acceptedLabel: "accepted",
        rules: [],
      },
    },
  };
  fs.writeFileSync(file, JSON.stringify(saved));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "config"),
  };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  const config = workspaceConfig({ workspace: root, env });
  // The page names its workspace, so each request resolves the catalog's
  // root (app-backend.mjs workspaceFor).
  const hostConfig = path.join(root, "config", "avoozl", "config.json");
  fs.mkdirSync(path.dirname(hostConfig), { recursive: true });
  fs.writeFileSync(
    hostConfig,
    JSON.stringify({
      version: 1,
      host: "127.0.0.1",
      port: 9428,
      maxConcurrentRuns: 1,
      defaultWorkspace: "w",
      workspaces: {
        w: {
          root,
          name: "W",
          enabled: true,
          maxConcurrentRuns: 1,
          repositories: {},
        },
      },
    }),
  );
  // A repository, so the reads have GitHub to call.
  const seed = new Store(config.dbPath);
  const [owner, repo] = REPO.split("/");
  seed.put("github_repositories", { id: REPO, owner, repo, projectId: "code" });
  seed.close();

  // GitHub never answers; the test's own loopback calls go through.
  const real = globalThis.fetch;
  let github = 0;
  globalThis.fetch = (url, init) => {
    if (/^http:\/\/127\.0\.0\.1:/.test(String(url))) return real(url, init);
    github += 1;
    return new Promise(() => {});
  };
  // Kiro Crew never answers either.
  let crew = 0;
  const never = () => {
    crew += 1;
    return new Promise(() => {});
  };
  // `git` and `gh` take 2 s to start: a request that runs one is late.
  const saved_ = {
    PATH: process.env.PATH,
    token: process.env.AVOOZL_GITHUB_TOKEN,
  };
  process.env.AVOOZL_GITHUB_TOKEN = "test-token";
  if (process.platform !== "win32") {
    const bin = temporaryDirectory();
    for (const name of ["git", "gh"]) {
      fs.writeFileSync(path.join(bin, name), "#!/bin/sh\nsleep 2\n");
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  }
  const server = startAppBackend({
    config,
    secret: "secret",
    notifier: null,
    slotReader: null,
    rowReader: null,
    usageReader: null,
    modelSwitcher: null,
    modelReader: null,
    crewReader: never,
    sessionStopper: null,
    registryOptions: {
      configPath: hostConfig,
      catalogPath: path.join(root, "state", "catalog.sqlite"),
    },
  });
  t.after(() => {
    server.close();
    globalThis.fetch = real;
    process.env.PATH = saved_.PATH;
    if (saved_.token === undefined) delete process.env.AVOOZL_GITHUB_TOKEN;
    else process.env.AVOOZL_GITHUB_TOKEN = saved_.token;
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const post = async (operation, input) => {
    const body = JSON.stringify({ operation, input, workspaceId: "w" });
    const start = performance.now();
    const reply = await real(
      `http://127.0.0.1:${server.address().port}/api/command`,
      {
        method: "POST",
        headers: { "X-KiroCrew-Principal": sign(body) },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    return {
      operation,
      status: reply.status,
      ms: performance.now() - start,
      result: (await reply.json()).result,
    };
  };
  // Twice: the first load, and a reload while the refreshes still hang.
  for (const round of ["first load", "reload"]) {
    const replies = await Promise.all(
      HOME.map(([operation, input]) => post(operation, input)),
    );
    for (const reply of replies) {
      assert.equal(reply.status, 200, `${round}: ${reply.operation}`);
      assert.ok(
        reply.ms < LIMIT_MS,
        `${round}: ${reply.operation} took ${Math.round(reply.ms)} ms`,
      );
    }
    const crews = replies.find((r) => r.operation === "radar.crews").result;
    assert.equal(
      crews.refreshing,
      true,
      `${round}: radar.crews says it reads again`,
    );
  }
  // The refreshes did go out, after the replies: the test reached the network.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(github > 0, "a GitHub read was started");
  assert.ok(crew > 0, "a Kiro Crew read was started");
});
