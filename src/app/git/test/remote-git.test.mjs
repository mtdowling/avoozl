// plugin-credentials pc-3.1: Avoozl's own network git signs in through
// `avoozl credential`, the same provider and job table as the API. A fake
// smart-HTTP remote on 127.0.0.1 checks Basic auth and runs git http-backend.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import {
  checkEnvironment,
  remoteGit,
  withoutPushCredentials,
} from "../git.mjs";
import { sandboxEnv } from "../../executors/sandbox.mjs";
import { credentialAnswer } from "../../github/credential-helper.mjs";
import { machineAvoozlPaths } from "../../settings/host-config.mjs";
import {
  approvePlugin,
  inspectPlugins,
  writePluginSettings,
} from "../../plugins/plugins.mjs";
import { pluginFolder } from "../../test/github-credentials.mjs";
import {
  basicToken,
  challenge,
  repositoryOfPath,
  serveGit,
} from "../../test/git-http.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const APP = path.join(import.meta.dirname, "..", "..");
const run = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// Bare repositories under `root/remotes`, served by git http-backend. A
// request's token is recorded by repository path; `accept(token, path)`
// decides 401 or not. GET /api/user names a built-in token's login.
async function smartHttp(root, accept) {
  const project = path.join(root, "remotes"),
    seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/user") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ login: "env-person" }));
    }
    const token = basicToken(req),
      repo = repositoryOfPath(url.pathname);
    if (!token || !accept(token, repo)) return challenge(res);
    seen.push({ repo, token });
    serveGit(req, res, project);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, seen, port: server.address().port, project };
}

function bare(project, repo) {
  const dir = path.join(project, `${repo}.git`);
  fs.mkdirSync(dir, { recursive: true });
  run(dir, "init", "-q", "--bare", "-b", "main");
  run(dir, "config", "http.receivepack", "true");
  return dir;
}

async function setup(t) {
  const root = temporaryDirectory("avoozl-remote-git-"),
    fake = await smartHttp(root, (token, repo) =>
      repo.startsWith("acme/")
        ? token.startsWith("fake.")
        : token === "env-token",
    );
  t.after(() => fake.server.close());
  bare(fake.project, "acme/api");
  bare(fake.project, "octo/tools");
  const base = `http://127.0.0.1:${fake.port}`,
    env = {
      AVOOZL_GIT_URL: base,
      GITHUB_API_URL: `${base}/api`,
      AVOOZL_GITHUB_TOKEN: "env-token",
      XDG_CONFIG_HOME: path.join(root, "config-home"),
      LOCALAPPDATA: path.join(root, "config-home"),
      KIROCREW_HOME: path.join(root, "crew"),
      KIROCREW_SPAWNED: "",
      KIRO_SESSION_ID: "",
    },
    saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  // acme-github claims acme on this host, in this machine's plugins.json.
  const settingsFile = path.join(
      machineAvoozlPaths({ env: process.env }).configDirectory,
      "plugins.json",
    ),
    host = `127.0.0.1:${fake.port}`,
    folder = pluginFolder(root, "acme-github", {
      credentials: { entry: "token.mjs", hosts: [host], owners: ["acme"] },
    });
  writePluginSettings(settingsFile, {
    plugins: [{ id: "acme-github", path: folder, contract: 1 }],
  });
  const options = { workspaceRoot: null, settingsFile },
    plugin = inspectPlugins(options)[0];
  approvePlugin(options, {
    id: plugin.id,
    version: plugin.version,
    hash: plugin.hash,
  });
  const work = path.join(root, "work");
  fs.mkdirSync(work);
  run(work, "init", "-q", "-b", "main");
  run(work, "config", "user.email", "person@example.com");
  run(work, "config", "user.name", "Person");
  fs.writeFileSync(path.join(work, "a.txt"), "a\n");
  run(work, "add", ".");
  run(work, "commit", "-qm", "a");
  return { root, fake, base, work };
}

test("push and fetch sign in with the provider's token for that repository; another owner uses the built-in", async (t) => {
  const { fake, base, work } = await setup(t);
  // An SSH origin is rewritten for the command, and its tracking ref moves.
  run(work, "remote", "add", "origin", `git@127.0.0.1:acme/api.git`);
  await remoteGit(work, ["push", "-q", "origin", "HEAD:refs/heads/main"], {
    job: "land",
  });
  await remoteGit(work, ["fetch", "-q", "origin"], { job: "check-in" });
  assert.equal(
    run(work, "rev-parse", "refs/remotes/origin/main"),
    run(work, "rev-parse", "HEAD"),
  );
  await remoteGit(work, [
    "push",
    "-q",
    `${base}/octo/tools.git`,
    "HEAD:refs/heads/main",
  ]);
  const byRepo = Object.groupBy(fake.seen, (s) => s.repo);
  // A commit pushed with a plugin's token keeps the person's git identity.
  assert.equal(
    run(
      path.join(fake.project, "acme/api.git"),
      "log",
      "-1",
      "--format=%an <%ae> | %cn <%ce>",
      "main",
    ),
    "Person <person@example.com> | Person <person@example.com>",
  );
  assert.ok(byRepo["acme/api"].every((s) => s.token.startsWith("fake.")));
  assert.ok(byRepo["octo/tools"].every((s) => s.token === "env-token"));
  // Separate tokens for land and check-in on acme/api.
  assert.ok(
    new Set(byRepo["acme/api"].map((s) => s.token.split(".")[1])).size >= 2,
  );
});

test("a pre-push hook and git's environment never hold the token", async (t) => {
  const { fake, base, work } = await setup(t),
    dump = path.join(work, "..", "hook-env.txt");
  fs.writeFileSync(
    path.join(work, ".git", "hooks", "pre-push"),
    `#!/bin/sh\nenv > "${dump.replaceAll("\\", "/")}"\ncat >/dev/null\n`,
    { mode: 0o755 },
  );
  await remoteGit(work, [
    "push",
    "-q",
    `${base}/acme/api.git`,
    "HEAD:refs/heads/main",
  ]);
  const tokens = fake.seen.map((s) => s.token);
  assert.ok(tokens.length);
  if (fs.existsSync(dump)) {
    const text = fs.readFileSync(dump, "utf8");
    for (const token of tokens) assert.ok(!text.includes(token));
    assert.match(text, /AVOOZL_CREDENTIAL_REPOSITORY=acme\/api/);
  }
});

test("the helper answers only its host, repository and https, never in an agent, and never for a high job", async () => {
  const env = {
      AVOOZL_GIT_URL: "https://github.com",
      AVOOZL_CREDENTIAL_JOB: "land",
      AVOOZL_CREDENTIAL_REPOSITORY: "acme/api",
    },
    credentials = {
      token: async () => ({ token: "t0k" }),
    },
    ask = (request, extra = {}) =>
      credentialAnswer(
        "get",
        {
          protocol: "https",
          host: "github.com",
          path: "acme/api.git",
          ...request,
        },
        { env: { ...env, ...extra }, credentials },
      );
  assert.equal(await ask({}), "username=x-access-token\npassword=t0k\n");
  await assert.rejects(ask({ path: "acme/web.git" }), /acme\/api only/);
  await assert.rejects(ask({ host: "example.com" }), /github\.com only/);
  await assert.rejects(ask({ protocol: "http" }), /https only/);
  await assert.rejects(ask({}, { KIRO_SESSION_ID: "s1" }), /agent session/);
  await assert.rejects(ask({}, { AVOOZL_CHILD: "1" }), /agent session/);
  await assert.rejects(
    ask({}, { AVOOZL_CREDENTIAL_JOB: "landing-setup" }),
    /high risk/,
  );
  for (const action of ["store", "erase"])
    assert.equal(await credentialAnswer(action, {}, { env, credentials }), "");
});

test("workers, checks and agents get no helper and no token", () => {
  const env = {
    PATH: "/bin",
    AVOOZL_CREDENTIAL_JOB: "land",
    AVOOZL_CREDENTIAL_REPOSITORY: "acme/api",
    AVOOZL_GITHUB_TOKEN: "env-token",
  };
  for (const out of [
    sandboxEnv(env),
    checkEnvironment(env, ["AVOOZL_CREDENTIAL_JOB"]),
    withoutPushCredentials(env),
  ]) {
    assert.ok(
      !Object.keys(out).some((k) => k.startsWith("AVOOZL_CREDENTIAL_")),
    );
    assert.ok(!JSON.stringify(out).includes("env-token"));
    assert.ok(!JSON.stringify(out).includes("avoozl credential"));
  }
});

test("no network git call in src/app runs outside remoteGit", () => {
  const files = execFileSync("git", ["ls-files", "src/app"], {
      cwd: path.join(APP, "..", ".."),
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f.endsWith(".mjs") && !f.includes("/test/")),
    // Plugin fetches keep the person's own git (R34.13). The mirror modules
    // go with spec/drop-mirror and are exempt until then.
    exempt = (f) =>
      f.endsWith("plugin-git.mjs") ||
      f.includes("/mirror/") ||
      f.endsWith("git/git.mjs"),
    found = [];
  for (const file of files) {
    if (exempt(file)) continue;
    const text = fs.readFileSync(path.join(APP, "..", "..", file), "utf8");
    for (const m of text.matchAll(
      /\b(git|run|execFile|execFileSync|spawn|spawnSync)\(\s*(?:"git",\s*)?[^,()]*,?\s*\[\s*(?:"-C",\s*[^,]+,\s*)?"(push|fetch|ls-remote|clone)"/g,
    ))
      if (
        !/remoteGit|remoteGitSetup/.test(
          text.slice(Math.max(0, m.index - 40), m.index + 5),
        )
      )
        found.push(`${file}: ${m[2]}`);
  }
  assert.deepEqual(found, []);
  const all = files
    .filter((f) => !exempt(f))
    .map((f) => fs.readFileSync(path.join(APP, "..", "..", f), "utf8"))
    .join("\n");
  assert.doesNotMatch(all, /gh auth git-credential/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(APP, "git", "repo-files.mjs"), "utf8"),
    /extraheader/,
  );
});
