#!/usr/bin/env node
// Proof gn-p1 (github-native GN3, GN5, D3, D4): a merged spec pull request
// publishes its spec issue, and review output reaches GitHub. The owner runs
// it from his own terminal: workers and reviewers are sandboxed process
// children, and a Kiro Crew chat's sandbox refuses a nested one.
//
//   node scripts/proofs/gn-p1.ts [--root DIR] [--minutes 60] [--keep]
//   node scripts/proofs/gn-p1.ts --dry-run
//
// It makes three private scratch repositories with the gh login (the
// approver): `-ws` holds the workspace and its specs, `-pr` is code that
// lands by pull request, `-direct` is code that lands straight on main. The
// second login (avoozlbot, under GN_BOT_GH_CONFIG, default
// ~/.config/gh-avoozl-test) gets write on `-ws`, pushes a branch with two
// specs, opens the spec pull request and assigns the approver. The approver
// merges it in the browser. The run then imports the specs, runs `avoozl
// tick` every 10 seconds until both tasks land, reads GitHub, checks the
// expected items, drafts the receipt (under docs/evidence/ only on PASS) and
// deletes the scratch repositories unless --keep. The `-direct` check fails
// once by design, so one failing check run is posted.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { deleteScratchRepos, scratchRepoName } from "./run-ms-owner-proofs.ts";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(REPO, "cli.ts");
const SELF = "scripts/proofs/gn-p1.ts";
const say = (line = "") => console.log(line);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- What the run makes and checks (tested) ---------------------------------

// The three scratch repositories of one run.
export function gnRepositories(login: string, now = new Date()) {
  const base = scratchRepoName(login, "gn-p1", now);
  return { ws: `${base}-ws`, pr: `${base}-pr`, direct: `${base}-direct` };
}

// The two specs the bot proposes: one per code repository, each one task.
type SpecName = "gnp-pr" | "gnp-direct";
export const SPECS: Readonly<Record<SpecName, { repo: string; word: string }>> =
  Object.freeze({
    "gnp-pr": { repo: "app", word: "alpha" },
    "gnp-direct": { repo: "lib", word: "gamma" },
  });

export function specFiles(name: SpecName): Record<string, string> {
  const { repo, word } = SPECS[name];
  const dir = `.kiro/specs/${name}`;
  return {
    [`${dir}/requirements.md`]: `---\nrepo: ${repo}\n---\n# Note ${word}\n\nThe repository holds the note ${word}.\n`,
    [`${dir}/design.md`]: `# Design\n\nOne file, notes/${word}.txt.\n`,
    [`${dir}/tasks.md`]: `# Tasks\n\n- [ ] \`${name}-1\` Write notes/${word}.txt\n  - notes/${word}.txt holds ${word} and a newline, and node check.mjs prints ok\n`,
  };
}

// The code repositories' check. With `failOnce`, a note passes only with a
// second line, `checked`, that the task does not name: the worker's first
// commit fails once, and the failure text says what to add.
export function checkScript({ failOnce = false } = {}) {
  const want = failOnce ? "^[a-z]+\\\\nchecked\\\\n$" : "^[a-z]+\\\\n$";
  const tell = failOnce
    ? "one lowercase word, a newline, then the line checked"
    : "one lowercase word and a newline";
  return `import fs from "node:fs";
import path from "node:path";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes").filter((n) => n.endsWith(".txt")) : [];
for (const name of notes)
  if (!new RegExp("${want}").test(fs.readFileSync(path.join("notes", name), "utf8"))) {
    console.error(\`notes/\${name} must be ${tell}\`);
    process.exit(1);
  }
console.log("ok");
`;
}

type Comment = { body?: string | null };
type Mark = { task: string; round: string; kind: string };
type Issue = { number: number; author: string; assignees: string[] };
const MARKER = /<!-- avoozl:review task=(\S+) round=(\S+) kind=(\S+) -->/;

// The review markers in a list of GitHub comments ({body}).
export function reviewMarks(comments: Comment[]): Mark[] {
  return comments
    .map((comment) => MARKER.exec(comment.body ?? ""))
    .filter((match) => match !== null)
    .map(([, task, round, kind]) => ({ task, round, kind }));
}

// A commit message's trailer lines (Key: value in the last paragraph).
export function trailers(message: string): string[] {
  const last =
    String(message)
      .trim()
      .split(/\n\s*\n/)
      .at(-1) ?? "";
  const lines = last.split("\n");
  return lines.every((line) => /^[A-Za-z][A-Za-z0-9-]*: \S/.test(line))
    ? lines
    : [];
}

// The expected items, from what the run read on GitHub:
//   issues   {spec: [{author, assignees, number}]} open spec issues per spec
//   prComments  comments on the -pr task's pull request
//   issueComments  comments on the -direct spec's issue
//   landings  {task: message} each task's landing commit message
export function expectedItems({
  approver,
  bot,
  issues,
  prComments,
  issueComments,
  landings,
}: {
  approver: string;
  bot: string;
  issues: Record<string, Issue[]>;
  prComments: Comment[];
  issueComments: Comment[];
  landings: Record<string, string>;
}) {
  const one = (Object.keys(SPECS) as SpecName[]).every(
    (spec) => issues[spec]?.length === 1,
  );
  const byApprover = Object.values(issues)
    .flat()
    .every(
      (issue) =>
        issue.author === approver &&
        issue.assignees.includes(approver) &&
        !issue.assignees.includes(bot),
    );
  const unique = (marks: Mark[]) =>
    new Set(marks.map((m) => `${m.task}:${m.round}:${m.kind}`)).size ===
    marks.length;
  const pr = reviewMarks(prComments),
    direct = reviewMarks(issueComments);
  return {
    "1 one spec issue per spec, made by the approver, assigned to the approver":
      one && byApprover,
    "2a the pr task's review rounds are on its pull request, one comment each":
      pr.some((m) => m.task === "gnp-pr-1" && m.kind !== "checks") &&
      unique(pr),
    "2b the direct task's review rounds and failing check run are on the spec issue, one comment each":
      direct.some((m) => m.task === "gnp-direct-1" && m.kind !== "checks") &&
      direct.some((m) => m.task === "gnp-direct-1" && m.kind === "checks") &&
      unique(direct),
    "3 neither landing commit has a trailer":
      Object.keys(landings).length === 2 &&
      Object.values(landings).every((message) => !trailers(message).length),
  };
}

// ---- The live run ---------------------------------------------------------------

function parse(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      minutes: { type: "string", default: "60" },
      keep: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
// git with one gh login's credentials (GH_CONFIG_DIR, or the default login),
// for this command only: no git config is changed.
const gitAs =
  (configDir: string | null) =>
  (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=!gh auth git-credential",
        ...args,
      ],
      {
        cwd,
        encoding: "utf8",
        env: configDir
          ? { ...process.env, GH_CONFIG_DIR: configDir }
          : process.env,
      },
    ).trim();
const ghAs = (configDir: string | null) => (args: string[]) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    env: configDir ? { ...process.env, GH_CONFIG_DIR: configDir } : process.env,
  }).trim();

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    say(`Usage: node ${SELF} [--root DIR] [--minutes 60] [--keep] [--dry-run]`);
    return;
  }
  const botConfig =
    process.env.GN_BOT_GH_CONFIG ||
    path.join(os.homedir(), ".config", "gh-avoozl-test");
  const gh = ghAs(null),
    bot = ghAs(botConfig);
  const approver = gh(["api", "user", "--jq", ".login"]);
  const botLogin = bot(["api", "user", "--jq", ".login"]);
  if (approver === botLogin)
    throw Error("The second login must not be the approver.");
  const repos = gnRepositories(approver);
  if (options["dry-run"]) {
    say(`Approver ${approver}; second login ${botLogin}.`);
    say(`Would make ${Object.values(repos).join(", ")}, private.`);
    for (const name of Object.keys(SPECS) as SpecName[])
      say(`Spec ${name}: ${Object.keys(specFiles(name)).join(", ")}`);
    return;
  }
  // The owner's own claude-code definition (it carries his model sign-in),
  // read before the isolated home is set, else the repository's example.
  const { machineAvoozlPaths } = await import(
    "../../src/app/settings/host-config.ts"
  );
  const own = path.join(
    machineAvoozlPaths().configDirectory,
    "harnesses",
    "claude-code.json",
  );
  const definition = fs.readFileSync(
    fs.existsSync(own)
      ? own
      : path.join(REPO, "examples", "harnesses", "claude-code.json"),
  );

  const root = fs.realpathSync.native(
    options.root
      ? (fs.mkdirSync(options.root, { recursive: true }), options.root)
      : fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-gn-p1-")),
  );
  const home = path.join(root, "home");
  process.env.XDG_CONFIG_HOME = path.join(home, "config");
  process.env.XDG_STATE_HOME = path.join(home, "state");
  for (const key of Object.keys(process.env))
    if (/^(KIROCREW_|AVOOZL_)/.test(key)) delete process.env[key];
  const { sandboxKind } = await import("../../src/app/executors/sandbox.ts");
  if (!sandboxKind())
    throw Error(
      "No sandbox here (inside another sandbox?). Run this from your own Terminal, not from a Kiro Crew chat.",
    );
  const { isolatedMachine, installHarness, tickTimer } = await import(
    "./machine.ts"
  );
  const machine = await isolatedMachine(home);
  say(`Root: ${root}`);

  const made = [];
  const steps: { id: string; ok: boolean; detail: string }[] = [];
  const step = (id: string, ok: boolean, detail = "") => {
    steps.push({ id, ok, detail });
    say(`[gn-p1] ${id}: ${ok ? "ok" : "FAIL"} ${detail}`);
  };
  let timer = null;
  try {
    // Scratch repositories, the bot's write access on -ws.
    for (const repo of Object.values(repos)) {
      gh([
        "repo",
        "create",
        repo,
        "--private",
        "--description",
        "Avoozl proof gn-p1 scratch. Delete it after the run.",
      ]);
      made.push(repo);
    }
    gh([
      "api",
      "-X",
      "PUT",
      `repos/${repos.ws}/collaborators/${botLogin}`,
      "-f",
      "permission=push",
    ]);
    const invites: { id: number; repository: { full_name: string } }[] =
      JSON.parse(bot(["api", "user/repository_invitations"]));
    for (const invite of invites.filter(
      (i) => i.repository.full_name === repos.ws,
    ))
      bot(["api", "-X", "PATCH", `user/repository_invitations/${invite.id}`]);
    step("setup.repos", true, Object.values(repos).join(", "));

    // Code repositories: a README and the check.
    const P = {
      ws: path.join(root, "ws"),
      app: path.join(root, "app"),
      lib: path.join(root, "lib"),
      botWs: path.join(root, "bot-ws"),
      wt: path.join(root, "wt"),
      tickLog: path.join(root, "tick.log"),
    };
    for (const [id, repo, failOnce] of [
      ["app", repos.pr, false],
      ["lib", repos.direct, true],
    ] as const) {
      gh(["repo", "clone", repo, P[id]]);
      git(P[id], "checkout", "-q", "-B", "main");
      fs.writeFileSync(path.join(P[id], "README.md"), "gn-p1 scratch.\n");
      fs.writeFileSync(
        path.join(P[id], "check.mjs"),
        checkScript({ failOnce }),
      );
      git(P[id], "add", ".");
      git(P[id], "commit", "-q", "-m", "Start the gn-p1 scratch repository");
      gitAs(null)(P[id], "push", "-q", "origin", "main");
    }

    // The workspace, as a git checkout of -ws.
    execFileSync(process.execPath, [CLI, "init", P.ws, "--name", "gn-p1"]);
    execFileSync(process.execPath, [
      CLI,
      "workspace",
      "add",
      "gnp",
      "--root",
      P.ws,
    ]);
    const configFile = path.join(P.ws, ".avoozl.json");
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    const { ROLES } = await import("../../src/app/agents/role-table.ts");
    config.roles = Object.fromEntries(
      ROLES.map((role) => [role, { harness: "claude-code" }]),
    );
    config.github = {
      mode: "single-repo",
      repositories: Object.fromEntries(
        Object.values(repos).map((repo) => [
          repo,
          { baseBranch: "main", allowedActors: [approver] },
        ]),
      ),
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
    fs.writeFileSync(path.join(P.ws, ".gitignore"), ".avoozl/local/\n");
    fs.writeFileSync(path.join(P.ws, "README.md"), "gn-p1 workspace.\n");
    git(P.ws, "init", "-q", "-b", "main");
    git(P.ws, "remote", "add", "origin", `https://github.com/${repos.ws}.git`);
    git(P.ws, "add", ".");
    git(P.ws, "commit", "-q", "-m", "Start the gn-p1 workspace");
    gitAs(null)(P.ws, "push", "-q", "-u", "origin", "main");

    const hash = await installHarness(
      machine.configDirectory,
      "claude-code",
      definition,
    );
    const machineFile = path.join(machine.configDirectory, "config.json");
    const machineConfig = fs.existsSync(machineFile)
      ? JSON.parse(fs.readFileSync(machineFile, "utf8"))
      : { version: 1 };
    machineConfig.loop = { run: ["specs"], every: "10s" };
    fs.writeFileSync(
      machineFile,
      JSON.stringify(machineConfig, null, 2) + "\n",
    );
    const { Store } = await import("../../src/app/store/store.ts");
    const { Operations } = await import("../../src/app/api/operations.ts");
    const db = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");
    const withOps = async <T>(
      use: (
        ops: InstanceType<typeof Operations>,
        store: InstanceType<typeof Store>,
      ) => Promise<T>,
    ): Promise<T> => {
      const store = new Store(db);
      try {
        return await use(
          new Operations(store, {
            workspaceRoot: P.ws,
            configDirectory: machine.configDirectory,
          }),
          store,
        );
      } finally {
        store.close();
      }
    };
    await withOps(async (ops, store) => {
      for (const [id, repo, landing] of [
        ["app", repos.pr, "pr"],
        ["lib", repos.direct, "direct"],
      ] as const) {
        store.put("repositories", {
          id,
          root: fs.realpathSync.native(P[id]),
          baseBranch: "main",
          landing,
          checks: [["node", "check.mjs"]],
          worktreeRoot: path.join(P.wt, id),
          executor: "process",
          harness: "claude-code",
          repository: repo,
          sandbox: { allowCommands: [["node", "check.mjs"]] },
        });
        await ops.execute("github.configure", {
          repository: repo,
          repositoryId: id,
          allowedActors: [approver],
        });
      }
    });
    step("setup.workspace", true, `claude-code ${hash.slice(0, 12)}`);

    // (1) The second login proposes the specs and assigns the approver.
    const botGit = gitAs(botConfig);
    botGit(root, "clone", "-q", `https://github.com/${repos.ws}.git`, P.botWs);
    const botId = bot(["api", "user", "--jq", ".id"]);
    git(P.botWs, "config", "user.name", botLogin);
    git(
      P.botWs,
      "config",
      "user.email",
      `${botId}+${botLogin}@users.noreply.github.com`,
    );
    git(P.botWs, "checkout", "-q", "-b", "spec/gnp");
    for (const name of Object.keys(SPECS) as SpecName[])
      for (const [file, text] of Object.entries(specFiles(name))) {
        fs.mkdirSync(path.dirname(path.join(P.botWs, file)), {
          recursive: true,
        });
        fs.writeFileSync(path.join(P.botWs, file), text);
      }
    git(P.botWs, "add", ".");
    git(P.botWs, "commit", "-q", "-m", "Propose the gnp specs");
    botGit(P.botWs, "push", "-q", "origin", "spec/gnp");
    const prUrl = bot([
      "pr",
      "create",
      "--repo",
      repos.ws,
      "--head",
      "spec/gnp",
      "--base",
      "main",
      "--title",
      "Propose the gnp specs",
      "--body",
      "Two one-task specs for proof gn-p1.",
      "--assignee",
      approver,
    ]);
    step("1.spec-pr", true, prUrl);

    // The approver's merge: a person's step.
    const terminal = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    say(`  Your turn: merge ${prUrl} in the browser as ${approver}.`);
    await terminal.question("  Press Enter when it is merged. ");
    terminal.close();
    const merged = JSON.parse(
      gh(["pr", "view", prUrl, "--json", "state,mergedBy"]),
    );
    if (merged.state !== "MERGED" || merged.mergedBy?.login !== approver)
      throw Error(
        `${prUrl} is ${merged.state}, merged by ${merged.mergedBy?.login ?? "nobody"}.`,
      );
    git(P.ws, "pull", "-q", "--ff-only", "origin", "main");
    await withOps(async (ops) => {
      for (const name of Object.keys(SPECS) as SpecName[])
        await ops.execute("plan.create", { spec: name });
    });
    step("1.merged", true, `merged by ${approver}`);

    // (2) Ticks until both tasks land.
    timer = tickTimer(CLI, P.tickLog, 10_000);
    const end = Date.now() + Number(options.minutes) * 60_000;
    let landed = false;
    while (!landed && Date.now() < end) {
      await sleep(15_000);
      landed = await withOps(async (_ops, store) =>
        (Object.keys(SPECS) as SpecName[]).every(
          (spec) =>
            store.get("task_deliveries", `${spec}-1`)?.state === "integrated",
        ),
      );
    }
    // A few more passes post the last review output.
    await sleep(60_000);
    await timer.stop();
    timer = null;
    step(
      "2.landed",
      landed,
      landed ? "both tasks integrated" : `timed out; see ${P.tickLog}`,
    );

    // Read GitHub and check the expected items.
    type GitHubIssue = {
      number: number;
      title: string;
      body: string | null;
      pull_request?: unknown;
      user: { login: string };
      assignees: { login: string }[];
    };
    const issueList: GitHubIssue[] = JSON.parse(
      gh(["api", `repos/${repos.ws}/issues?state=all&per_page=100`]),
    ).filter((issue: GitHubIssue) => !issue.pull_request);
    const issues = Object.fromEntries(
      (Object.keys(SPECS) as SpecName[]).map((spec) => [
        spec,
        issueList
          .filter(
            (issue) =>
              (issue.body ?? "").includes(spec) || issue.title.includes(spec),
          )
          .map((issue) => ({
            number: issue.number,
            author: issue.user.login,
            assignees: issue.assignees.map((a) => a.login),
          })),
      ]),
    );
    const comments = (repo: string, number: number | undefined): Comment[] =>
      number
        ? JSON.parse(
            gh(["api", `repos/${repo}/issues/${number}/comments?per_page=100`]),
          )
        : [];
    const pulls: { number: number }[] = JSON.parse(
      gh(["api", `repos/${repos.pr}/pulls?state=all&per_page=100`]),
    );
    const prComments = pulls.flatMap((pull) => comments(repos.pr, pull.number));
    const issueComments = comments(repos.ws, issues["gnp-direct"][0]?.number);
    const landings: Record<string, string> = {};
    for (const [task, id] of [
      ["gnp-pr-1", "app"],
      ["gnp-direct-1", "lib"],
    ] as const) {
      git(P[id], "fetch", "-q", "origin", "main");
      const message = git(P[id], "log", "-1", "--format=%B", "origin/main");
      if (git(P[id], "rev-list", "--count", "origin/main") !== "1")
        landings[task] = message;
    }
    const expected = expectedItems({
      approver,
      bot: botLogin,
      issues,
      prComments,
      issueComments,
      landings,
    });
    for (const [item, ok] of Object.entries(expected)) step(item, ok);
  } catch (error) {
    step("stopped", false, String((error as Error).message).slice(0, 600));
  } finally {
    await timer?.stop();
    const pass = steps.length > 0 && steps.every((s) => s.ok);
    const dir = pass
      ? path.join(REPO, "docs", "evidence")
      : path.join(root, "evidence");
    fs.mkdirSync(dir, { recursive: true });
    const receipt = path.join(dir, "gn-p1.md");
    fs.writeFileSync(
      receipt,
      [
        "# Proof gn-p1: a merged spec PR publishes its issue, and review output reaches GitHub",
        "",
        `A draft written by \`${SELF}\`. Read it and correct what the run got wrong before you commit it.`,
        "",
        `- Result: ${pass ? "PASS" : "FAIL"}`,
        `- Run: ${new Date().toISOString()} on ${process.platform}, Avoozl ${git(REPO, "rev-parse", "--short", "HEAD")}`,
        "",
        "| Step | Result | Detail |",
        "| --- | --- | --- |",
        ...steps.map(
          (s) =>
            `| ${s.id} | ${s.ok ? "ok" : "FAIL"} | ${String(s.detail).replaceAll("|", "\\|")} |`,
        ),
        "",
      ].join("\n"),
    );
    say(`gn-p1 ${pass ? "PASS" : "FAIL"} ${receipt}`);
    if (options.keep) say(`Kept: ${made.join(", ")}`);
    else
      for (const line of deleteScratchRepos(made, (args: string[]) =>
        spawnSync("gh", args, { encoding: "utf8" }),
      ))
        say(line);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
)
  await main();
