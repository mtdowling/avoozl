// The docs' screenshots: the standalone page, served by the real page server
// on a scratch machine whose workspace holds a small example repository, shot
// in Chrome at desktop and phone widths, light and dark. The images never go
// in git: they are assets of the `docs-screenshots` GitHub release, and the
// docs link them at RELEASE_URL.
//
//   npm run build
//   npm run docs:screenshots -- <out dir> [--upload] [names...]
//
// `--upload` puts every shot on the release with `gh`, making the release
// first (a prerelease, never marked latest) when it does not exist.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..", "..");

export const RELEASE = "docs-screenshots";
export const RELEASE_URL = `https://github.com/mtdowling/avoozl/releases/download/${RELEASE}/`;

// Each shot: its name, the page query that opens it (or a nav view key), and
// what the page must show before the shot is taken.
// `then` runs once the page is ready, such as a click on a spec's row.
type Shot = {
  name: string;
  view?: string;
  query?: string;
  ready: string;
  then?: string;
};
const view = (name: string, key: string, ready = "[data-shell-main]") => ({
  name,
  view: key,
  ready,
});
const query = (name: string, search: string, ready = "[data-shell-main]") => ({
  name,
  query: search,
  ready,
});
export const SHOTS: Shot[] = [
  view("insights", "insights"),
  view("specs", "plans", "[data-plans-list]"),
  {
    ...view("spec", "plans", '[data-plan-row*="parser"]'),
    then: `document.querySelector('[data-plan-row*="parser"]').click()`,
  },
  view("graph", "graph"),
  view("in-flight", "delivery"),
  view("needs-you", "waiting"),
  view("activity", "activity"),
  query("settings-workspaces", "settings=workspaces"),
  query("settings-repositories", "settings=repositories"),
  query("settings-github", "settings=github"),
  query("settings-github-sync", "github=sync"),
  query("settings-github-calls", "github=calls"),
  query("settings-plugins", "settings=plugins"),
  query("settings-context", "settings=context"),
  query("settings-content", "settings=content"),
  query("settings-flow", "settings=flow"),
  query("settings-models", "settings=models"),
  query("settings-autopilot", "settings=delivery"),
];
export const SIZES = [
  { size: "desktop", width: 1280, height: 900 },
  { size: "phone", width: 390, height: 844 },
];
export const THEMES = ["light", "dark"];

// Every file name the script writes, as the docs link them.
export function screenshotNames(): string[] {
  return SHOTS.flatMap(({ name }) =>
    SIZES.flatMap(({ size }) =>
      THEMES.map((theme) => `${name}-${size}-${theme}.png`),
    ),
  );
}

// The example repository `acme/app`: two approved specs, one tick, a phase,
// a parallel group and a manual task, approved by the owner's commit.
const PARSER = {
  "requirements.md": [
    "# Parser",
    "",
    "### Requirement P1: Parse",
    "",
    "1. The parser SHALL read a config file.",
    "",
    "### Requirement P2: Report",
    "",
    "1. The parser SHALL name the line of each error.",
    "",
  ].join("\n"),
  "design.md": "# Design: parser\n\nOne parser reads the file in one pass.\n",
  "tasks.md": [
    "---",
    "repo: app",
    "---",
    "# Tasks: parser",
    "",
    "## Read",
    "",
    "- [x] `p-1` Read the file [P1]",
    "  - The parser reads a file from disk.",
    "- [ ] `p-2` Parse values (**PARALLEL**)",
    "  - [ ] `p-2.1` Parse strings [P1]",
    "    - Quoted strings parse.",
    "  - [ ] `p-2.2` Parse numbers [P1]",
    "    - Integers and decimals parse.",
    "",
    "## Report",
    "",
    "- [ ] `p-3` Name the line of each error [P2]",
    "  - Each error names its line and column.",
    "- [ ] `p-4` Try it on a real config (**MANUAL**)",
    "  - A person runs the parser on a real config file.",
    "",
  ].join("\n"),
};
const EXPORT = {
  "requirements.md":
    "# Export\n\n### Requirement E1: Export\n\n1. The tool SHALL write JSON.\n",
  "design.md": "# Design: export\n\nOne writer.\n",
  "tasks.md": [
    "---",
    "repo: app",
    "---",
    "# Tasks: export",
    "",
    "- [ ] `e-1` Write JSON [E1]",
    "  - The tool writes the parsed config as JSON.",
    "- [ ] `e-2` Write YAML [E1]",
    "  - The tool writes the parsed config as YAML.",
    "",
  ].join("\n"),
};
const OWNER = "owner@example.com";

// A fake GitHub for acme/app that answers reads: one claim branch and two
// spec issues. Every other request is a 404, and no write succeeds.
function fakeGitHub(): Promise<{ url: string; close: () => void }> {
  const issue = (number: number, name: string) => ({
    number,
    id: number * 10,
    node_id: `I_${number}`,
    title: name,
    state: "open",
    html_url: `https://github.com/acme/app/issues/${number}`,
    author_association: "OWNER",
    body: `Spec issue.\n\n<!-- avoozl-spec:${name} -->`,
    assignees: [],
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x"),
      first = Number(url.searchParams.get("page") || 1) === 1,
      send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
    if (req.method !== "GET") return send(403, { message: "Read only." });
    if (url.pathname === "/repos/acme/app/git/matching-refs/heads/avoozl/")
      return send(
        200,
        first
          ? [
              {
                ref: "refs/heads/avoozl/parser/p-2.1",
                object: { sha: "c".repeat(40) },
              },
            ]
          : [],
      );
    if (url.pathname === "/repos/acme/app/issues")
      return send(200, first ? [issue(7, "parser"), issue(8, "export")] : []);
    send(404, { message: "Not Found" });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") throw Error("No port.");
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    }),
  );
}

// The scratch machine: every Avoozl folder and the home live under `scratch`.
function scratchEnvironment(scratch: string, github: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|GH|GITHUB)_/.test(key))
      delete env[key];
  Object.assign(env, {
    HOME: path.join(scratch, "home"),
    USERPROFILE: path.join(scratch, "home"),
    XDG_CONFIG_HOME: path.join(scratch, "config"),
    XDG_STATE_HOME: path.join(scratch, "state"),
    LOCALAPPDATA: path.join(scratch, "local"),
    APPDATA: path.join(scratch, "roaming"),
    AVOOZL_GITHUB_TOKEN: "fake-token",
    GITHUB_API_URL: github,
  });
  fs.mkdirSync(env.HOME as string, { recursive: true });
  return env;
}

// The checkout with both specs, committed by the owner and on origin as
// acme/app.
function exampleCheckout(dir: string) {
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  fs.mkdirSync(dir, { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.email", OWNER);
  git("config", "user.name", "Owner");
  git("config", "commit.gpgsign", "false");
  for (const [spec, files] of Object.entries({
    parser: PARSER,
    export: EXPORT,
  }))
    for (const [file, text] of Object.entries(files)) {
      const at = path.join(dir, ".kiro", "specs", spec, file);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, text);
    }
  fs.writeFileSync(
    path.join(dir, ".avoozl.json"),
    `${JSON.stringify(
      {
        version: 1,
        github: {
          mode: "single-repo",
          repositories: {
            "acme/app": {
              baseBranch: "main",
              allowedActors: [OWNER],
              approvalTrust: "branch-protection",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(dir, ".gitignore"), "*.sqlite*\n.avoozl/\n");
  git("add", "-A");
  git("commit", "-q", "-m", "Approve the parser and export specs");
  git("remote", "add", "origin", "https://github.com/acme/app.git");
}

function avoozl(args: string[], env: NodeJS.ProcessEnv) {
  const run = spawnSync(
    process.execPath,
    [path.join(root, "cli.ts"), ...args],
    {
      env,
      encoding: "utf8",
    },
  );
  if (run.status !== 0)
    throw Error(`avoozl ${args.join(" ")} failed:\n${run.stderr}`);
}

// The environment before `shoot` points it at the scratch machine: `gh`
// needs the real home folder and its sign-in.
const startEnv = { ...process.env };

// Uploads every PNG in `out` to the release, making the release first.
function upload(out: string) {
  const files = fs
    .readdirSync(out)
    .filter((name) => name.endsWith(".png"))
    .map((name) => path.join(out, name));
  const gh = (...args: string[]) =>
    spawnSync("gh", ["--repo", "mtdowling/avoozl", ...args], {
      encoding: "utf8",
      env: startEnv,
      stdio: ["ignore", "pipe", "inherit"],
    });
  if (gh("release", "view", RELEASE).status !== 0) {
    const made = gh(
      "release",
      "create",
      RELEASE,
      "--prerelease",
      "--latest=false",
      "--title",
      "Docs screenshots",
      "--notes",
      "Screenshots the docs link to, made by npm run docs:screenshots. Not a release of Avoozl.",
    );
    if (made.status !== 0) throw Error("gh release create failed.");
  }
  const sent = gh("release", "upload", RELEASE, "--clobber", ...files);
  if (sent.status !== 0) throw Error("gh release upload failed.");
  console.log(`Uploaded ${files.length} screenshots to ${RELEASE_URL}`);
}

export async function shoot(out: string, only: string[]) {
  const { findChrome, launch } = await import(
    "../../hosts/kirocrew/ui/test/browser/chrome.ts"
  );
  const chrome = findChrome();
  if (!chrome) throw Error("No Chrome found; set AVOOZL_CHROME.");
  fs.mkdirSync(out, { recursive: true });
  // The page shows the folder, so it is a short public path, never one
  // under the home folder.
  const scratch = fs.mkdtempSync(
    path.join(process.platform === "win32" ? os.tmpdir() : "/tmp", "avoozl-"),
  );
  const github = await fakeGitHub();
  // Chrome starts in the real environment; the scratch machine is set after.
  const browser = await launch(chrome);
  const env = scratchEnvironment(scratch, github.url);
  Object.assign(process.env, env);
  const repo = path.join(scratch, "acme-app");
  exampleCheckout(repo);
  const workspace = ["--workspace", repo];
  avoozl(["init", repo], env);
  const checks = JSON.stringify({
    checks: {
      test: ["npm", "test"],
    },
  });
  avoozl(
    [
      "repository",
      "configure",
      "app",
      "--root",
      repo,
      "--json",
      checks,
      ...workspace,
    ],
    env,
  );
  avoozl(["rebuild", ...workspace], env);
  const src = (file: string) => import(path.join(root, "src", "app", file));
  const { machineAvoozlPaths, WorkspaceRegistry } = await src(
    "settings/host-config.ts",
  );
  const { workspaceConfig } = await src("settings/config.ts");
  const { startServe } = await src("serve/serve-server.ts");
  const machine = machineAvoozlPaths();
  const registryOptions = {
    configPath: path.join(machine.configDirectory, "config.json"),
    catalogPath: path.join(machine.stateDirectory, "catalog.sqlite"),
  };
  const registry = new WorkspaceRegistry(registryOptions);
  registry.add("main", { root: repo, name: "acme/app" });
  registry.close?.();
  const server = await startServe({
    config: workspaceConfig({ workspace: repo, env }),
    uiDir: path.join(root, "hosts", "kirocrew", "ui"),
    registryOptions,
    home: env.HOME,
    log: () => {},
  });
  try {
    const page = await browser.page();
    const wait = (ms: number) =>
      page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`);
    await page.open(server.ownerLink, { width: 1280, height: 900 });
    await page.until(
      `Boolean(document.querySelector('[data-shell-main]'))`,
      30000,
    );
    const app = new URL("/apps/avoozl", server.ownerLink).href;
    const shots = only.length
      ? SHOTS.filter(({ name }) => only.includes(name))
      : SHOTS;
    for (const theme of THEMES)
      for (const { size, width, height } of SIZES)
        for (const shot of shots) {
          const url = shot.query ? `${app}?${shot.query}` : app;
          const open = async (tall: number) => {
            await page.open(url, {
              width,
              height: tall,
              dark: theme === "dark",
              scale: 2,
            });
            await page.until(
              `Boolean(document.querySelector('[data-shell-main]'))`,
              30000,
            );
            if (shot.view) {
              if (width < 768)
                await page.evaluate(
                  `document.querySelector('[data-top-rail-bar]')?.click()`,
                );
              await page.until(
                `Boolean(document.querySelector('[data-nav-group="${shot.view}"]'))`,
                10000,
              );
              await page.evaluate(
                `document.querySelector('[data-nav-group="${shot.view}"]').click()`,
              );
              if (width < 768)
                await page.evaluate(
                  `document.querySelector('[data-top-rail-list]') && document.querySelector('[data-top-rail-bar]')?.click()`,
                );
            }
            await page.until(
              `Boolean(document.querySelector(${JSON.stringify(shot.ready)}))`,
              15000,
            );
            if (shot.then) {
              await page.evaluate(shot.then);
              await wait(600);
            }
            await wait(1200);
          };
          await open(height);
          // The whole page: the window grows to the tallest scroll box.
          const full = await page.evaluate<number>(
            "(() => { const s = [...document.querySelectorAll('*')].reduce((a, e) => (e.scrollHeight - e.clientHeight > a.scrollHeight - a.clientHeight ? e : a), document.documentElement); return document.documentElement.clientHeight + s.scrollHeight - s.clientHeight })()",
          );
          const tall = Math.min(3200, Math.max(height, Math.ceil(full)));
          if (tall > height) await open(tall);
          const file = path.join(out, `${shot.name}-${size}-${theme}.png`);
          await page.screenshot(file);
          console.log(file);
        }
    if (page.errors.length) console.error(page.errors.join("\n"));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    github.close();
    fs.rmSync(scratch, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const args = process.argv.slice(2),
    out = args.find((arg) => !arg.startsWith("--"));
  if (!out) {
    console.error(
      "Usage: npm run docs:screenshots -- <out dir> [--upload] [names...]",
    );
    process.exit(2);
  }
  const resolved = path.resolve(out);
  if (!path.relative(root, resolved).startsWith(".."))
    throw Error(
      "Write the screenshots outside the checkout; they never go in git.",
    );
  const names = args.filter((arg) => !arg.startsWith("--") && arg !== out);
  await shoot(resolved, names);
  if (args.includes("--upload")) upload(resolved);
}
