// rc-26.1 to rc-26.3: the Adopt and Create setup engine (RC27) on a stateful
// fake GitHub and a fake seed. Nothing here reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { mirrorSetup, PLANS_BRANCH_DEFAULT } from "../mirror-setup.mjs";

const SOURCE = "acme/app",
  MIRROR = "acme/app-private",
  name = (value) =>
    typeof value === "string" ? value : `${value.owner}/${value.repo}`;

function notFound() {
  return Object.assign(new Error("Not Found"), { status: 404 });
}

// repos: name -> {private, branch, autoMerge, labels, branches, rules, can}
function fakeGitHub({
  repos = {},
  publicOnCreate = false,
  login = "acme",
} = {}) {
  const state = {
    repos: new Map(),
    writes: [],
    deletes: [],
    seeded: [],
  };
  const make = (id, extra = {}) =>
    state.repos.set(id, {
      private: true,
      branch: "main",
      autoMerge: false,
      labels: [],
      branches: new Map([["main", { orphan: false }]]),
      rules: [],
      can: { admin: true, push: true },
      ...extra,
    });
  make(SOURCE, { private: false });
  for (const [id, extra] of Object.entries(repos)) make(id, extra);
  const need = (value) => {
    const repo = state.repos.get(name(value));
    if (!repo) throw notFound();
    return repo;
  };
  const github = {
    state,
    available: () => true,
    currentUser: () => Promise.resolve({ login }),
    repository: (value) => {
      const repo = need(value);
      return Promise.resolve({
        default_branch: repo.branch,
        private: repo.private,
        allow_auto_merge: repo.autoMerge,
        permissions: repo.can,
      });
    },
    listLabels: (value) =>
      Promise.resolve(need(value).labels.map((label) => ({ name: label }))),
    ensureLabel: (value, label) => {
      state.writes.push(["label", name(value), label.name]);
      need(value).labels.push(label.name);
      return Promise.resolve(label);
    },
    branch: () => Promise.resolve({ protected: false }),
    branchRules: (value) =>
      Promise.resolve(
        need(value).rules.length
          ? [
              {
                type: "required_status_checks",
                parameters: {
                  required_status_checks: need(value).rules.map((context) => ({
                    context,
                  })),
                },
              },
            ]
          : [],
      ),
    branchProtection: () => Promise.resolve(null),
    listCommits: () => Promise.resolve([]),
    listPullRequests: () => Promise.resolve([]),
    checkRuns: () => Promise.resolve([]),
    commitStatus: () => Promise.resolve({ statuses: [] }),
    request(method, pathname, { body } = {}) {
      const repoPath = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(pathname);
      if (method === "DELETE") {
        state.deletes.push(pathname);
        return Promise.resolve({});
      }
      if (method === "GET" && repoPath?.[2]?.startsWith("/branches/")) {
        const found = need(repoPath[1]).branches.get(
          decodeURIComponent(repoPath[2].slice(10)),
        );
        return found
          ? Promise.resolve({ name: "x" })
          : Promise.reject(notFound());
      }
      if (method === "GET" && repoPath?.[2]?.startsWith("/compare/")) {
        const head = decodeURIComponent(repoPath[2].split("...")[1]);
        return need(repoPath[1]).branches.get(head)?.orphan
          ? Promise.reject(notFound())
          : Promise.resolve({ status: "ahead" });
      }
      if (method === "GET") return Promise.reject(notFound());
      state.writes.push([method, pathname]);
      if (
        pathname === "/user/repos" ||
        /^\/orgs\/[^/]+\/repos$/.test(pathname)
      ) {
        const owner =
          pathname === "/user/repos" ? login : pathname.split("/")[2];
        make(`${owner}/${body.name}`, {
          private: publicOnCreate ? false : body.private,
          branches: new Map(),
          can: { admin: true, push: true },
        });
        state.created = { pathname, body };
      } else if (repoPath?.[2] === "/git/trees") {
        state.tree = body.tree;
        return Promise.resolve({ sha: "tree-1" });
      } else if (repoPath?.[2] === "/git/commits") {
        state.commit = body;
        return Promise.resolve({ sha: "commit-1" });
      } else if (repoPath?.[2] === "/git/refs")
        need(repoPath[1]).branches.set(body.ref.replace("refs/heads/", ""), {
          orphan: state.commit?.parents?.length === 0,
        });
      else if (repoPath?.[2] === "/rulesets")
        need(repoPath[1]).rules.push(
          ...body.rules[0].parameters.required_status_checks.map(
            (check) => check.context,
          ),
        );
      else if (method === "PATCH")
        need(repoPath[1]).autoMerge = body.allow_auto_merge;
      return Promise.resolve({});
    },
  };
  return github;
}

function deps(github, entry = null, extra = {}) {
  const saved = [];
  return {
    github,
    entry,
    saved,
    git: {
      pushMirror: (pair) => {
        github.state.seeded.push(pair);
        github.state.repos.get(pair.mirror).branches.set("main", {
          orphan: false,
        });
        return Promise.resolve();
      },
    },
    identity: { id: "inst-0123456789ab", name: "Mira" },
    saveSetting: (mirror, value) => {
      saved.push([mirror, value]);
      return Promise.resolve();
    },
    ...extra,
  };
}

const entry = (extra = {}) => ({
  baseBranch: "main",
  requiredChecks: ["build"],
  ...extra,
});
const line = (result, id) => result.lines.find((l) => l.id === id);
const confirm = (result, extra = {}) => ({
  repository: MIRROR,
  source: SOURCE,
  confirm: true,
  previewHash: result.previewHash,
  ...extra,
});
const input = { repository: MIRROR, source: SOURCE };

test("a Create dry run lists every step in order and writes nothing", async () => {
  const github = fakeGitHub(),
    result = await mirrorSetup("create", deps(github, entry()), input);
  assert.deepEqual(
    result.lines.map((l) => [l.id, l.status]),
    [
      ["mirror", "change"],
      ["seed", "change"],
      ["plans-branch", "change"],
      ["labels", "change"],
      ["branch-rule", "change"],
      ["auto-merge", "change"],
      ["setting", "change"],
    ],
  );
  assert.deepEqual(github.state.writes, []);
  assert.deepEqual(github.state.seeded, []);
});

test("Create runs the steps in order and reads the mirror back private", async () => {
  const github = fakeGitHub(),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input),
    done = await mirrorSetup("create", d, confirm(dry));
  assert.deepEqual(
    done.applied.map((row) => [row.id, row.status]),
    [
      ["mirror", "done"],
      ["seed", "done"],
      ["plans-branch", "done"],
      ["labels", "done"],
      ["branch-rule", "done"],
      ["auto-merge", "done"],
      ["setting", "done"],
    ],
  );
  assert.equal(github.state.created.body.private, true);
  assert.equal(github.state.created.pathname, "/user/repos");
  assert.deepEqual(github.state.seeded, [{ source: SOURCE, mirror: MIRROR }]);
  const repo = github.state.repos.get(MIRROR);
  assert.equal(repo.private, true);
  assert.equal(repo.branches.get(PLANS_BRANCH_DEFAULT).orphan, true);
  assert.deepEqual(github.state.commit.parents, []);
  assert.deepEqual(repo.rules, ["build"]);
  assert.equal(repo.autoMerge, true);
  assert.equal(d.saved[0][0], MIRROR);
  assert.equal(d.saved[0][1].source, SOURCE);
  assert.equal(done.next, "radar-values");
  assert.equal(github.state.deletes.length, 0);
  // Every write went to the mirror, none to the source.
  assert.ok(
    github.state.writes.every(
      ([, where]) => !new RegExp(`^/repos/${SOURCE}(/|$)`).test(String(where)),
    ),
  );
});

test("a repeat run of either button shows zero writes and writes nothing", async () => {
  const github = fakeGitHub(),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input);
  await mirrorSetup("create", d, confirm(dry));
  const saved = { ...entry(), mirror: d.saved[0][1] },
    again = deps(github, saved),
    writes = github.state.writes.length;
  const adopt = await mirrorSetup("adopt", again, input);
  assert.equal(adopt.writes, 0);
  assert.deepEqual(
    adopt.lines.map((l) => l.status),
    adopt.lines.map(() => "ok"),
  );
  const create = await mirrorSetup("create", again, input);
  assert.equal(create.writes, 0);
  assert.equal(line(create, "mirror").status, "refused");
  assert.match(line(create, "mirror").detail, /Use Adopt existing setup/);
  const applied = await mirrorSetup("adopt", again, confirm(adopt));
  assert.deepEqual(applied.applied, []);
  assert.equal(github.state.writes.length, writes);
});

test("an existing name is refused and Create writes nothing", async () => {
  const github = fakeGitHub({ repos: { [MIRROR]: {} } }),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input),
    done = await mirrorSetup("create", d, confirm(dry));
  assert.equal(done.applied.length, 0);
  assert.deepEqual(github.state.writes, []);
  assert.deepEqual(github.state.seeded, []);
});

test("a mirror that reads public stops Create with one row and no delete", async () => {
  const github = fakeGitHub({ publicOnCreate: true }),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input),
    done = await mirrorSetup("create", d, confirm(dry));
  assert.deepEqual(
    done.applied.map((row) => [row.id, row.status]),
    [["mirror", "error"]],
  );
  assert.equal(done.needsYou.length, 1);
  assert.match(done.applied[0].detail, /does not read as private/);
  assert.deepEqual(github.state.seeded, []);
  assert.deepEqual(github.state.deletes, []);
  assert.equal(
    github.state.writes.filter(([method]) => method !== "POST").length,
    0,
  );
  assert.equal(github.state.writes.length, 1);
});

test("a changed world refuses the apply and returns a new dry run", async () => {
  const github = fakeGitHub({ repos: { [MIRROR]: {} } }),
    d = deps(github, entry()),
    dry = await mirrorSetup("adopt", d, input);
  github.state.repos.get(MIRROR).labels.push("avoozl:plan");
  const result = await mirrorSetup("adopt", d, confirm(dry));
  assert.equal(result.refused, true);
  assert.notEqual(result.previewHash, dry.previewHash);
  assert.equal(result.applied, undefined);
  assert.deepEqual(github.state.writes, []);
});

test("Adopt finds what exists and writes only ticked lines", async () => {
  const github = fakeGitHub({
      repos: {
        [MIRROR]: {
          branches: new Map([
            ["main", { orphan: false }],
            [PLANS_BRANCH_DEFAULT, { orphan: true }],
          ]),
        },
      },
    }),
    d = deps(github, entry()),
    dry = await mirrorSetup("adopt", d, input);
  assert.equal(line(dry, "mirror").state, "found");
  assert.equal(line(dry, "plans-branch").state, "found");
  assert.equal(line(dry, "labels").status, "change");
  assert.equal(line(dry, "auto-merge").status, "change");
  const done = await mirrorSetup(
    "adopt",
    d,
    confirm(dry, { ticked: ["labels"] }),
  );
  assert.deepEqual(
    done.applied.map((row) => row.id),
    ["labels"],
  );
  const repo = github.state.repos.get(MIRROR);
  assert.equal(repo.labels.length, 6);
  assert.equal(repo.autoMerge, false);
  assert.deepEqual(repo.rules, []);
  assert.deepEqual(d.saved, []);
});

test("a rule another tool keeps is listed but not ticked", async () => {
  const github = fakeGitHub({ repos: { [MIRROR]: { rules: ["other-ci"] } } }),
    d = deps(github, entry()),
    dry = await mirrorSetup("adopt", d, input),
    rule = line(dry, "branch-rule");
  assert.equal(rule.state, "differs");
  assert.equal(rule.ticked, false);
  const done = await mirrorSetup("adopt", d, confirm(dry, {}));
  assert.ok(!done.applied.some((row) => row.id === "branch-rule"));
  assert.deepEqual(github.state.repos.get(MIRROR).rules, ["other-ci"]);
});

test("a missing permission gives a blocked line and one row on apply", async () => {
  const github = fakeGitHub({
      repos: { [MIRROR]: { can: { admin: false, push: true } } },
    }),
    d = deps(github, entry()),
    dry = await mirrorSetup("adopt", d, input);
  assert.equal(line(dry, "auto-merge").status, "blocked");
  assert.match(line(dry, "auto-merge").permission, /Administration/);
  const done = await mirrorSetup("adopt", d, confirm(dry));
  const rows = done.applied.filter((row) => row.status === "blocked");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["branch-rule", "auto-merge"],
  );
  assert.equal(github.state.repos.get(MIRROR).autoMerge, false);
  assert.equal(done.needsYou.length, 2);
});

test("an existing branch that shares history is left alone", async () => {
  const github = fakeGitHub({
      repos: {
        [MIRROR]: {
          branches: new Map([
            ["main", { orphan: false }],
            [PLANS_BRANCH_DEFAULT, { orphan: false }],
          ]),
        },
      },
    }),
    dry = await mirrorSetup("adopt", deps(github, entry()), input);
  assert.equal(line(dry, "plans-branch").state, "differs");
  assert.equal(line(dry, "plans-branch").status, "error");
});

test("Adopt refuses a mirror that is not private and writes nothing", async () => {
  const github = fakeGitHub({ repos: { [MIRROR]: { private: false } } }),
    d = deps(github, entry()),
    dry = await mirrorSetup("adopt", d, input);
  assert.equal(dry.writes, 0);
  assert.equal(line(dry, "mirror").status, "error");
  const done = await mirrorSetup("adopt", d, confirm(dry));
  assert.deepEqual(done.applied, []);
  assert.deepEqual(github.state.writes, []);
});

test("an organization owner creates through the organization route", async () => {
  const github = fakeGitHub({ login: "someone" }),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input);
  await mirrorSetup("create", d, confirm(dry));
  assert.equal(github.state.created.pathname, "/orgs/acme/repos");
});

test("an unticked repository line stops Create before any other write", async () => {
  const github = fakeGitHub(),
    d = deps(github, entry()),
    dry = await mirrorSetup("create", d, input),
    done = await mirrorSetup("create", d, confirm(dry, { ticked: ["labels"] }));
  assert.equal(done.applied[0].status, "skipped");
  assert.deepEqual(github.state.writes, []);
});

test("the source and mirror must differ and be named", async () => {
  const github = fakeGitHub();
  await assert.rejects(
    mirrorSetup("adopt", deps(github), { repository: MIRROR }),
    /source/,
  );
  await assert.rejects(
    mirrorSetup("adopt", deps(github), { repository: SOURCE, source: SOURCE }),
    /differ/,
  );
});

test("mirror.create through operations saves the mirror setting in the file", async (t) => {
  const { root, store } = fixture(t),
    file = path.join(root, ".avoozl.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: { mode: "single-repo", repositories: {} },
    }),
  );
  const github = fakeGitHub(),
    ops = new Operations(store, { github, workspaceRoot: root });
  ops.mirrorGit = deps(github).git;
  const dry = await ops.execute("mirror.create", input);
  assert.equal(dry.writes, 6);
  assert.equal(dry.lines.at(-1).id, "setting");
  const done = await ops.execute("mirror.create", confirm(dry));
  assert.equal(done.applied.at(-1).status, "done");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.github.repositories[MIRROR].mirror.source, SOURCE);
  const again = await ops.execute("mirror.adopt", input);
  assert.equal(again.writes, 0);
});
