import fs from "node:fs";
import path from "node:path";
import { machineCredentials } from "../github/github-credentials.mjs";
import {
  approvePlugin,
  inspectPlugins,
  writePluginSettings,
} from "../plugins/plugins.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import {
  Grants,
  confirmStep,
  currentJob,
  withJob,
} from "../github/github-jobs.mjs";

// A provider that always hands out one fake token, for tests that drive the
// real GitHubClient over a fake fetch (plugin-credentials §D8).
export function fixedCredentials(
  token = "test-token",
  login = "octocat",
  { person = login, provider = "fixed" } = {},
) {
  return {
    host: "github.com",
    available: () => true,
    async token({ repository = null, owner = null, job }) {
      return {
        token,
        login,
        person,
        provider,
        granted: "all",
        broader: false,
        expiresAt: null,
        repository,
        owner,
        job,
        key: provider,
      };
    },
    drop() {},
    signIns: () => [],
    on() {},
    close() {},
  };
}

// `client` whose calls run as `job` unless the code under test already
// bound one (an operation entry, a tick step or a write site's own job).
export function defaultJob(job, client) {
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      const value = target[prop],
        self = receiver === proxy ? target : receiver;
      if (typeof value !== "function") return value;
      return (...args) => {
        const run = () => value.apply(self, args),
          result = currentJob() ? run() : withJob(job, run);
        return result === target ? proxy : result;
      };
    },
  });
  return proxy;
}

// Runs `fn` as the high-risk `job` on `target` with a person's Allow, as
// the confirm makes it (plugin-credentials §D7).
export function granted(job, target, fn) {
  const grants = new Grants().allow([confirmStep({ job, target })]);
  return withJob(job, fn, grants);
}

// Runs `fn` with a person's Allow for every high-risk step in `steps` (a
// setup preview's writes), as the confirm modal's Allow makes them.
export function allowing(steps, fn) {
  const grants = new Grants().allow(
    steps.filter((step) => step.risk === "high"),
  );
  return withJob(currentJob() || "check-in", fn, grants);
}

const FIXTURE = path.join(
  import.meta.dirname,
  "fixtures",
  "plugins",
  "fake-credentials",
);
export const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(FIXTURE, "avoozl-plugin.json"), "utf8"),
);

// A fake GitHub /user: the login a token signs in as.
const fakeFetch = (seen = []) =>
  async function (url, init) {
    const auth = init?.headers?.Authorization || "";
    seen.push({ path: new URL(String(url)).pathname, auth });
    const login = auth.includes("env-token") ? "env-person" : "mtdowling";
    return new Response(JSON.stringify({ login }), { status: 200 });
  };

// A plugin folder made from the fixture, with manifest changes.
export function pluginFolder(root, id, manifest = {}) {
  const folder = path.join(root, id);
  fs.cpSync(FIXTURE, folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, "avoozl-plugin.json"),
    JSON.stringify({ ...MANIFEST, id, ...manifest }),
  );
  return folder;
}

// A machine with fake credentials plugins in its plugins.json, a fake gh
// and a fake GET /user. `calls()` is what the plugins were asked.
export function credentialsMachine({
  plugins = [],
  ghToken = "gh-token-1",
} = {}) {
  const root = temporaryDirectory("avoozl-credentials-"),
    settingsFile = path.join(root, "config", "plugins.json"),
    logFile = path.join(root, "calls.jsonl"),
    ghLog = path.join(root, "gh.log"),
    gh = path.join(root, "gh.mjs");
  fs.writeFileSync(
    gh,
    `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(ghLog)}, process.argv.slice(2).join(" ") + "\\n");
${ghToken === null ? "process.exit(1);" : `await new Promise((r) => setTimeout(r, 150)); console.log(${JSON.stringify(ghToken)});`}
`,
  );
  const entries = plugins.map(({ id = "acme-github", manifest, config }) => ({
    id,
    path: pluginFolder(root, id, manifest),
    contract: 1,
    config: { logFile, ...config },
  }));
  writePluginSettings(settingsFile, { plugins: entries });
  const options = { workspaceRoot: null, settingsFile };
  return {
    root,
    settingsFile,
    options,
    approve(id = "acme-github") {
      const p = inspectPlugins(options).find((x) => x.id === id);
      return approvePlugin(options, { id, version: p.version, hash: p.hash });
    },
    credentials(env = {}, extra = {}) {
      return machineCredentials({
        settingsFile,
        apiUrl: "https://api.github.com",
        fetch: fakeFetch(),
        env: { PATH: process.env.PATH, ...env },
        ghCommand: [process.execPath, gh],
        ...extra,
      });
    },
    calls: () =>
      fs.existsSync(logFile)
        ? fs
            .readFileSync(logFile, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
    ghRuns: () =>
      fs.existsSync(ghLog)
        ? fs.readFileSync(ghLog, "utf8").trim().split("\n").filter(Boolean)
        : [],
  };
}

export const call = (credentials, repository, job = "check-in") =>
  credentials.token({
    repository,
    owner: repository.split("/")[0],
    job,
  });
