// plugin-credentials pc-1.3, pc-1.4 and pc-2.1: every GitHub call runs in
// one job, the client asks per job and caches per key, a failure never falls
// back, and a high-risk job runs only under a person's Allow.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { TABLES } from "../../api/operation-table.mjs";
import { landingJob } from "../../git/git.mjs";
import { Store } from "../../store/store.mjs";
import { listActivity } from "../../store/activity-log.mjs";
import { GitHubClient } from "../github.mjs";
import {
  GRANT_MS,
  Grants,
  JOBS,
  confirmStep,
  withJob,
} from "../github-jobs.mjs";
import {
  credentialsNeedsYou,
  recordCredentialEvents,
  redact,
} from "../github-credentials.mjs";
import { mcpRefusal } from "../../mcp/mcp-policy.mjs";
import { confirmHighRisk } from "../../cli/confirm-high-risk.mjs";
import {
  credentialsMachine,
  fixedCredentials,
  granted,
} from "../../test/github-credentials.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { snapshot } from "../../test/fixtures.mjs";

// One call each high-risk job may make, for the person-only checks.
const HIGH_CALL = {
  "repo-setup": (github) =>
    github.updateRepository("acme/api", { has_issues: true }),
  "issue-types-setup": (github) =>
    github.createIssueType("acme", { name: "Epic" }),
  "landing-setup": (github) =>
    github.updateRepository("acme/api", { allow_squash_merge: false }),
  "triage-setup": (github) =>
    github.request("POST", "/repos/acme/api/labels", { body: { name: "x" } }),
  "branch-delete": (github) => github.deleteBranch("acme/api", "topic"),
};

const APP = path.join(import.meta.dirname, "..", "..");
const ok = (body = {}, status = 200) =>
  new Response(JSON.stringify(body), { status });

// A client over a fake fetch that records each call's path and token.
function client(credentials, { answer = () => ok() } = {}) {
  const seen = [];
  const github = new GitHubClient({
    credentials,
    apiUrl: "https://api.example.test",
    fetch: async (url, init) => {
      const { pathname } = new URL(String(url));
      seen.push({ pathname, token: init.headers.Authorization });
      return answer(pathname, seen.length);
    },
  });
  return { github, seen };
}

// A provider that counts token calls.
function counting() {
  const base = fixedCredentials("t"),
    asked = [];
  return {
    ...base,
    asked,
    async token(input) {
      asked.push(input);
      return base.token(input);
    },
  };
}

// ---- pc-1.3 ------------------------------------------------------------

test("a call outside any job fails before any token call, naming the method", async () => {
  const credentials = counting(),
    { github, seen } = client(credentials);
  await assert.rejects(github.issue("acme/api", 1), (error) => {
    assert.equal(error.status, 500);
    assert.match(error.message, /GitHub call issue runs outside any job/);
    return true;
  });
  assert.equal(credentials.asked.length, 0);
  assert.equal(seen.length, 0);
});

test("a job lacking a method's permission fails naming the method, job and permission", async () => {
  const credentials = counting(),
    { github } = client(credentials);
  await assert.rejects(
    withJob("check-in", () =>
      github.createIssue("acme/api", { title: "x", body: "" }),
    ),
    /GitHub call createIssue needs issues: write, which job check-in does not have/,
  );
  assert.equal(credentials.asked.length, 0);
});

test("every operation entry names a job or null", () => {
  for (const table of Object.values(TABLES))
    for (const entry of table) {
      assert.ok("github" in entry, `${entry.name} names its GitHub job`);
      assert.ok(
        entry.github === null || JOBS[entry.github],
        `${entry.name}: ${entry.github} is in JOBS`,
      );
    }
});

test("every tick step passed to under() names a job", () => {
  const text = fs.readFileSync(path.join(APP, "tick", "tick.mjs"), "utf8"),
    calls = [...text.matchAll(/\bunder\(/g)].length,
    named = [...text.matchAll(/\bunder\(\s*"[^"]+",\s*"([a-z-]+)"/g)].map(
      (m) => m[1],
    );
  assert.ok(named.length > 5);
  assert.equal(named.length, calls);
  for (const job of named) assert.ok(JOBS[job], job);
});

test("every job in JOBS is named somewhere outside the table", () => {
  const files = execFileSync("git", ["ls-files", "src/app"], {
      cwd: path.join(APP, "..", ".."),
      encoding: "utf8",
    })
      .split("\n")
      .filter(
        (file) =>
          file.endsWith(".mjs") &&
          !file.includes("/test/") &&
          !file.endsWith("github-jobs.mjs"),
      ),
    text = files
      .map((file) => fs.readFileSync(path.join(APP, "..", "..", file), "utf8"))
      .join("\n");
  for (const job of Object.keys(JOBS))
    assert.ok(text.includes(`"${job}"`), `${job} is used`);
});

test("a landing range that changes .github/workflows lands as land-workflows", () => {
  const root = temporaryDirectory("avoozl-land-job-"),
    run = (...args) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  run("init", "-q", "-b", "main");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "T");
  fs.writeFileSync(path.join(root, "a.txt"), "a");
  run("add", ".");
  run("commit", "-qm", "a");
  const base = run("rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "b.txt"), "b");
  run("add", ".");
  run("commit", "-qm", "b");
  const plain = run("rev-parse", "HEAD");
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), "x");
  run("add", ".");
  run("commit", "-qm", "ci");
  const workflow = run("rev-parse", "HEAD");
  return Promise.all([
    landingJob(root, base, plain).then((job) => assert.equal(job, "land")),
    landingJob(root, base, workflow).then((job) =>
      assert.equal(job, "land-workflows"),
    ),
  ]);
});

// ---- pc-1.4 ------------------------------------------------------------

test("the client asks per job and repository, and the cache shares by permission set", async (t) => {
  const m = credentialsMachine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  const { github, seen } = client(credentials);
  await withJob("check-in", async () => {
    await github.issue("acme/api", 1);
    await github.issue("acme/api", 2);
  });
  // spec-issues and page-actions differ; triage and page-actions too.
  await withJob("evidence", () => github.issue("acme/api", 3));
  await withJob("check-in", () => github.issue("acme/web", 1));
  const asked = m.calls().map((c) => [c.repository, c.purpose]);
  assert.deepEqual(asked, [
    ["acme/api", "check-in"],
    ["acme/api", "evidence"],
    ["acme/web", "check-in"],
  ]);
  // A token made for acme/api is never sent on acme/web's call.
  const api = new Set(
      seen.filter((s) => s.pathname.includes("/acme/api/")).map((s) => s.token),
    ),
    web = new Set(
      seen.filter((s) => s.pathname.includes("/acme/web/")).map((s) => s.token),
    );
  for (const token of web) assert.ok(!api.has(token));
});

test("concurrent misses make one call, and a token is reused until 5 minutes before it expires", async (t) => {
  let now = Date.now();
  const m = credentialsMachine({ plugins: [{ config: { expiresIn: 3600 } }] });
  m.approve();
  const credentials = m.credentials({}, { now: () => now });
  t.after(() => credentials.close());
  const ask = () =>
    credentials.token({ repository: "acme/api", owner: "acme", job: "land" });
  await Promise.all([ask(), ask(), ask()]);
  assert.equal(m.calls().length, 1);
  now += 50 * 60 * 1000;
  await ask();
  assert.equal(m.calls().length, 1, "still fresh at 50 minutes");
  now += 6 * 60 * 1000;
  await ask();
  assert.equal(m.calls().length, 2, "asked again inside the last 5 minutes");
});

test("a built-in token with no expiry is used for one hour", async () => {
  let now = Date.now();
  const m = credentialsMachine(),
    credentials = m.credentials(
      { AVOOZL_GITHUB_TOKEN: "env-token" },
      { now: () => now },
    ),
    first = await credentials.token({ owner: "octo", job: "check-in" });
  now += 59 * 60 * 1000;
  assert.equal(
    await credentials.token({ owner: "octo", job: "check-in" }),
    first,
  );
  now += 2 * 60 * 1000;
  assert.notEqual(
    await credentials.token({ owner: "octo", job: "check-in" }),
    first,
  );
});

test("a 401 asks once more and retries once; a second 401 fails", async () => {
  const credentials = counting();
  let fails = 1;
  const { github, seen } = client(credentials, {
    answer: () =>
      fails-- > 0 ? ok({ message: "Bad credentials" }, 401) : ok({ number: 1 }),
  });
  assert.equal(
    (await withJob("check-in", () => github.issue("acme/api", 1))).number,
    1,
  );
  assert.equal(credentials.asked.length, 2);
  assert.equal(seen.length, 2);
  fails = 2;
  await assert.rejects(
    withJob("check-in", () => github.issue("acme/api", 2)),
    (error) => error.status === 401,
  );
});

test("a refusal, a timeout and a bad reply fail with 503, raise one Needs you row each, and call no other provider", async (t) => {
  const root = temporaryDirectory("avoozl-cred-fail-"),
    store = new Store(path.join(root, "w.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  for (const [config, pattern] of [
    [{ refuse: ["triage"] }, /acme does not allow triage/],
    [{ mode: "bad" }, /bad reply/],
    [{ mode: "slow" }, /timed out/],
  ]) {
    const m = credentialsMachine({ plugins: [{ config }] });
    m.approve();
    const credentials = m.credentials(
      {},
      config.mode === "slow" ? { timeoutMs: 3000 } : {},
    );
    t.after(() => credentials.close());
    recordCredentialEvents(store, credentials);
    await assert.rejects(
      credentials.token({
        repository: "acme/api",
        owner: "acme",
        job: "triage",
      }),
      (error) => {
        assert.equal(error.status, 503);
        assert.match(error.message, pattern);
        return true;
      },
    );
    assert.deepEqual(m.ghRuns(), [], "gh never ran for a claimed owner");
  }
  const rows = credentialsNeedsYou(store);
  assert.equal(rows.length, 1, "one row per provider, host, owner and job");
  assert.match(rows[0].title, /acme-github refused triage for acme/);
  // The next success for that key clears it.
  const m = credentialsMachine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  recordCredentialEvents(store, credentials);
  await credentials.token({
    repository: "acme/api",
    owner: "acme",
    job: "triage",
  });
  assert.equal(credentialsNeedsYou(store).length, 0);
});

test("a provider's reason is redacted and cut to 500 characters", async (t) => {
  const m = credentialsMachine({ plugins: [{ config: { mode: "leak" } }] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  const held = await credentials.token({
    repository: "acme/api",
    owner: "acme",
    job: "land",
  });
  // The plugin's next error quotes the token Avoozl holds and a PAT.
  const error = await credentials
    .token({ repository: "acme/web", owner: "acme", job: "land" })
    .catch((e) => e);
  assert.match(error.message, /\[redacted\]/);
  assert.ok(!error.message.includes(held.token));
  assert.doesNotMatch(error.message, /ghp_a{10}/);
  assert.ok(redact("x".repeat(900)).length <= 500);
});

test("the token reaches no store row, Activity row, error or child environment", async (t) => {
  const root = temporaryDirectory("avoozl-cred-leak-"),
    store = new Store(path.join(root, "w.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  const m = credentialsMachine({ plugins: [{}] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  recordCredentialEvents(store, credentials);
  const github = new GitHubClient({
    credentials,
    apiUrl: "https://api.example.test",
    fetch: async () => ok({ number: 1 }),
  }).bind(store);
  await withJob("check-in", () => github.issue("acme/api", 1));
  const token = (
    await credentials.token({
      repository: "acme/api",
      owner: "acme",
      job: "check-in",
    })
  ).token;
  const dump = JSON.stringify({
    snapshot: store.read(),
    activity: listActivity(store, {}),
    meta: store.db.prepare("SELECT * FROM meta").all?.() ?? [],
    cache: store.db.prepare("SELECT * FROM github_http_cache").all(),
    env: process.env,
  });
  assert.ok(token.length > 10);
  assert.ok(!dump.includes(token), "the token is stored nowhere");
  assert.match(
    JSON.stringify(listActivity(store, {})),
    /New GitHub token from acme-github on github\.com for check-in on acme\/api/,
  );
});

test("http is refused for a host that is not loopback", async () => {
  const github = new GitHubClient({
    credentials: fixedCredentials("t"),
    apiUrl: "http://api.example.test",
    fetch: async () => ok(),
  });
  await assert.rejects(
    withJob("check-in", () => github.issue("acme/api", 1)),
    /over https only/,
  );
});

test("Settings data marks a job broader than asked", async (t) => {
  const m = credentialsMachine({ plugins: [{ config: { mode: "broad" } }] });
  m.approve();
  const credentials = m.credentials();
  t.after(() => credentials.close());
  await credentials.token({
    repository: "acme/api",
    owner: "acme",
    job: "land",
  });
  const [line] = credentials.signIns();
  assert.equal(line.provider, "acme-github");
  assert.deepEqual(line.broader, ["land"]);
  assert.deepEqual(line.owners, ["acme"]);
  assert.equal(line.login, "acme-bot[bot]");
});

// ---- pc-2.1 ------------------------------------------------------------

const HIGH = Object.keys(JOBS).filter((job) => JOBS[job].risk === "high"),
  LOW = Object.keys(JOBS).filter((job) => JOBS[job].risk === "low");

test("every high-risk job without a grant fails as person-only before a token call, for every provider", async (t) => {
  const m = credentialsMachine({ plugins: [{}] });
  m.approve();
  for (const env of [{ AVOOZL_GITHUB_TOKEN: "env-token" }, {}]) {
    const credentials = m.credentials(env);
    t.after(() => credentials.close());
    for (const job of HIGH) {
      const { github, seen } = client(credentials);
      await assert.rejects(
        withJob(job, () => HIGH_CALL[job](github)),
        (error) => error.status === 403 && error.code === "person-only",
        job,
      );
      assert.equal(seen.length, 0);
    }
  }
  assert.deepEqual(m.calls(), [], "no provider was asked for a token");
  assert.deepEqual(m.ghRuns(), []);
});

test("every low-risk job runs without a grant", async () => {
  const credentials = counting(),
    { github } = client(credentials);
  for (const job of LOW)
    await withJob(job, () =>
      JOBS[job].owner
        ? github.request("GET", "/orgs/acme/projectsV2/1")
        : github.repository("acme/api"),
    );
  assert.equal(credentials.asked.length, LOW.length);
});

test("github.job.confirm is refused over MCP and a grant serves one step once, for 10 minutes", async () => {
  assert.ok(mcpRefusal("github.job.confirm", {}));
  const grants = new Grants(),
    step = confirmStep({ job: "landing-setup", target: "acme/api" }),
    [grant] = grants.allow([step]),
    { github, seen } = client(counting());
  const write = () =>
    withJob(
      "landing-setup",
      () => github.updateRepository("acme/api", { allow_squash_merge: false }),
      [grant],
    );
  await write();
  await assert.rejects(write(), /high risk/, "a second step needs a new Allow");
  const [late] = grants.allow([step]);
  late.at = Date.now() - GRANT_MS - 1;
  await assert.rejects(
    withJob("landing-setup", () => github.updateRepository("acme/api", {}), [
      late,
    ]),
    /high risk/,
  );
  assert.equal(seen.length, 1);
  assert.throws(
    () => grants.allow([{ ...step, permissionsHash: "0".repeat(64) }]),
    /changed since it was shown/,
  );
  assert.throws(
    () =>
      grants.allow([
        { ...step, target: "acme/web", permissionsHash: step.permissionsHash },
      ]),
    /changed since it was shown/,
  );
});

test("the CLI asks Allow? on a terminal, takes --yes, and refuses without either or with --yes in an agent", async () => {
  const steps = [confirmStep({ job: "repo-setup", target: "acme/api" })],
    calls = [],
    localOrRequest = async (name, input) => {
      calls.push(name);
      return { grants: input.steps.map(() => "g1") };
    },
    output = {
      text: "",
      write(s) {
        this.text += s;
      },
    };
  assert.deepEqual(
    await confirmHighRisk(steps, {
      yes: true,
      env: {},
      localOrRequest,
      output,
    }),
    ["g1"],
  );
  assert.match(
    output.text,
    /repo-setup asks GitHub for administration: write, issues: write, metadata: read/,
  );
  await assert.rejects(
    confirmHighRisk(steps, {
      env: {},
      localOrRequest,
      output,
      input: { isTTY: false },
    }),
    /run in a terminal, or add --yes/,
  );
  await assert.rejects(
    confirmHighRisk(steps, {
      yes: true,
      env: { KIRO_SESSION_ID: "s1" },
      localOrRequest,
      output,
    }),
    /refused inside an agent session/,
  );
  const { PassThrough } = await import("node:stream"),
    input = new PassThrough();
  input.isTTY = true;
  const asked = confirmHighRisk(steps, {
    env: {},
    localOrRequest,
    output: new PassThrough(),
    input,
  });
  input.write("n\n");
  assert.equal(await asked, null, "no writes when the person says no");
  assert.deepEqual(calls, ["github.job.confirm"]);
});

test("the tick's path to every high-risk job fails as person-only", async () => {
  const text = fs.readFileSync(path.join(APP, "tick", "tick.mjs"), "utf8");
  // The tick binds its jobs with no grant.
  assert.match(text, /withJob\(job, \(\) => step\(\.\.\.args\), \[\]\)/);
  assert.match(text, /withJob\(\s*"check-in",[\s\S]{0,120}\[\],\s*\)/);
  const { github } = client(counting());
  for (const job of HIGH)
    await assert.rejects(
      withJob(job, () => HIGH_CALL[job](github), []),
      /only a person can allow it/,
      job,
    );
});

test("a granted high-risk job runs once its Allow is given", async () => {
  const { github, seen } = client(counting());
  await granted("repo-setup", "acme/api", () =>
    github.updateRepository("acme/api", { has_issues: true }),
  );
  assert.equal(seen.length, 1);
});
