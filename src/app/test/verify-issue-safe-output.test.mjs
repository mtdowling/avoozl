import assert from "node:assert/strict";
import test from "node:test";
import { renderProvenance } from "../github-provenance.mjs";
import { formatVerification, verifyIssue } from "../verify-issue.mjs";

// RC10.3/RC10.4: verify-issue output may be posted on a public issue. Every
// string a fake GitHub returns is a sentinel; none may reach the output.
const commit = "0123456789abcdef0123456789abcdef01234567";
const CODE = "octo-org/octo-code";
const PLANS = "octo-org/octo-plans";
const SECRET = "SENTINEL-PRIVATE-TEXT";
// Not a valid login, spec name, task ID or commit.
const ODD = "SENTINEL_PRIVATE~TEXT";
const TASKS = ["rc-2.3", "rc-2.4"];
const tasks = `Status: Approved\n- [ ] rc-2.3 ${SECRET}\n- [ ] rc-2.4 ${SECRET}\n`;
const prose = `Status: Approved\n${SECRET}\n`;

function fake({ plans = false, over = {}, marker } = {}) {
  const home = plans ? PLANS : CODE;
  const base = `repos/${home}/contents/.kiro/specs/radar-coder`;
  const body = `${SECRET}\n${
    marker ??
    renderProvenance({
      spec: "radar-coder",
      tasks: TASKS,
      commit,
      approvedBy: "octocat",
      ...(plans ? { plans: PLANS } : {}),
    })
  }\n${SECRET}`;
  const table = new Map([
    [
      `repos/${CODE}/issues/7`,
      {
        status: 200,
        body: {
          title: SECRET,
          body,
          user: { login: "owner1" },
          message: SECRET,
        },
      },
    ],
    [
      `repos/${home}/collaborators/octocat/permission`,
      { status: 200, body: { permission: "write", message: SECRET } },
    ],
    [
      `repos/${CODE}/collaborators/owner1/permission`,
      { status: 200, body: { permission: "admin", message: SECRET } },
    ],
    [`repos/${home}`, { status: 200, body: { default_branch: "main" } }],
    [
      `repos/${home}/compare/main...${commit}`,
      { status: 200, body: { status: "identical", message: SECRET } },
    ],
    [`${base}/requirements.md?ref=${commit}`, { status: 200, text: prose }],
    [`${base}/design.md?ref=${commit}`, { status: 200, text: prose }],
    [`${base}/tasks.md?ref=${commit}`, { status: 200, text: tasks }],
    [
      `${base}/avoozl/manifest.json?ref=${commit}`,
      { status: 200, text: SECRET },
    ],
  ]);
  for (const [key, value] of Object.entries(over)) table.set(key, value);
  const read = async (apiPath) => {
    const hit = table.get(apiPath) ?? {
      status: 404,
      body: { message: SECRET },
    };
    return {
      status: hit.status,
      headers: hit.headers || {},
      text: hit.text ?? JSON.stringify(hit.body ?? {}),
    };
  };
  return { read, table };
}

const everything = (result) =>
  formatVerification(result) + JSON.stringify(result);

test("a hostile default branch name is not printed", async () => {
  const f = fake();
  f.table.set(`repos/${CODE}`, {
    status: 200,
    body: { default_branch: "SENTINEL-PRIVATE-TEXT" },
  });
  f.table.set(`repos/${CODE}/compare/SENTINEL-PRIVATE-TEXT...${commit}`, {
    status: 200,
    body: { status: "identical" },
  });
  const ok = await verifyIssue(`${CODE}#7`, { read: f.read });
  assert.equal(ok.exitCode, 0);
  assert.doesNotMatch(everything(ok), /SENTINEL/);
  f.table.set(`repos/${CODE}/compare/SENTINEL-PRIVATE-TEXT...${commit}`, {
    status: 200,
    body: { status: "ahead" },
  });
  const bad = await verifyIssue(`${CODE}#7`, { read: f.read });
  assert.equal(bad.exitCode, 1);
  assert.doesNotMatch(everything(bad), /SENTINEL/);
});

test("hostile values in every read stay out of the output", async () => {
  const hostile = {
    [`repos/${CODE}/collaborators/octocat/permission`]: {
      status: 200,
      body: { permission: ODD },
    },
    [`repos/${CODE}/collaborators/owner1/permission`]: {
      status: 500,
      body: { message: SECRET },
    },
    [`repos/${CODE}/compare/main...${commit}`]: {
      status: 200,
      body: { status: ODD },
    },
  };
  for (const plans of [false, true]) {
    const f = fake({ plans, over: hostile });
    const result = await verifyIssue(`${CODE}#7`, { read: f.read });
    assert.doesNotMatch(everything(result), /SENTINEL/);
  }
  const login = fake();
  login.table.set(`repos/${CODE}/issues/7`, {
    status: 200,
    body: { body: SECRET, user: { login: ODD } },
  });
  const result = await verifyIssue(`${CODE}#7`, { read: login.read });
  assert.doesNotMatch(everything(result), /SENTINEL/);
});

test("hostile marker values are refused without being repeated", async () => {
  const good = renderProvenance({
    spec: "radar-coder",
    tasks: TASKS,
    commit,
    approvedBy: "octocat",
  });
  for (const marker of [
    good.replace("octocat", ODD),
    good.replace("radar-coder", ODD),
    good.replace("rc-2.3", ODD),
    good.replace(commit, ODD),
    good.replace(" -->", ` plans=${ODD} -->`),
    good.replace(" -->", ` ${ODD}=1 -->`),
    good + `\n<!-- avoozl ${ODD} -->`,
  ]) {
    const result = await verifyIssue(`${CODE}#7`, {
      read: fake({ marker }).read,
    });
    assert.equal(result.exitCode, 1);
    assert.doesNotMatch(everything(result), /SENTINEL/);
  }
});

test("the output names only the issue's repository and the marker's plans repository", async () => {
  const code = await verifyIssue(`${CODE}#7`, { read: fake().read });
  assert.doesNotMatch(everything(code), /octo-plans/);
  const plans = await verifyIssue(`${CODE}#7`, {
    read: fake({ plans: true }).read,
  });
  assert.match(everything(plans), /octo-plans/);
  // Every repository-shaped word is one of those two.
  for (const result of [code, plans]) {
    const found = everything(result).match(/[\w.-]+\/[\w.-]+/g) || [];
    for (const name of found)
      assert.ok(
        [CODE, PLANS].includes(name) ||
          /^(compare|requirements|design|tasks)/.test(name) ||
          name === "avoozl/manifest.json" ||
          name === "requirements.md",
        name,
      );
  }
});
