import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { digest } from "../../model.ts";
import { fail, type Store } from "../store/store.ts";
import type { GitHubClient } from "../github/github.ts";
import type { Task } from "../../types.ts";
import { secretReason } from "../content/content-rules.ts";
import { requirePrivateRepository } from "../github/github.ts";
import { synchronizeAgentInstructions } from "../agents/agent-instructions.ts";
import { checkoutRoot, remoteGit } from "../git/git.ts";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
} from "../settings/layered-config.ts";
import { asJob } from "../github/github-jobs.ts";

// The workspace repository a person configured (configureWorkspaceRepository).
interface RepositoryConfig {
  root: string;
  remote: string;
  branch: string;
  directory: string;
  configuredAt: string;
  repository?: string;
  repositoryNodeId?: string;
}
// A stored plan, as publication reads and writes it.
type PlanRow = {
  id: string;
  kind?: string;
  deletedAt?: string;
  text: string;
  hash?: string;
  title?: string;
  state?: string;
  [key: string]: unknown;
};
// One portable task file's JSON, checked by importedTask.
interface PortableTask {
  schemaVersion?: unknown;
  id?: unknown;
  title?: unknown;
  summary?: string;
  acceptance?: unknown;
  status?: string;
  scope?: string;
  phase?: Task["phase"];
  track?: string;
  tags?: string[];
  resources?: unknown;
  repositoryId?: string;
  planId?: string;
  planHash?: string;
  approvedSource?: Task["approvedSource"];
  github?: Task["github"];
  archivedAt?: string | null;
  requires?: string[];
}
// One portable report's JSON, checked by importedReport.
type PortableReport = {
  id?: unknown;
  title?: unknown;
  view?: unknown;
  filters?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
} | null;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Each registered checkout's own .avoozl.json, read as a policy source.
function readPolicy(filename: string, repositoryId: string | null = null) {
  if (!fs.existsSync(filename)) return null;
  if (
    fs.lstatSync(filename).isSymbolicLink() ||
    !fs.statSync(filename).isFile()
  )
    throw Error(`Avoozl policy must be a regular file: ${filename}`);
  const text = fs.readFileSync(filename, "utf8");
  if (Buffer.byteLength(text) > 512 * 1024)
    throw Error(`Avoozl policy is too large: ${filename}`);
  // The policy file's JSON.
  let value: Record<string, unknown> | null;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw Error(`Could not parse ${filename}: ${messageOf(error)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`Avoozl policy must contain a JSON object: ${filename}`);
  if (value.version !== 1)
    throw Error(`Unsupported Avoozl policy version: ${filename}`);
  assertSafeConfig(value, `Avoozl policy at ${filename}`);
  assertPortableRepositoryConfig(value, `Avoozl policy at ${filename}`);
  return {
    path: filename,
    repositoryId,
    value,
    text,
    revision: null,
    hash: digest(text),
  };
}

function configuredRepositoryInstructionSources(
  store: Store,
  { exclude = [] }: { exclude?: string[] } = {},
) {
  const excluded = new Set(exclude.map((filename) => path.resolve(filename))),
    candidates = store
      .list<{ id: string; root?: string }>("repositories")
      .filter((repository) => repository.root)
      .map((repository) => ({
        filename: path.join(
          path.resolve(String(repository.root)),
          ".avoozl.json",
        ),
        repositoryId: repository.id,
        primary: false,
      })),
    seen = new Set<string>(),
    sources: (NonNullable<ReturnType<typeof readPolicy>> & {
      primary: boolean;
    })[] = [];
  for (const candidate of candidates) {
    const key = path.resolve(candidate.filename);
    if (seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    const source = readPolicy(key, candidate.repositoryId);
    if (source) sources.push({ ...source, primary: candidate.primary });
  }
  return sources;
}

const exec = promisify(execFile);
const allowedPath =
  /^(workspace\.json|designs\/[a-z][a-z0-9-]{2,80}\.(md|approval\.json)|tasks\/[a-z][a-z0-9-]{2,80}\.json|reviews\/[a-zA-Z0-9_.-]+\.json)$/;

async function git(
  root: string,
  args: string[],
  options: { raw?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const { raw = false, ...execOptions } = options;
  try {
    const stdout = (
      await exec("git", args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        ...execOptions,
      })
    ).stdout;
    return raw ? stdout : stdout.trim();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    // Git's own words: the exec error carries its stderr and stdout.
    const { stderr, stdout } = Object.assign({ stderr: "", stdout: "" }, error);
    error.message = String(
      stderr || stdout || error.message || "Git failed.",
    ).trim();
    throw error;
  }
}

async function gitInput(
  root: string,
  args: string[],
  input: string,
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: root,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString().trim(),
        err = Buffer.concat(stderr).toString().trim();
      if (code === 0) resolve(out);
      else reject(Object.assign(Error(err || out || "Git failed."), { code }));
    });
    child.stdin.end(input);
  });
}

function cleanDirectory(value: unknown = ".avoozl") {
  const normalized = String(value)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../../") ||
    normalized.includes("/../") ||
    normalized === ".git" ||
    normalized.startsWith(".git/")
  )
    fail("Choose a repository-relative workspace directory.");
  return normalized;
}

function relativeFile(directory: string, name: string) {
  if (!allowedPath.test(name))
    fail("Unexpected workspace publication path " + name + ".");
  return directory + "/" + name;
}

// The published-secrets screen is the built-in rule set
// builtin:published-secrets of content-rules.mjs (design §4.9).
export { secretReason };

function scanWorkspacePublication(files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    if (!allowedPath.test(name))
      fail("Unexpected workspace publication path " + name + ".");
    if (typeof text !== "string" || text.includes("\0"))
      fail("Workspace publications must contain text only.");
    if (Buffer.byteLength(text) > 2 * 1024 * 1024)
      fail("Workspace publication file is too large: " + name + ".");
    const reason = secretReason(text);
    if (reason) fail(`Refusing to publish ${name}: detected ${reason}.`, 422);
  }
  return {
    files: Object.keys(files).length,
    bytes: Object.values(files).reduce(
      (n, text) => n + Buffer.byteLength(text),
      0,
    ),
  };
}

function taskForPublication(store: Store, task: Task) {
  const data = store.read();
  return {
    schemaVersion: 1,
    id: task.id,
    title: task.title,
    summary: task.summary || "",
    acceptance: task.acceptance || [],
    status: task.status,
    scope: task.scope,
    ...(task.phase ? { phase: task.phase } : {}),
    track: task.track,
    tags: task.tags || [],
    resources: task.resources || [],
    repositoryId: task.repositoryId || null,
    planId: task.planId || null,
    planHash: task.planHash || null,
    archivedAt: task.archivedAt || null,
    approvedSource: task.approvedSource || null,
    github: task.github
      ? {
          repository: task.github.repository,
          nodeId: task.github.nodeId,
          number: task.github.number,
          origin: task.github.origin,
          bodyHash: task.github.bodyHash,
        }
      : null,
    requires: data.edges
      .filter((edge) => edge.to === task.id && edge.kind === "requires")
      .map((edge) => edge.from),
  };
}

function workspacePublication(store: Store) {
  const repositories = store.list<{
    id: string;
    repositoryId?: string;
    label?: string;
  }>("github_repositories");
  const files: Record<string, string> = {
    "workspace.json":
      JSON.stringify(
        {
          schemaVersion: 1,
          workspaceId: store.getMeta("workspaceIdentity") || null,
          project: store.read().project,
          repositories: repositories.map((repo) => ({
            key: repo.repositoryId,
            repository: repo.id,
            label: repo.label,
          })),
          reports: (store.read().savedSearches || []).map((report) => ({
            id: report.id,
            title: report.title,
            view: report.view,
            filters: report.filters,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          })),
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
  };
  for (const plan of store
    .list<PlanRow>("plans")
    .filter((item) => item.kind !== "conversation" && !item.deletedAt)) {
    files[`designs/${plan.id}.md`] = plan.text;
    const approval = store
      .list<{
        id: string;
        planId?: string;
        hash?: string;
        approvedBy?: string;
        evidence?: string;
        at?: string;
        taskIds?: string[];
      }>("approvals")
      .find((item) => item.planId === plan.id && item.hash === plan.hash);
    if (approval)
      files[`designs/${plan.id}.approval.json`] =
        JSON.stringify(
          {
            schemaVersion: 1,
            planId: plan.id,
            hash: approval.hash,
            approvedBy: approval.approvedBy || null,
            evidence: approval.evidence || null,
            at: approval.at,
            taskIds: approval.taskIds,
          },
          null,
          2,
        ) + "\n";
  }
  for (const task of store.read().tasks)
    files[`tasks/${task.id}.json`] =
      JSON.stringify(taskForPublication(store, task), null, 2) + "\n";
  scanWorkspacePublication(files);
  return files;
}

function githubRepositoryFromRemote(url: unknown) {
  const value = String(url || "").trim();
  const match = value.match(
    /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function configureWorkspaceRepository(
  store: Store,
  input: Record<string, unknown>,
  github: {
    repository(name: string): Promise<{ private?: boolean; node_id?: string }>;
  },
) {
  const root = await checkoutRoot(input.root, "workspace repository root");
  const config: RepositoryConfig = {
    root,
    remote: String(input.remote || "origin"),
    branch: String(input.branch || "avoozl-workspace"),
    directory: cleanDirectory(input.directory),
    configuredAt: new Date().toISOString(),
  };
  if (!/^[A-Za-z0-9._/-]+$/.test(config.branch) || config.branch.includes(".."))
    fail("Choose a valid Git branch name.");
  const remoteUrl = await git(root, ["remote", "get-url", config.remote]),
    githubRepository = githubRepositoryFromRemote(remoteUrl);
  if (githubRepository) {
    const remote = await github.repository(githubRepository);
    if (!remote.private)
      fail(
        "Avoozl refuses public repositories. Choose a private workspace repository.",
        403,
      );
    config.repository = githubRepository;
    config.repositoryNodeId = remote.node_id;
  }
  store.setMeta("workspaceRepository", config);
  store.event(null, "workspace.repository.configured", {
    remote: config.remote,
    branch: config.branch,
    directory: config.directory,
  });
  return config;
}

async function remoteHead(config: RepositoryConfig, { fetch = true } = {}) {
  if (fetch)
    await remoteGit(config.root, [
      "fetch",
      "--no-tags",
      config.remote,
      `+refs/heads/${config.branch}:refs/remotes/${config.remote}/${config.branch}`,
    ]).catch((error) => {
      if (!/couldn't find remote ref|not found/i.test(messageOf(error)))
        throw error;
    });
  return git(config.root, [
    "rev-parse",
    "--verify",
    `refs/remotes/${config.remote}/${config.branch}^{commit}`,
  ]).catch(() => "");
}

export async function publishWorkspaceRepository(
  store: Store,
  input: { dryRun?: unknown; targetBranch?: string; message?: string } = {},
) {
  const config = store.getMeta<RepositoryConfig>("workspaceRepository");
  if (!config) fail("Configure a workspace repository first.", 409);
  const files = workspacePublication(store),
    report = scanWorkspacePublication(files);
  if (input.dryRun)
    return { ...report, dryRun: true, files: Object.keys(files) };
  const base = await remoteHead(config),
    targetBranch = input.targetBranch || config.branch,
    index = path.join(
      os.tmpdir(),
      `avoozl-index-${process.pid}-${crypto.randomUUID()}`,
    ),
    env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    if (base) await git(config.root, ["read-tree", base], { env });
    else await git(config.root, ["read-tree", "--empty"], { env });
    if (base) {
      const old = await git(config.root, [
        "ls-tree",
        "-r",
        "--name-only",
        base,
        "--",
        config.directory,
      ]);
      for (const file of old.split("\n").filter(Boolean))
        await git(config.root, ["update-index", "--force-remove", "--", file], {
          env,
        });
    }
    for (const [name, text] of Object.entries(files)) {
      const oid = await gitInput(
        config.root,
        ["hash-object", "-w", "--stdin"],
        text,
        { env },
      );
      await git(
        config.root,
        [
          "update-index",
          "--add",
          "--cacheinfo",
          `100644,${oid},${relativeFile(config.directory, name)}`,
        ],
        { env },
      );
    }
    const tree = await git(config.root, ["write-tree"], { env }),
      baseTree = base
        ? await git(config.root, ["rev-parse", `${base}^{tree}`])
        : "";
    if (tree === baseTree)
      return {
        ...report,
        unchanged: true,
        commit: base,
        files: Object.keys(files),
      };
    const args = ["commit-tree", tree];
    if (base) args.push("-p", base);
    args.push("-m", input.message || "Publish Avoozl workspace");
    const commit = await git(config.root, args, { env });
    await remoteGit(
      config.root,
      ["push", config.remote, `${commit}:refs/heads/${targetBranch}`],
      { job: "workspace-publish" },
    );
    const publication = {
      commit,
      branch: targetBranch,
      at: new Date().toISOString(),
      fileHashes: Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, digest(text)]),
      ),
    };
    if (targetBranch === config.branch)
      store.setMeta("workspacePublication", publication);
    store.event(null, "workspace.repository.published", {
      commit,
      branch: targetBranch,
      files: report.files,
    });
    return {
      ...report,
      commit,
      branch: targetBranch,
      files: Object.keys(files),
    };
  } finally {
    try {
      fs.unlinkSync(index);
    } catch {}
  }
}

async function readRemoteFiles(config: RepositoryConfig, commit: string) {
  const prefix = config.directory + "/",
    listed = await git(config.root, [
      "ls-tree",
      "-r",
      "--name-only",
      commit,
      "--",
      config.directory,
    ]),
    files: Record<string, string> = {};
  for (const full of listed.split("\n").filter(Boolean)) {
    if (!full.startsWith(prefix)) fail("Invalid workspace repository path.");
    const relative = full.slice(prefix.length);
    if (!allowedPath.test(relative))
      fail("Unexpected file in managed workspace directory: " + relative + ".");
    files[relative] = await git(config.root, ["show", `${commit}:${full}`], {
      raw: true,
    });
  }
  scanWorkspacePublication(files);
  return files;
}

async function readRemoteAvoozlPolicy(
  config: RepositoryConfig,
  commit: string,
): Promise<{ text: string; value: Record<string, unknown> }> {
  const filename = ".avoozl.json",
    entry = await git(config.root, ["ls-tree", commit, "--", filename]);
  if (!entry) return { text: "", value: {} };
  if (!/^100(?:644|755) blob /.test(entry))
    fail("The planning repository .avoozl.json must be a regular file.");
  const text = await git(config.root, ["show", `${commit}:${filename}`], {
    raw: true,
  });
  if (Buffer.byteLength(text) > 512 * 1024)
    fail("The planning repository .avoozl.json is too large.");
  // The planning repository's .avoozl.json.
  let value: Record<string, unknown> | null = null;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(
      `Could not parse the planning repository .avoozl.json: ${messageOf(error)}`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("The planning repository .avoozl.json must contain a JSON object.");
  if (value.version !== 1)
    fail("Unsupported planning repository .avoozl.json version.");
  assertSafeConfig(value, "planning repository .avoozl.json");
  assertPortableRepositoryConfig(value, "planning repository .avoozl.json");
  return { text, value };
}

function importedTask(value: PortableTask | null): Task {
  if (
    value?.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    !/^[a-z][a-z0-9-]{2,80}$/.test(value.id) ||
    typeof value.title !== "string" ||
    !Array.isArray(value.acceptance)
  )
    fail("Invalid portable task record.");
  return {
    id: value.id,
    title: value.title,
    summary: value.summary || "",
    acceptance: value.acceptance,
    status: value.status || "planned",
    scope: value.scope || "catalog",
    ...(value.phase ? { phase: value.phase } : {}),
    track: value.track || "catalog",
    tags: value.tags || [],
    resources: value.resources || [],
    repositoryId: value.repositoryId || undefined,
    planId: value.planId || undefined,
    planHash: value.planHash || undefined,
    approvedSource: value.approvedSource || undefined,
    github: value.github || undefined,
    archivedAt: value.archivedAt || null,
    statusAuthority: "database",
    needsReview: false,
    portable: true,
  };
}

function importedReport(value: PortableReport) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    !/^report-[a-z0-9-]{4,80}$/.test(value.id) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 160 ||
    typeof value.view !== "string" ||
    !["overview", "tasks", "epics", "graph", "documents"].includes(
      value.view,
    ) ||
    !value.filters ||
    typeof value.filters !== "object" ||
    Array.isArray(value.filters)
  )
    fail("Invalid portable report record.");
  const given = Object.fromEntries(Object.entries(value.filters)),
    filters: Record<string, unknown> = {};
  for (const key of [
    "query",
    "scopes",
    "work",
    "statuses",
    "epics",
    "tracks",
    "tags",
    "activity",
    "historical",
  ]) {
    if (!Object.hasOwn(given, key)) continue;
    const filter = given[key];
    if (
      key === "historical"
        ? typeof filter !== "boolean"
        : key === "query"
          ? typeof filter !== "string" || filter.length > 2000
          : !Array.isArray(filter) ||
            filter.length > 500 ||
            filter.some(
              (item) => typeof item !== "string" || item.length > 2000,
            )
    )
      fail("Invalid portable report filter " + key + ".");
    filters[key] = structuredClone(filter);
  }
  return {
    id: value.id,
    title: value.title.trim(),
    view: value.view,
    filters,
    createdAt: value.createdAt || undefined,
    updatedAt: value.updatedAt || undefined,
  };
}

export async function syncWorkspaceRepository(store: Store) {
  const config = store.getMeta<RepositoryConfig>("workspaceRepository");
  if (!config) fail("Configure a workspace repository first.", 409);
  const commit = await remoteHead(config);
  if (!commit) fail("The workspace branch does not exist yet.", 404);
  const files = await readRemoteFiles(config, commit),
    policy = await readRemoteAvoozlPolicy(config, commit),
    repositoryPolicies = configuredRepositoryInstructionSources(store, {
      exclude: [path.join(config.root, ".avoozl.json")],
    }),
    // The portable workspace.json.
    manifest: { schemaVersion?: unknown; reports?: unknown } = JSON.parse(
      files["workspace.json"] || "{}",
    );
  if (manifest.schemaVersion !== 1)
    fail("Unsupported portable workspace schema.");
  const previous = store.getMeta<{ fileHashes: Record<string, string> }>(
      "workspaceImport",
    ) || { fileHashes: {} },
    hashes = Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, digest(text)]),
    ),
    conflicts: string[] = [];
  store.transaction(() => {
    const data = structuredClone(store.read());
    if (manifest.reports !== undefined) {
      if (!Array.isArray(manifest.reports))
        fail("Invalid portable reports collection.");
      data.savedSearches = manifest.reports.map(importedReport);
    }
    synchronizeAgentInstructions(data, null, {
      sources: [
        {
          value: policy.value,
          path: ".avoozl.json",
          repositoryId: null,
          revision: commit,
        },
        ...repositoryPolicies.map((source) => ({
          value: source.value,
          path: source.path,
          repositoryId: source.repositoryId,
          revision: source.revision,
        })),
      ],
    });
    for (const [name, text] of Object.entries(files)) {
      const design = name.match(/^designs\/([a-z][a-z0-9-]{2,80})\.md$/);
      if (!design) continue;
      const id = design[1],
        hash = digest(text),
        local = store.get<PlanRow>("plans", id),
        last = previous.fileHashes[name];
      if (local && local.hash !== hash && last && local.hash !== last) {
        conflicts.push(name);
        continue;
      }
      const approvalText = files[`designs/${id}.approval.json`],
        // The approval file's JSON.
        approval: { hash?: string } | null = approvalText
          ? JSON.parse(approvalText)
          : null,
        now = new Date().toISOString();
      store.put("plans", {
        ...(local || {
          id,
          kind: "plan",
          prompt: "Imported from the portable workspace repository.",
          revision: 1,
          createdAt: now,
          history: [],
          context: {},
        }),
        title: text.match(/^#\s+(.+)$/m)?.[1] || local?.title || id,
        text,
        hash,
        state: approval?.hash === hash ? "approved" : "draft",
        updatedAt: now,
        portableCommit: commit,
      });
    }
    for (const [name, text] of Object.entries(files)) {
      if (!name.startsWith("tasks/")) continue;
      // A portable task file's JSON.
      const value: PortableTask | null = JSON.parse(text),
        next = importedTask(value),
        local = data.tasks.find((task) => task.id === next.id),
        last = previous.fileHashes[name];
      if (
        local &&
        last &&
        digest(
          JSON.stringify(taskForPublication(store, local), null, 2) + "\n",
        ) !== last &&
        hashes[name] !== last
      ) {
        conflicts.push(name);
        continue;
      }
      if (local) Object.assign(local, next);
      else data.tasks.push(next);
      data.edges = data.edges.filter(
        (edge) =>
          !(
            edge.to === next.id &&
            edge.kind === "requires" &&
            edge.portableWorkspace
          ),
      );
      for (const from of value?.requires || [])
        if (data.tasks.some((task) => task.id === from))
          data.edges.push({
            id: `${from}:requires:${next.id}`,
            from,
            to: next.id,
            kind: "requires",
            portableWorkspace: true,
            reason:
              "Imported from portable workspace revision " +
              commit.slice(0, 12),
          });
    }
    if (conflicts.length)
      fail(
        "Workspace repository conflicts require review: " +
          conflicts.join(", "),
        409,
      );
    store.commit(data, "Synchronize portable workspace");
    store.setMeta("workspaceImport", {
      commit,
      at: new Date().toISOString(),
      fileHashes: hashes,
    });
    const source = data.agentInstructionSource;
    store.setMeta("agentInstructionSourceSnapshot", {
      path: ".avoozl.json",
      hash:
        source && typeof source === "object" && "hash" in source
          ? source.hash
          : undefined,
      revision: commit,
      text: policy.text,
      value: policy.value,
      sources: [
        {
          path: ".avoozl.json",
          repositoryId: null,
          hash: digest(JSON.stringify(policy.value)),
          revision: commit,
          text: policy.text,
          value: policy.value,
        },
        ...repositoryPolicies.map(
          ({ path, repositoryId, revision, text, value }) => ({
            path,
            repositoryId,
            hash: digest(JSON.stringify(value)),
            revision,
            text,
            value,
          }),
        ),
      ],
    });
  });
  store.event(null, "workspace.repository.synchronized", {
    commit,
    files: Object.keys(files).length,
  });
  return { commit, files: Object.keys(files), conflicts: [] };
}

export function workspaceRepositoryStatus(store: Store) {
  return {
    configuration: store.getMeta("workspaceRepository"),
    publication: store.getMeta("workspacePublication"),
    import: store.getMeta("workspaceImport"),
  };
}

export async function publishPlanningPullRequest(
  store: Store,
  github: GitHubClient,
  { planId }: { planId?: unknown },
) {
  const plan = store.get<PlanRow>("plans", planId),
    config = store.getMeta<RepositoryConfig>("workspaceRepository");
  if (!plan || plan.state !== "approved")
    fail(
      "Approve the exact design revision before requesting team review.",
      409,
    );
  if (!config?.repository)
    fail(
      "Planning pull requests require a configured private GitHub workspace repository.",
    );
  await requirePrivateRepository(github, config.repository);
  const head = `avoozl/design-${plan.id}-${String(plan.hash).slice(0, 10)}`;
  const existing = await github.listPullRequests(config.repository, {
    state: "all",
    head: `${config.repository.split("/")[0]}:${head}`,
    base: config.branch,
  });
  let pull = existing[0];
  if (!pull) {
    const publication = await publishWorkspaceRepository(store, {
      targetBranch: head,
      message: `Publish ${plan.title}`,
    });
    pull = await asJob("workspace-publish", github).createPullRequest(
      config.repository,
      {
        title: plan.title,
        head,
        base: config.branch,
        // Always a draft: a person releases it (R119.1).
        draft: true,
        body: `<!-- avoozl-planning-pr
${JSON.stringify({ version: 1, planId: plan.id, planHash: plan.hash, commit: "commit" in publication ? publication.commit : null })}
-->
Requests team review of the exact Avoozl design revision \`${plan.hash}\`. Merging authorizes projection of its task issues.`,
      },
    );
  }
  const receipt = {
    id: "planning-pr:" + pull.node_id,
    planId: plan.id,
    planHash: plan.hash,
    repository: config.repository,
    number: pull.number,
    nodeId: pull.node_id,
    url: pull.html_url,
    head,
    base: config.branch,
    state: pull.merged_at ? "merged" : pull.state,
    mergedAt: pull.merged_at || null,
    mergeCommit: pull.merge_commit_sha || null,
    observedAt: new Date().toISOString(),
  };
  store.put("receipts", receipt);
  store.event(null, "planning.pull-request", receipt);
  return receipt;
}
