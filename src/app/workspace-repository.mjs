import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";
import { requirePrivateRepository } from "./github.mjs";
import { synchronizeAgentInstructions } from "./agent-instructions.mjs";
import { queueAssociationId } from "./github-overlap.mjs";

const exec = promisify(execFile);
const allowedPath =
  /^(workspace\.json|designs\/[a-z][a-z0-9-]{2,80}\.(md|approval\.json)|tasks\/[a-z][a-z0-9-]{2,80}\.json|reviews\/[a-zA-Z0-9_.-]+\.json|associations\/github-[a-f0-9]{24}\.json)$/;

async function git(root, args, options = {}) {
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
    error.message = (
      error.stderr ||
      error.stdout ||
      error.message ||
      "Git failed."
    ).trim();
    throw error;
  }
}

async function gitInput(root, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: root,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [],
      stderr = [];
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

function cleanDirectory(value = ".avoozl") {
  const normalized = String(value)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".git" ||
    normalized.startsWith(".git/")
  )
    fail("Choose a repository-relative workspace directory.");
  return normalized;
}

function relativeFile(directory, name) {
  if (!allowedPath.test(name))
    fail("Unexpected workspace publication path " + name + ".");
  return directory + "/" + name;
}

function secretReason(text) {
  const patterns = [
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i],
    [
      "provider or GitHub token",
      /\b(?:github_pat_|gh[pousr]_|sk-ant-|sk-proj-|xox[baprs]-)[A-Za-z0-9_-]{12,}/,
    ],
    [
      "credential assignment",
      /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^\s"'`]{8,}/i,
    ],
    ["authorization header", /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S+/i],
    ["credential-bearing URL", /https?:\/\/[^/\s:@]+:[^/\s@]+@/i],
    [
      "absolute user path",
      /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/,
    ],
  ];
  for (const [reason, pattern] of patterns)
    if (pattern.test(text)) return reason;
  for (const token of text.match(/[A-Za-z0-9+/=_-]{48,}/g) || []) {
    if (/^[a-f0-9]{64}$/i.test(token)) continue;
    const classes = [
      /[a-z]/.test(token),
      /[A-Z]/.test(token),
      /\d/.test(token),
      /[+/=_-]/.test(token),
    ].filter(Boolean).length;
    if (classes >= 3) return "high-entropy value";
  }
  return null;
}

export function scanWorkspacePublication(files) {
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

function taskForPublication(store, task) {
  const data = store.read();
  return {
    schemaVersion: 1,
    id: task.id,
    title: task.title,
    summary: task.summary || "",
    acceptance: task.acceptance || [],
    status: task.status,
    scope: task.scope,
    epic: task.epic,
    track: task.track,
    tags: task.tags || [],
    resources: task.resources || [],
    projectId: task.projectId || null,
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

function queueAssociationForPublication(association) {
  return {
    schemaVersion: 1,
    repository: association.repository,
    kind: association.kind,
    nodeId: association.nodeId || null,
    number: association.number,
    bodyHash: association.bodyHash || null,
    targetKind: association.targetKind,
    targetId: association.targetId,
    confirmedBy: association.confirmedBy || null,
    confirmedAt: association.confirmedAt,
    source: "operator-confirmed",
  };
}

export function workspacePublication(store) {
  const repositories = store.list("github_repositories");
  const files = {
    "workspace.json":
      JSON.stringify(
        {
          schemaVersion: 1,
          workspaceId: store.getMeta("workspaceIdentity") || null,
          project: store.read().project,
          projects: repositories.map((repo) => ({
            key: repo.projectId,
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
    .list("plans")
    .filter((item) => item.kind !== "conversation" && !item.deletedAt)) {
    files[`designs/${plan.id}.md`] = plan.text;
    const approval = store
      .list("approvals")
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
  for (const thread of store.list("review_threads"))
    files[`reviews/${thread.id}.json`] = JSON.stringify(thread, null, 2) + "\n";
  for (const association of store
    .list("github_queue_associations")
    .filter((item) => item.source === "operator-confirmed")) {
    const portable = queueAssociationForPublication(association),
      id = queueAssociationId(
        portable,
        portable.targetKind,
        portable.targetId,
      ).slice("github-queue-association:".length);
    files[`associations/github-${id}.json`] =
      JSON.stringify(portable, null, 2) + "\n";
  }
  scanWorkspacePublication(files);
  return files;
}

function githubRepositoryFromRemote(url) {
  const value = String(url || "").trim();
  const match = value.match(
    /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function configureWorkspaceRepository(store, input, github) {
  const root = fs.realpathSync(input.root),
    top = await git(root, ["rev-parse", "--show-toplevel"]);
  if (fs.realpathSync(top) !== root)
    fail("Workspace repository root must be the Git checkout root.");
  const config = {
    root,
    remote: input.remote || "origin",
    branch: input.branch || "avoozl-workspace",
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

async function remoteHead(config, { fetch = true } = {}) {
  if (fetch)
    await git(config.root, [
      "fetch",
      "--no-tags",
      config.remote,
      `+refs/heads/${config.branch}:refs/remotes/${config.remote}/${config.branch}`,
    ]).catch((error) => {
      if (!/couldn't find remote ref|not found/i.test(error.message))
        throw error;
    });
  return git(config.root, [
    "rev-parse",
    "--verify",
    `refs/remotes/${config.remote}/${config.branch}^{commit}`,
  ]).catch(() => "");
}

export async function publishWorkspaceRepository(store, input = {}) {
  const config = store.getMeta("workspaceRepository");
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
    await git(config.root, [
      "push",
      config.remote,
      `${commit}:refs/heads/${targetBranch}`,
    ]);
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

async function readRemoteFiles(config, commit) {
  const prefix = config.directory + "/",
    listed = await git(config.root, [
      "ls-tree",
      "-r",
      "--name-only",
      commit,
      "--",
      config.directory,
    ]),
    files = {};
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

async function readRemoteAgentInstructions(config, commit) {
  const entry = await git(config.root, ["ls-tree", commit, "--", "AGENTS.md"]);
  if (!entry) return "";
  if (!/^100(?:644|755) blob /.test(entry))
    fail("The planning repository AGENTS.md must be a regular file.");
  const text = await git(config.root, ["show", `${commit}:AGENTS.md`], {
    raw: true,
  });
  if (Buffer.byteLength(text) > 512 * 1024)
    fail("The planning repository AGENTS.md is too large.");
  return text;
}

function importedTask(value) {
  if (
    value?.schemaVersion !== 1 ||
    !/^[a-z][a-z0-9-]{2,80}$/.test(value.id || "") ||
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
    epic: value.epic || "inbox",
    track: value.track || "catalog",
    tags: value.tags || [],
    resources: value.resources || [],
    projectId: value.projectId || undefined,
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

function importedReport(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !/^report-[a-z0-9-]{4,80}$/.test(value.id || "") ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 160 ||
    !["overview", "tasks", "epics", "graph", "documents"].includes(
      value.view,
    ) ||
    !value.filters ||
    typeof value.filters !== "object" ||
    Array.isArray(value.filters)
  )
    fail("Invalid portable report record.");
  const filters = {};
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
    if (!Object.hasOwn(value.filters, key)) continue;
    const filter = value.filters[key];
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

function importedQueueAssociation(value, filename, commit, store, data) {
  const allowedKeys = new Set([
      "schemaVersion",
      "repository",
      "kind",
      "nodeId",
      "number",
      "bodyHash",
      "targetKind",
      "targetId",
      "confirmedBy",
      "confirmedAt",
      "source",
    ]),
    keys = value && typeof value === "object" ? Object.keys(value) : [],
    validRepository =
      typeof value?.repository === "string" &&
      /^[^/\s]+\/[^/\s]+$/.test(value.repository) &&
      value.repository.length <= 200,
    validNode =
      value?.nodeId === null ||
      (typeof value?.nodeId === "string" &&
        value.nodeId.length > 0 &&
        value.nodeId.length <= 300),
    validHash =
      value?.bodyHash === null ||
      (typeof value?.bodyHash === "string" &&
        /^[a-f0-9]{64}$/i.test(value.bodyHash)),
    validActor =
      value?.confirmedBy === null ||
      (typeof value?.confirmedBy === "string" &&
        value.confirmedBy.length > 0 &&
        value.confirmedBy.length <= 200),
    validTimestamp =
      typeof value?.confirmedAt === "string" &&
      value.confirmedAt.length <= 40 &&
      Number.isFinite(Date.parse(value.confirmedAt));
  if (
    value?.schemaVersion !== 1 ||
    keys.some((key) => !allowedKeys.has(key)) ||
    !validRepository ||
    !["issue", "pull-request"].includes(value.kind) ||
    !validNode ||
    !Number.isInteger(value.number) ||
    value.number < 1 ||
    !validHash ||
    !["task", "plan"].includes(value.targetKind) ||
    !/^[a-z][a-z0-9-]{2,80}$/.test(value.targetId || "") ||
    !validActor ||
    !validTimestamp ||
    value.source !== "operator-confirmed"
  )
    fail("Invalid portable Queue association record.");
  const id = queueAssociationId(value, value.targetKind, value.targetId),
    suffix = id.slice("github-queue-association:".length);
  if (filename !== `associations/github-${suffix}.json`)
    fail("Portable Queue association identity does not match its path.");
  const target =
    value.targetKind === "task"
      ? data.tasks.find((task) => task.id === value.targetId)
      : store.get("plans", value.targetId);
  if (!target || (value.targetKind === "plan" && target.deletedAt))
    fail("Portable Queue association target does not exist.");
  return {
    id,
    queueItemId: `github-queue:${value.repository}:${value.kind}:${value.nodeId || value.number}`,
    repository: value.repository,
    kind: value.kind,
    nodeId: value.nodeId,
    number: value.number,
    bodyHash: value.bodyHash,
    targetKind: value.targetKind,
    targetId: value.targetId,
    title: target.title,
    confirmedBy: value.confirmedBy || undefined,
    confirmedAt: value.confirmedAt,
    source: "operator-confirmed",
    portable: true,
    portableCommit: commit,
  };
}

export async function syncWorkspaceRepository(store) {
  const config = store.getMeta("workspaceRepository");
  if (!config) fail("Configure a workspace repository first.", 409);
  const commit = await remoteHead(config);
  if (!commit) fail("The workspace branch does not exist yet.", 404);
  const files = await readRemoteFiles(config, commit),
    agentsText = await readRemoteAgentInstructions(config, commit),
    manifest = JSON.parse(files["workspace.json"] || "{}");
  if (manifest.schemaVersion !== 1)
    fail("Unsupported portable workspace schema.");
  const previous = store.getMeta("workspaceImport") || { fileHashes: {} },
    hashes = Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, digest(text)]),
    ),
    conflicts = [];
  store.transaction(() => {
    const data = structuredClone(store.read());
    if (manifest.reports !== undefined) {
      if (!Array.isArray(manifest.reports))
        fail("Invalid portable reports collection.");
      data.savedSearches = manifest.reports.map(importedReport);
    }
    synchronizeAgentInstructions(data, agentsText, {
      path: "AGENTS.md",
      revision: commit,
    });
    for (const [name, text] of Object.entries(files)) {
      const design = name.match(/^designs\/([a-z][a-z0-9-]{2,80})\.md$/);
      if (!design) continue;
      const id = design[1],
        hash = digest(text),
        local = store.get("plans", id),
        last = previous.fileHashes[name];
      if (local && local.hash !== hash && last && local.hash !== last) {
        conflicts.push(name);
        continue;
      }
      const approvalText = files[`designs/${id}.approval.json`],
        approval = approvalText ? JSON.parse(approvalText) : null,
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
      const value = JSON.parse(text),
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
      for (const from of value.requires || [])
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
    for (const [name, text] of Object.entries(files)) {
      if (!name.startsWith("associations/")) continue;
      const next = importedQueueAssociation(
          JSON.parse(text),
          name,
          commit,
          store,
          data,
        ),
        local = store.get("github_queue_associations", next.id);
      if (
        local &&
        JSON.stringify(queueAssociationForPublication(local)) !==
          JSON.stringify(queueAssociationForPublication(next))
      ) {
        conflicts.push(name);
        continue;
      }
      store.put("github_queue_associations", next);
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
    store.setMeta("agentInstructionSourceSnapshot", {
      path: "AGENTS.md",
      hash: digest(agentsText),
      revision: commit,
      text: agentsText,
    });
  });
  store.event(null, "workspace.repository.synchronized", {
    commit,
    files: Object.keys(files).length,
  });
  return { commit, files: Object.keys(files), conflicts: [] };
}

export function workspaceRepositoryStatus(store) {
  return {
    configuration: store.getMeta("workspaceRepository"),
    publication: store.getMeta("workspacePublication"),
    import: store.getMeta("workspaceImport"),
  };
}

export async function publishPlanningPullRequest(store, github, { planId }) {
  const plan = store.get("plans", planId),
    config = store.getMeta("workspaceRepository");
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
  const head = `avoozl/design-${plan.id}-${plan.hash.slice(0, 10)}`;
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
    pull = await github.createPullRequest(config.repository, {
      title: plan.title,
      head,
      base: config.branch,
      body: `<!-- avoozl-planning-pr
${JSON.stringify({ version: 1, planId: plan.id, planHash: plan.hash, commit: publication.commit })}
-->
Requests team review of the exact Avoozl design revision \`${plan.hash}\`. Merging authorizes projection of its task issues.`,
    });
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
