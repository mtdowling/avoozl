// The P29 and P44 workspace (tasks 11.9, P29, P44): an isolated temporary
// workspace, a sample repository whose bare remote answers as
// git.example.test, and the fake crew driver. Fake names only.
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../../../operations.mjs";
import { Store } from "../../../store.mjs";
import { commitIn, git } from "../../fake-crew.mjs";
import { crewDriver } from "./driver.mjs";
import { snapshot } from "../../fixtures.mjs";
import { writeSpec } from "../../spec-fixture.mjs";
import { temporaryDirectory } from "../../temporary.mjs";

export const XDG = temporaryDirectory("avoozl-crews-xdg-");
process.env.XDG_CONFIG_HOME = XDG;
export const MACHINE = path.join(XDG, "avoozl", "config.json");
// A node script, not a .sh file: Windows cannot exec a shell script directly.
export const CHECK_FILE = "scripts/validate.mjs";
export const CHECK_ARGV = ["node", CHECK_FILE];
export const CHECK = CHECK_ARGV.join(" ");
export const URL = "https://git.example.test/o/app.git";

export const IDS = ["c1", "t1", "w1", "w2", "w3", "w4", "u1"];
export const leaf = (summary, extra = {}) => ({
  kind: "leaf",
  repository: "app",
  summary,
  acceptance: [summary],
  checks: [CHECK],
  completion: "integrated",
  ...extra,
});
export const MANIFEST = {
  c1: leaf("c1 is compliance work.", { labels: ["compliance"] }),
  t1: leaf("t1 tests Windows paths.", {
    type: "test",
    paths: ["src/win/**"],
    needs: ["os:windows"],
  }),
  w1: leaf("w1 plain work."),
  w2: leaf("w2 plain work."),
  w3: leaf("w3 plain work."),
  w4: leaf("w4 plain work."),
  u1: leaf("u1 needs arm Linux.", {
    type: "test",
    needs: ["os:linux", "arch:arm64"],
  }),
};
const spec = (ids, manifest) => ({
  "tasks.md": [
    "# Tasks",
    "",
    ...ids.map((id, i) => `- [ ] ${i + 1} Do ${id}`),
    "",
  ].join("\n"),
  "avoozl/manifest.json": JSON.stringify({
    tasks: Object.fromEntries(
      ids.map((id, i) => [String(i + 1), manifest[id]]),
    ),
  }),
});
// The routing prompt on this machine (§4.10): on, with one instruction.
export const PROMPT = {
  enabled: true,
  prompt: "Keep compliance work local. Spread the rest across crews.",
};
export const CREWS = {
  local: { tags: ["os:macos", "trust:local"], chatLimit: 2 },
  "fake-linux": {
    tags: ["os:linux", "trust:remote"],
    gitHosts: ["git.example.test"],
    chatLimit: 2,
    delivery: "push",
  },
  "fake-windows": {
    tags: ["os:windows", "trust:remote"],
    gitHosts: ["git.example.test"],
    chatLimit: 1,
    delivery: "push",
  },
};

const localReading = () => ({
  source: "node",
  measuredAt: new Date().toISOString(),
  memFreeGb: 12,
  diskFreeGb: 200,
  loadPerCpu: 0.3,
});

export async function workspace(
  t,
  {
    routing,
    machine = null,
    crews = CREWS,
    ids = IDS,
    delivery = {},
    extra = {},
    mc10 = true,
    manifest = MANIFEST,
    agents = null,
  } = {},
) {
  const root = temporaryDirectory("avoozl-p29-"),
    checkout = path.join(root, "app"),
    bare = path.join(root, "remote", "app.git");
  fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
  git(root, "init", "--quiet", "--bare", bare);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  // The remote answers as git.example.test; git reads it from the bare repo.
  git(checkout, "config", `url.${bare}.insteadOf`, URL);
  git(checkout, "remote", "add", "origin", URL);
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  fs.writeFileSync(path.join(checkout, CHECK_FILE), "process.exit(0);\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  git(checkout, "push", "--quiet", "origin", "main");
  fs.mkdirSync(path.dirname(MACHINE), { recursive: true });
  fs.writeFileSync(
    MACHINE,
    JSON.stringify(
      { version: 1, crews, ...(machine ? { routing: machine } : {}) },
      null,
      2,
    ),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 10, retries: 2, ...delivery },
      ...(routing ? { routing } : {}),
      ...extra,
    }),
  );
  const ops = new Operations(store, {
    workspaceRoot: root,
    placement: { localReading },
  });
  await ops.execute("project.configure", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [CHECK_ARGV],
  });
  writeSpec(root, "p29", spec(ids, manifest));
  await ops.execute("plan.create", { spec: "p29" });
  const preview = await ops.execute("plan.preview", { id: "p29" });
  await ops.execute("plan.approve", {
    id: "p29",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
  const byTitle = Object.fromEntries(
    ops
      .read()
      .tasks.filter((x) => x.planId === "p29")
      .map((x) => [x.title.replace(/^Do /, ""), x.id]),
  );
  const aliases = Object.fromEntries(
    Object.entries(byTitle).map(([a, id]) => [id, a]),
  );
  const driver = crewDriver(store, {
    root,
    mc10,
    crews: {
      "fake-linux": {
        name: "fake linux",
        ...(agents?.["fake-linux"] ? { agents: agents["fake-linux"] } : {}),
      },
      "fake-windows": {
        name: "fake windows",
        ...(agents?.["fake-windows"] ? { agents: agents["fake-windows"] } : {}),
      },
    },
  });
  return { root, checkout, bare, store, ops, driver, id: byTitle, aliases };
}

export const passed = [{ command: CHECK, exitCode: 0 }];
export const defaults = (env) => (role) =>
  role === "worker"
    ? async ({ session, worktree, report }) => {
        const commit = session.crew
          ? env.driver.remoteCommit(session, {
              url: URL.replace("https://git.example.test/o/app.git", env.bare),
              base: git(env.checkout, "rev-parse", "main"),
              file: `src/${session.alias}.txt`,
              text: `${session.alias}\n`,
              push: true,
            })
          : commitIn(
              await worktree(),
              `src/${session.alias}.txt`,
              `${session.alias}\n`,
              `Work ${session.alias}`,
            );
        await report({ commit });
        return commit;
      }
    : role === "verifier"
      ? ({ session, report }) =>
          report({ commit: session.commit, checks: passed })
      : ({ session, report }) =>
          report({ commit: session.commit, verdict: "approved" });
