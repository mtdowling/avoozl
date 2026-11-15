import assert from "node:assert/strict";
import test from "node:test";
import { renderProvenance } from "../github-provenance.mjs";
import { formatVerification, verifyIssue } from "../verify-issue.mjs";
const repo = "example/mirror",
  commit = "0123456789abcdef0123456789abcdef01234567",
  ref = "private/plans";
const prose = "Status: Approved\nPRIVATE-SPEC-TEXT\n";
function fixture(over = {}) {
  const table = {
    [`repos/${repo}/issues/1`]: {
      body: {
        body: renderProvenance({
          spec: "sample",
          tasks: ["sample-1"],
          commit,
          approvedBy: "owner",
          ref,
        }),
        user: { login: "writer" },
      },
    },
    [`repos/${repo}/collaborators/owner/permission`]: {
      body: { permission: "write" },
    },
    [`repos/${repo}/collaborators/writer/permission`]: {
      body: { permission: "write" },
    },
    [`repos/${repo}`]: { body: { default_branch: "main" } },
    [`repos/${repo}/branches/private%2Fplans`]: { body: { name: ref } },
    [`repos/${repo}/compare/main...private/plans`]: {
      status: 404,
      body: { message: "No common ancestor between main and private/plans." },
    },
    [`repos/${repo}/compare/private/plans...${commit}`]: {
      body: { status: "behind" },
    },
  };
  for (const file of [
    "requirements.md",
    "design.md",
    "tasks.md",
    "avoozl/manifest.json",
  ])
    table[`repos/${repo}/contents/.kiro/specs/sample/${file}?ref=${commit}`] = {
      text: file.endsWith("json")
        ? "{}"
        : prose + (file === "tasks.md" ? "- [ ] sample-1 Build it\n" : ""),
    };
  Object.assign(table, over);
  const calls = [];
  return {
    calls,
    read: async (path) => {
      calls.push(path);
      const x = table[path] || { status: 404, body: {} };
      return {
        status: x.status ?? 200,
        headers: x.headers ?? {},
        text: x.text ?? JSON.stringify(x.body ?? {}),
      };
    },
  };
}
const run = (f, options = {}) =>
  verifyIssue(`${repo}#1`, { read: f.read, ...options });
test("an approved commit behind its orphan plans ref passes and returns exact crew source commands", async () => {
  const f = fixture(),
    result = await run(f);
  assert.equal(result.ok, true);
  assert.equal(result.ref, ref);
  assert.deepEqual(result.source, {
    repository: repo,
    ref,
    fetch: `git fetch https://github.com/${repo}.git refs/heads/private/plans`,
    show: [
      "requirements.md",
      "design.md",
      "tasks.md",
      "avoozl/manifest.json",
    ].map((p) => `git show ${commit}:.kiro/specs/sample/${p}`),
  });
  assert.ok(
    f.calls.includes(`repos/${repo}/compare/private/plans...${commit}`),
  );
  const plain = formatVerification(result);
  assert.doesNotMatch(plain, /PRIVATE-SPEC/);
  assert.ok(plain.includes(`plans branch ${ref}`));
  assert.ok(plain.includes(`  ${result.source.fetch}\n`));
  for (const command of result.source.show)
    assert.ok(plain.includes(`  ${command}`));
});
test("a marker without a ref prints only the check lines", async () => {
  const marker = renderProvenance({
      spec: "sample",
      tasks: ["sample-1"],
      commit,
      approvedBy: "owner",
    }),
    f = fixture({
      [`repos/${repo}/issues/1`]: {
        body: { body: marker, user: { login: "writer" } },
      },
      [`repos/${repo}/compare/main...${commit}`]: {
        body: { status: "behind" },
      },
    }),
    result = await run(f);
  assert.equal(result.ok, true);
  assert.equal(result.source, undefined);
  assert.equal(result.fetch, undefined);
  const plain = formatVerification(result);
  assert.equal(plain.split("\n").length, result.checks.length);
  assert.doesNotMatch(plain, /git (fetch|show)|plans branch/);
});
test("identical also passes; ahead, diverged and malformed ancestry never produce commands or a brief", async () => {
  for (const status of ["identical", "ahead", "diverged", "other", null]) {
    const r = await run(
      fixture({
        [`repos/${repo}/compare/private/plans...${commit}`]: {
          body: { status },
        },
      }),
      { brief: true },
    );
    assert.equal(r.ok, status === "identical");
    if (!r.ok) {
      assert.equal(r.source, undefined);
      assert.equal(r.brief, undefined);
    }
  }
});
test("default, missing, shared-history and unproven orphan refs fail closed", async () => {
  const cases = [
    { [`repos/${repo}`]: { body: { default_branch: ref } } },
    { [`repos/${repo}/branches/private%2Fplans`]: { status: 404 } },
    {
      [`repos/${repo}/compare/main...private/plans`]: {
        body: { status: "diverged" },
      },
    },
    {
      [`repos/${repo}/compare/main...private/plans`]: {
        status: 404,
        body: { message: "Not Found" },
      },
    },
    {
      [`repos/${repo}/compare/main...private/plans`]: {
        status: 404,
        text: "not json",
      },
    },
  ];
  for (const c of cases) {
    const r = await run(fixture(c), { brief: true });
    assert.equal(r.exitCode, 1);
    assert.equal(r.source, undefined);
    assert.equal(r.brief, undefined);
  }
});
test("unavailable branch, orphan proof and ancestry reads return unavailable without private data", async () => {
  for (const p of [
    `branches/private%2Fplans`,
    `compare/main...private/plans`,
    `compare/private/plans...${commit}`,
  ]) {
    const r = await run(
      fixture({
        [`repos/${repo}/${p}`]: { status: 503, text: "SECRET-RESPONSE" },
      }),
    );
    assert.equal(r.exitCode, 2);
    assert.equal(r.source, undefined);
    assert.doesNotMatch(JSON.stringify(r), /SECRET-RESPONSE|PRIVATE-SPEC/);
  }
});
test("code PRs still target the code base, not the plans ref", async () => {
  for (const branch of ["main", ref]) {
    const r = await run(
      fixture({
        [`repos/${repo}/pulls/8`]: { body: { base: { ref: branch } } },
      }),
      { pull: 8 },
    );
    assert.equal(r.ok, branch === "main");
  }
});
