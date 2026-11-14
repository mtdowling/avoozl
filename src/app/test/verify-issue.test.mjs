import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderProvenance } from "../github-provenance.mjs";
import {
  formatVerification,
  ghReader,
  parseIssueReference,
  verifyIssue,
} from "../verify-issue.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const CODE = "octo-org/octo-code";
const PLANS = "octo-org/octo-plans";
const ISSUE_TEXT = "ISSUE-TEXT-DO-NOT-ECHO";
const SPEC_TEXT = "SPEC-TEXT-DO-NOT-ECHO";
const TASKS = ["rc-2.3", "rc-2.4"];

const prose = (extra = "") =>
  `# Title\n\nStatus: Approved\n\n${SPEC_TEXT}\n${extra}`;
const tasksFile = () =>
  `# Tasks\n\nStatus: Approved\n\n- [ ] rc-2.3 First ${SPEC_TEXT}\n- [ ] rc-2.4 Second\n- [ ] rc-2.5 Third\n`;

// A fake GitHub: path -> { status, body | text, headers }. `calls` records
// every path read, in order, so a test can show a later check still ran.
function fakeGitHub({ plans = false, marker, files = {}, ...over } = {}) {
  const home = plans ? PLANS : CODE;
  const body =
    ISSUE_TEXT +
    "\n" +
    (marker ??
      renderProvenance({
        spec: "radar-coder",
        tasks: TASKS,
        commit,
        approvedBy: "octocat",
        ...(plans ? { plans: PLANS } : {}),
      })) +
    "\n" +
    ISSUE_TEXT;
  const base = `repos/${home}/contents/.kiro/specs/radar-coder`;
  const table = new Map([
    [
      `repos/${CODE}/issues/7`,
      {
        status: 200,
        body: { title: ISSUE_TEXT, body, user: { login: "owner1" } },
      },
    ],
    [
      `repos/${home}/collaborators/octocat/permission`,
      { status: 200, body: { permission: "write" } },
    ],
    [
      `repos/${CODE}/collaborators/owner1/permission`,
      { status: 200, body: { permission: "admin" } },
    ],
    [`repos/${home}`, { status: 200, body: { default_branch: "main" } }],
    [
      `repos/${home}/compare/main...${commit}`,
      { status: 200, body: { status: "identical" } },
    ],
    [`${base}/requirements.md?ref=${commit}`, { status: 200, text: prose() }],
    [`${base}/design.md?ref=${commit}`, { status: 200, text: prose() }],
    [`${base}/tasks.md?ref=${commit}`, { status: 200, text: tasksFile() }],
    [`${base}/avoozl/manifest.json?ref=${commit}`, { status: 200, text: "{}" }],
  ]);
  for (const [name, value] of Object.entries(files))
    table.set(`${base}/${name}?ref=${commit}`, value);
  for (const [key, value] of Object.entries(over)) table.set(key, value);
  const calls = [];
  const read = async (apiPath) => {
    calls.push(apiPath);
    const hit = table.get(apiPath);
    if (!hit) return { status: 404, headers: {}, text: "{}" };
    const text = hit.text ?? JSON.stringify(hit.body ?? {});
    return { status: hit.status, headers: hit.headers || {}, text };
  };
  return { read, calls, table };
}

const verify = (fake, reference = `${CODE}#7`) =>
  verifyIssue(reference, { read: fake.read });
const names = (result) => result.checks.map((c) => c.name);
const states = (result) =>
  Object.fromEntries(result.checks.map((c) => [c.name, c.status]));
const OK = {
  marker: "ok",
  approver: "ok",
  author: "ok",
  spec: "ok",
  commit: "ok",
};

test("a reference is owner/repo#number; anything else is refused", () => {
  assert.deepEqual(parseIssueReference("a-b/c.d_e#12"), {
    owner: "a-b",
    repo: "c.d_e",
    number: 12,
  });
  for (const bad of [
    "",
    "a/b",
    "a/b#0",
    "a/b#-1",
    "a/b#1x",
    "a#1",
    "a/b/c#1",
    "../b#1",
    "a/..#1",
    "a/b#1 ",
    "https://github.com/a/b/issues/1",
    null,
    undefined,
    42,
  ])
    assert.throws(
      () => parseIssueReference(bad),
      /owner\/repo#number/,
      String(bad),
    );
});

test("all checks ok in code-repository mode", async () => {
  const fake = fakeGitHub();
  const result = await verify(fake);
  assert.deepEqual(names(result), [
    "marker",
    "approver",
    "author",
    "spec",
    "commit",
  ]);
  assert.deepEqual(states(result), OK);
  assert.equal(result.exitCode, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(result.taskIds, TASKS);
  assert.equal(result.commit, commit);
  assert.equal(result.repository, CODE);
  assert.deepEqual(fake.calls.slice(0, 1), [`repos/${CODE}/issues/7`]);
  assert.ok(
    fake.calls.includes(`repos/${CODE}/collaborators/octocat/permission`),
  );
  const text = formatVerification(result);
  assert.match(text, /^marker\s+ok$/m);
  assert.match(
    text,
    /^approver\s+ok\s+octocat has write on octo-org\/octo-code$/m,
  );
  assert.match(
    text,
    /^author\s+ok\s+owner1 has admin on octo-org\/octo-code$/m,
  );
  assert.match(text, /^commit\s+ok\s+0123456 is identical to main$/m);
});

test("plans-repo mode reads approver, spec and commit from the plans repository", async () => {
  const fake = fakeGitHub({ plans: true });
  const result = await verify(fake);
  assert.deepEqual(states(result), OK);
  assert.equal(result.exitCode, 0);
  assert.ok(
    fake.calls.includes(`repos/${PLANS}/collaborators/octocat/permission`),
  );
  assert.ok(
    fake.calls.includes(`repos/${CODE}/collaborators/owner1/permission`),
  );
  assert.ok(fake.calls.includes(`repos/${PLANS}/compare/main...${commit}`));
  assert.ok(
    fake.calls.some((p) =>
      p.startsWith(`repos/${PLANS}/contents/.kiro/specs/radar-coder/`),
    ),
  );
  // Nothing about the spec or the commit is read from the code repository.
  assert.equal(
    fake.calls.filter(
      (p) => p.startsWith(`repos/${CODE}/`) && /contents|compare/.test(p),
    ).length,
    0,
  );
  assert.match(
    formatVerification(result),
    /octocat has write on octo-org\/octo-plans/,
  );
});

test("each check failing alone leaves the others reported", async () => {
  const cases = {
    approver: fakeGitHub({
      [`repos/${CODE}/collaborators/octocat/permission`]: {
        status: 200,
        body: { permission: "read" },
      },
    }),
    author: fakeGitHub({
      [`repos/${CODE}/collaborators/owner1/permission`]: {
        status: 200,
        body: { permission: "none" },
      },
    }),
    spec: fakeGitHub({
      files: {
        "tasks.md": {
          status: 200,
          text: "Status: Approved\n- [ ] rc-2.3 only\n",
        },
      },
    }),
    commit: fakeGitHub({
      [`repos/${CODE}/compare/main...${commit}`]: {
        status: 200,
        body: { status: "ahead" },
      },
    }),
  };
  for (const [failing, fake] of Object.entries(cases)) {
    const result = await verify(fake);
    assert.deepEqual(states(result), { ...OK, [failing]: "fail" }, failing);
    assert.equal(result.exitCode, 1, failing);
    assert.equal(result.ok, false);
    assert.match(
      formatVerification(result),
      new RegExp(`^FAIL ${failing}: `, "m"),
    );
  }
  // Same for the marker, which also skips what needs it.
  const result = await verify(fakeGitHub({ marker: "" }));
  assert.deepEqual(states(result), {
    marker: "fail",
    approver: "skipped",
    author: "ok",
    spec: "skipped",
    commit: "skipped",
  });
  assert.equal(result.exitCode, 1);
});

test("a spec check names the missing file, task, status or manifest", async () => {
  const reasons = {
    "bugfix.md": null,
  };
  void reasons;
  const missing = (name) => ({
    files: { [name]: { status: 404, text: "{}" } },
  });
  const cases = [
    [missing("design.md"), /design\.md/],
    [missing("tasks.md"), /tasks\.md/],
    [missing("avoozl/manifest.json"), /avoozl\/manifest\.json/],
    [
      { files: { "requirements.md": { status: 404, text: "{}" } } },
      /requirements\.md or bugfix\.md/,
    ],
    [
      {
        files: {
          "design.md": { status: 200, text: "# Design\nStatus: Draft\n" },
        },
      },
      /design\.md.*Status: Approved/,
    ],
    [
      {
        files: { "design.md": { status: 200, text: "# Design\nno status\n" } },
      },
      /design\.md/,
    ],
    [
      {
        files: {
          "design.md": {
            status: 200,
            text: "Status: Draft\nStatus: Approved\n",
          },
        },
      },
      /design\.md/,
    ],
    [
      {
        files: {
          "design.md": {
            status: 200,
            text: "\n".repeat(25) + "Status: Approved\n",
          },
        },
      },
      /design\.md/,
    ],
    [
      {
        files: {
          "tasks.md": {
            status: 200,
            text: "Status: Approved\n- [ ] rc-2.3 x\n",
          },
        },
      },
      /rc-2\.4/,
    ],
  ];
  for (const [over, pattern] of cases) {
    const result = await verify(fakeGitHub(over));
    const spec = result.checks.find((c) => c.name === "spec");
    assert.equal(spec.status, "fail", String(pattern));
    assert.match(spec.reason, pattern);
  }
  // A bugfix spec is read when requirements.md is absent.
  const bugfix = fakeGitHub({
    files: {
      "requirements.md": { status: 404, text: "{}" },
      "bugfix.md": { status: 200, text: prose() },
    },
  });
  assert.equal((await verify(bugfix)).exitCode, 0);
});

test("a 404 and a 403 each fail the permission checks", async () => {
  for (const status of [404, 403]) {
    const fake = fakeGitHub({
      [`repos/${CODE}/collaborators/octocat/permission`]: {
        status,
        body: { message: ISSUE_TEXT },
      },
      [`repos/${CODE}/collaborators/owner1/permission`]: {
        status,
        body: { message: ISSUE_TEXT },
      },
    });
    const result = await verify(fake);
    assert.deepEqual(states(result), {
      ...OK,
      approver: "fail",
      author: "fail",
    });
    assert.equal(result.exitCode, 1, String(status));
    const reasons = result.checks.map((c) => c.reason || "").join("\n");
    assert.match(reasons, new RegExp(String(status)));
    assert.doesNotMatch(formatVerification(result), new RegExp(ISSUE_TEXT));
  }
});

test("compare results: behind and identical pass; ahead, diverged and others fail", async () => {
  const run = async (status, extra = {}) =>
    verify(
      fakeGitHub({
        [`repos/${CODE}/compare/main...${commit}`]: {
          status: 200,
          body: { status, ...extra },
        },
      }),
    );
  for (const status of ["behind", "identical"]) {
    const result = await run(status);
    assert.equal(result.exitCode, 0, status);
    assert.match(formatVerification(result), new RegExp(`is ${status} `));
  }
  for (const status of ["ahead", "diverged", "weird", undefined]) {
    const result = await run(status);
    assert.equal(states(result).commit, "fail", String(status));
    assert.equal(result.exitCode, 1);
  }
  const compare = await run("ahead");
  assert.match(compare.checks.at(-1).reason, /ahead/);
});

test("a failed read fails its check closed, and later checks still run", async () => {
  const unreadable = [
    { status: 500, body: { message: ISSUE_TEXT } },
    { status: 502, body: {} },
    { status: 0, body: {} },
    { status: 429, body: {} },
    { status: 401, body: {} },
    {
      status: 403,
      body: { message: "API rate limit exceeded" },
      headers: { "x-ratelimit-remaining": "0" },
    },
  ];
  for (const bad of unreadable) {
    const fake = fakeGitHub({
      [`repos/${CODE}/collaborators/octocat/permission`]: bad,
    });
    const result = await verify(fake);
    assert.equal(states(result).approver, "fail", JSON.stringify(bad));
    assert.equal(result.exitCode, 2, JSON.stringify(bad));
    assert.equal(result.couldNotRun, true);
    // The checks after it ran anyway.
    assert.equal(states(result).author, "ok");
    assert.equal(states(result).spec, "ok");
    assert.equal(states(result).commit, "ok");
    assert.ok(fake.calls.some((p) => p.includes("/compare/")));
    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(ISSUE_TEXT.slice(0, 8) + "-TEXT-DO-NOT-ECHO[\\s\\S]*message"),
    );
  }
  // A read that throws is the same as no answer.
  const throwing = fakeGitHub();
  const read = throwing.read;
  const result = await verifyIssue(`${CODE}#7`, {
    read: async (p) => {
      if (p.includes("/compare/")) throw new Error("boom " + ISSUE_TEXT);
      return read(p);
    },
  });
  assert.equal(states(result).commit, "fail");
  assert.equal(result.exitCode, 2);
  assert.doesNotMatch(formatVerification(result), new RegExp(ISSUE_TEXT));
  // Garbage JSON is a failed read, never ok.
  const garbage = fakeGitHub({
    [`repos/${CODE}/compare/main...${commit}`]: { status: 200, text: "<html>" },
    [`repos/${CODE}/collaborators/owner1/permission`]: {
      status: 200,
      text: "[]",
    },
  });
  const bad = await verify(garbage);
  assert.deepEqual(states(bad), { ...OK, author: "fail", commit: "fail" });
});

test("an issue that cannot be read means the command could not run", async () => {
  for (const status of [404, 403, 500, 0]) {
    const fake = fakeGitHub({
      [`repos/${CODE}/issues/7`]: { status, body: {} },
    });
    const result = await verify(fake);
    assert.equal(result.exitCode, 2, String(status));
    assert.equal(states(result).marker, "fail");
    assert.equal(states(result).spec, "skipped");
  }
  // The default branch cannot be read: the commit check fails closed.
  const noRepo = await verify(
    fakeGitHub({ [`repos/${CODE}`]: { status: 404, body: {} } }),
  );
  assert.equal(states(noRepo).commit, "fail");
  assert.equal(noRepo.exitCode, 2);
});

test("marker problems: none, two, unknown version, unknown key, a pull request", async () => {
  const good = renderProvenance({
    spec: "radar-coder",
    tasks: TASKS,
    commit,
    approvedBy: "octocat",
  });
  for (const marker of [
    "no marker here",
    good + "\n" + good,
    good.replace("v=1", "v=2"),
    good.replace(" approved-by=octocat", ""),
  ]) {
    const result = await verify(fakeGitHub({ marker }));
    assert.equal(states(result).marker, "fail");
    assert.equal(result.exitCode, 1);
    assert.equal(result.taskIds.length, 0);
  }
  const unknownKey = await verify(
    fakeGitHub({ marker: good.replace(" -->", " extra=1 -->") }),
  );
  assert.equal(unknownKey.exitCode, 0);
  const pull = fakeGitHub();
  const issue = pull.table.get(`repos/${CODE}/issues/7`);
  pull.table.set(`repos/${CODE}/issues/7`, {
    ...issue,
    body: { ...issue.body, pull_request: { url: "x" } },
  });
  const result = await verify(pull);
  assert.equal(states(result).marker, "fail");
  assert.match(result.checks[0].reason, /pull request/);
});

test("the output never quotes issue or spec text", async () => {
  const fakes = [
    fakeGitHub(),
    fakeGitHub({ plans: true }),
    fakeGitHub({ marker: "" }),
    fakeGitHub({ files: { "tasks.md": { status: 200, text: SPEC_TEXT } } }),
    fakeGitHub({
      [`repos/${CODE}/collaborators/octocat/permission`]: {
        status: 403,
        body: { message: ISSUE_TEXT + SPEC_TEXT },
      },
    }),
  ];
  for (const fake of fakes) {
    const result = await verify(fake);
    const everything = formatVerification(result) + JSON.stringify(result);
    assert.doesNotMatch(everything, /DO-NOT-ECHO/);
  }
});

test("the issue author must be a login; an odd one fails the author check", async () => {
  const fake = fakeGitHub();
  const issue = fake.table.get(`repos/${CODE}/issues/7`);
  fake.table.set(`repos/${CODE}/issues/7`, {
    ...issue,
    body: { ...issue.body, user: { login: "../x" } },
  });
  const result = await verify(fake);
  assert.equal(states(result).author, "fail");
  assert.ok(!fake.calls.some((p) => p.includes("collaborators/..")));
  const ghost = fakeGitHub();
  ghost.table.set(`repos/${CODE}/issues/7`, {
    ...issue,
    body: { ...issue.body, user: null },
  });
  assert.equal(states(await verify(ghost)).author, "fail");
});

// A fake `gh` is a node script, so the test also runs on Windows.
function fakeGh(t, script) {
  const dir = temporaryDirectory();
  const file = path.join(dir, "gh.mjs");
  fs.writeFileSync(file, script);
  return ghReader({ command: process.execPath, prefix: [file] });
}

test("ghReader runs `gh api -i` and parses status, headers and body", async (t) => {
  const log = path.join(temporaryDirectory(), "args.json");
  const read = fakeGh(
    t,
    `import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));
const raw = process.argv.some((a) => a.includes("raw+json"));
process.stdout.write(raw
  ? "HTTP/2.0 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\nline 1\\n\\nline 3"
  : "HTTP/2.0 200 OK\\r\\nX-RateLimit-Remaining: 4999\\r\\n\\r\\n{\\"a\\":1}");`,
  );
  const json = await read("repos/o/r/issues/1");
  assert.equal(json.status, 200);
  assert.equal(json.text, '{"a":1}');
  assert.equal(json.headers["x-ratelimit-remaining"], "4999");
  const args = JSON.parse(fs.readFileSync(log, "utf8"));
  assert.deepEqual(args.slice(0, 2), ["api", "-i"]);
  assert.equal(args.at(-1), "repos/o/r/issues/1");
  const raw = await read("repos/o/r/contents/x?ref=abc", { raw: true });
  assert.equal(raw.text, "line 1\n\nline 3");
});

test("ghReader reports an error status, no login, no gh and a hung gh", async (t) => {
  const notFound = fakeGh(
    t,
    `process.stdout.write("HTTP/2.0 404 Not Found\\r\\n\\r\\n{\\"message\\":\\"Not Found\\"}"); process.exit(1);`,
  );
  assert.equal((await notFound("repos/o/r")).status, 404);
  const noLogin = fakeGh(
    t,
    `process.stderr.write("To get started with GitHub CLI, please run: gh auth login"); process.exit(4);`,
  );
  const login = await noLogin("repos/o/r");
  assert.equal(login.status, 0);
  assert.match(login.reason, /gh auth login/);
  const missing = ghReader({ command: "avoozl-no-such-command-xyz" });
  const gone = await missing("repos/o/r");
  assert.equal(gone.status, 0);
  assert.match(gone.reason, /gh/);
  const hung = ghReader({
    command: process.execPath,
    prefix: ["-e", "setTimeout(()=>{}, 60000)"],
    timeoutMs: 200,
  });
  assert.equal((await hung("repos/o/r")).status, 0);
});

test("the reader never uses a shell: a path with shell characters is one argument", async (t) => {
  const log = path.join(temporaryDirectory(), "args.json");
  const read = fakeGh(
    t,
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write("HTTP/2.0 200 OK\\r\\n\\r\\n{}");`,
  );
  await read("repos/o/r/contents/a;touch x&&b?ref=$(id)");
  assert.equal(
    JSON.parse(fs.readFileSync(log, "utf8")).at(-1),
    "repos/o/r/contents/a;touch x&&b?ref=$(id)",
  );
});

test("issue.verify is an observe operation that refuses a bad reference", async () => {
  const { classifyOperation } = await import("../operation-kinds.mjs");
  const { Operations } = await import("../operations.mjs");
  assert.equal(classifyOperation("issue.verify"), "observe");
  await assert.rejects(
    new Operations(null).perform("issue.verify", { issue: "nope" }),
    (error) => error.status === 64 && /owner\/repo#number/.test(error.message),
  );
});
