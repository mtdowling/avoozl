// Shared by proofs 18 and 19: a single-repo workspace on a fake GitHub with
// several source issues, each asking for its own plan. No real repository is
// written and no plan is approved in a real workspace.
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

export const REPO = "example/code",
  APPROVAL = "plan approved",
  CLAIM = "crew: in progress",
  READY = "ready";

class ProofGitHub extends FakeGitHub {
  constructor(sources) {
    super();
    for (const number of sources)
      this.created.push({
        id: 7000 + number,
        node_id: `issue-source-${number}`,
        number,
        repository: REPO,
        state: "open",
        labels: [{ name: "to plan" }],
        title: `Plan ${number}`,
        body: "Please plan this.",
        html_url: `https://example.test/${REPO}/issues/${number}`,
        user: { login: "owner" },
        assignees: [],
      });
    this.permissions.set("owner", "admin");
  }
  available() {
    return true;
  }
  listIssueComments(_repository, number) {
    return Promise.resolve(
      structuredClone(this.comments.filter((c) => c.number === number)),
    );
  }
  issueOf(number) {
    return this.created.find((issue) => issue.number === number);
  }
  labelNames(number) {
    return this.issueOf(number)
      .labels.map((label) => label.name)
      .sort();
  }
  labeledBy(number, login, label = APPROVAL) {
    this.addLabels(REPO, number, [label]);
    this.events.set(number, [
      ...(this.events.get(number) || []),
      { event: "labeled", label: { name: label }, actor: { login } },
    ]);
  }
  commentsOn(number, pattern) {
    return this.comments.filter(
      (c) => c.number === number && pattern.test(c.body),
    );
  }
}

// `sources` maps a source issue number to its spec name.
export function proofWorkspace(t, sources) {
  const root = temporaryDirectory("avoozl-proof-"),
    code = temporaryDirectory("avoozl-proof-code-"),
    github = new ProofGitHub(Object.keys(sources).map(Number));
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_proofapproval001",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["owner"],
            coder: "issue-radar",
            managedLabels: { managed: "avoozl:managed", ready: READY },
          },
        },
      },
    }),
  );
  for (const spec of Object.values(sources)) writeSpec(code, spec);
  const store = new Store(
    path.join(temporaryDirectory("avoozl-proof-db-"), "workspace.sqlite"),
  );
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    operator: "Owner",
    workspaceRoot: root,
  });
  return {
    ops,
    store,
    github,
    async configure() {
      await ops.execute("github.configure", {
        repository: REPO,
        projectId: "code",
        allowedActors: ["owner"],
      });
    },
    draft: (number) =>
      ops.execute("plan.create", {
        spec: sources[number],
        context: {
          projectId: "code",
          newPlan: { source: { repository: REPO, number } },
        },
      }),
    approve: (plan) =>
      ops.execute("plan.approve", {
        id: plan.id,
        expectedHash: plan.hash,
        expectedRevision: store.read().revision,
      }),
    tick: () => ops.execute("workspace.tick", { sessions: [] }),
    approvals: () => store.list("approvals"),
    rows: async () =>
      (await ops.execute("conflicts.view", {})).items.filter((item) =>
        /^approval-/.test(String(item.id)),
      ),
  };
}
