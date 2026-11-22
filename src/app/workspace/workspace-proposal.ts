import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { WorkspaceRegistry } from "../settings/host-config.ts";
import { workspaceConfig } from "../settings/config.ts";
import { RepositorySettings } from "../settings/repository-settings.ts";
import { Operations } from "../api/operations.ts";
import { Store } from "../store/store.ts";
import { repositoryConfig } from "../git/git.ts";
import { initializeWorkspace } from "./workspace.ts";

const PROPOSAL_ID = /^[a-z][a-z0-9-]{2,80}$/,
  WORKSPACE_ID = /^[a-z][a-z0-9-]{0,60}$/,
  REPOSITORY_ID = /^[a-z][a-z0-9-]{1,60}$/,
  PROPOSAL_KEYS = new Set([
    "version",
    "proposalId",
    "requestedBy",
    "summary",
    "workspace",
    "repositories",
  ]),
  WORKSPACE_KEYS = new Set(["id", "name", "root", "action", "initializeGit"]),
  REPOSITORY_KEYS = new Set([
    "id",
    "name",
    "root",
    "access",
    "baseBranch",
    "planning",
  ]);

type Json = Record<string, unknown>;

export interface ProposedWorkspaceRepository {
  id: string;
  name?: string;
  root: string;
  access: "write" | "read";
  baseBranch: string;
  planning: boolean;
}

export interface WorkspaceProvisionProposal {
  version: 1;
  proposalId: string;
  requestedBy: string;
  summary?: string;
  workspace: {
    id: string;
    name: string;
    root: string;
    action: "create" | "add";
    initializeGit: boolean;
  };
  repositories: ProposedWorkspaceRepository[];
}

export interface WorkspaceProposalRecord {
  id: string;
  status: "pending" | "applied" | "dismissed";
  proposal: WorkspaceProvisionProposal;
  submittedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

const record = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function onlyKeys(value: Json, allowed: Set<string>, where: string) {
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) throw Error(`${where} has an unknown field: ${extra}.`);
}

function text(
  value: unknown,
  label: string,
  { maximum = 160 }: { maximum?: number } = {},
) {
  if (typeof value !== "string" || !value.trim())
    throw Error(`${label} is required.`);
  const checked = value.trim();
  if (checked.length > maximum)
    throw Error(`${label} must be ${maximum} characters or fewer.`);
  return checked;
}

function absolute(value: unknown, label: string) {
  const checked = text(value, label, { maximum: 4096 });
  if (!path.isAbsolute(checked))
    throw Error(`${label} must be an absolute path.`);
  return path.resolve(checked);
}

export function validateWorkspaceProvisionProposal(
  value: unknown,
): WorkspaceProvisionProposal {
  if (!record(value))
    throw Error("A workspace proposal must contain a JSON object.");
  onlyKeys(value, PROPOSAL_KEYS, "Workspace proposal");
  if (value.version !== 1) throw Error("Workspace proposal version must be 1.");
  const proposalId = text(value.proposalId, "Proposal ID", { maximum: 81 });
  if (!PROPOSAL_ID.test(proposalId))
    throw Error(
      "Proposal IDs must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.",
    );
  const requestedBy = text(value.requestedBy, "Requested by");
  const summary =
    value.summary === undefined
      ? undefined
      : text(value.summary, "Summary", { maximum: 1000 });

  if (!record(value.workspace))
    throw Error("Workspace proposal workspace must contain a JSON object.");
  onlyKeys(value.workspace, WORKSPACE_KEYS, "Workspace");
  const id = text(value.workspace.id, "Workspace ID", { maximum: 61 });
  if (!WORKSPACE_ID.test(id))
    throw Error(
      "Workspace IDs must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.",
    );
  const name = text(value.workspace.name, "Workspace name");
  const root = absolute(value.workspace.root, "Workspace root");
  const action = value.workspace.action;
  if (action !== "create" && action !== "add")
    throw Error("Workspace action must be create or add.");
  if (
    value.workspace.initializeGit !== undefined &&
    typeof value.workspace.initializeGit !== "boolean"
  )
    throw Error("Workspace initializeGit must be true or false.");
  const initializeGit =
    action === "create" && value.workspace.initializeGit !== false;
  if (action === "add" && value.workspace.initializeGit === true)
    throw Error("An existing workspace cannot initialize Git.");

  if (
    value.repositories !== undefined &&
    (!Array.isArray(value.repositories) || value.repositories.length > 32)
  )
    throw Error("Workspace repositories must contain at most 32 entries.");
  const ids = new Set<string>(),
    roots = new Set<string>(),
    repositories = (value.repositories || []).map((repository, index) => {
      const where = `Repository ${index + 1}`;
      if (!record(repository))
        throw Error(`${where} must contain a JSON object.`);
      onlyKeys(repository, REPOSITORY_KEYS, where);
      const repositoryId = text(repository.id, `${where} ID`, { maximum: 61 });
      if (!REPOSITORY_ID.test(repositoryId))
        throw Error(
          `${where} ID must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.`,
        );
      if (ids.has(repositoryId))
        throw Error(`Repository ID ${repositoryId} is listed more than once.`);
      ids.add(repositoryId);
      const repositoryRoot = absolute(repository.root, `${where} root`);
      if (roots.has(repositoryRoot))
        throw Error(
          `Repository root ${repositoryRoot} is listed more than once.`,
        );
      roots.add(repositoryRoot);
      if (
        repository.access !== undefined &&
        repository.access !== "write" &&
        repository.access !== "read"
      )
        throw Error(`${where} access must be write or read.`);
      const access: "write" | "read" =
        repository.access === "read" ? "read" : "write";
      if (
        repository.planning !== undefined &&
        typeof repository.planning !== "boolean"
      )
        throw Error(`${where} planning must be true or false.`);
      return {
        id: repositoryId,
        ...(repository.name === undefined
          ? {}
          : { name: text(repository.name, `${where} name`) }),
        root: repositoryRoot,
        access,
        baseBranch:
          repository.baseBranch === undefined
            ? "main"
            : text(repository.baseBranch, `${where} base branch`),
        planning: repository.planning === true,
      };
    });

  return {
    version: 1,
    proposalId,
    requestedBy,
    ...(summary ? { summary } : {}),
    workspace: { id, name, root, action, initializeGit },
    repositories,
  };
}

function git(root: string, args: string[]) {
  return String(
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }),
  ).trim();
}

function validateRepository(repository: ProposedWorkspaceRepository) {
  if (!fs.existsSync(repository.root))
    throw Error(
      `Repository ${repository.id} does not exist: ${repository.root}`,
    );
  const stat = fs.lstatSync(repository.root);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw Error(
      `Repository ${repository.id} must be a real directory: ${repository.root}`,
    );
  let top: string;
  try {
    top = git(repository.root, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw Error(
      `Repository ${repository.id} is not a Git checkout: ${repository.root}`,
    );
  }
  if (fs.realpathSync.native(top) !== fs.realpathSync.native(repository.root))
    throw Error(
      `Repository ${repository.id} must name the checkout root: ${repository.root}`,
    );
}

function initializeControlRepository(root: string) {
  const dotGit = path.join(root, ".git");
  if (fs.existsSync(dotGit)) {
    try {
      git(root, ["rev-parse", "--verify", "HEAD"]);
      return;
    } catch {
      // An earlier attempt may have initialized Git but not made its first
      // commit. Finish only the files this operation owns.
    }
  } else git(root, ["init", "-q", "-b", "main"]);
  const ignore = path.join(root, ".gitignore");
  let ignored = "";
  try {
    const stat = fs.lstatSync(ignore);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw Error(`Workspace Git ignore must be a regular file: ${ignore}`);
    ignored = fs.readFileSync(ignore, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    !ignored
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(".avoozl/local/")
  ) {
    const separator = ignored && !ignored.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(
      ignore,
      `${separator}# Avoozl machine-local state\n.avoozl/local/\n`,
    );
  }
  git(root, ["add", ".avoozl.json", ".gitignore"]);
  git(root, [
    "-c",
    "user.name=Avoozl",
    "-c",
    "user.email=avoozl@localhost",
    "commit",
    "--only",
    "-m",
    "Initialize Avoozl workspace",
    "--",
    ".avoozl.json",
    ".gitignore",
  ]);
}

export async function applyWorkspaceProvisionProposal(
  registry: WorkspaceRegistry,
  proposal: WorkspaceProvisionProposal,
) {
  const { workspace, repositories } = proposal;
  for (const repository of repositories) {
    validateRepository(repository);
    await repositoryConfig({
      id: repository.id,
      root: repository.root,
      baseBranch: repository.baseBranch,
    });
  }

  let registered = registry.config.workspaces[workspace.id];
  if (registered && path.resolve(registered.root) !== workspace.root)
    throw Error(
      `Workspace ${workspace.id} is already registered at ${registered.root}.`,
    );
  if (!registered) {
    if (workspace.action === "create")
      initializeWorkspace(workspace.root, { name: workspace.name });
    registry.add(workspace.id, {
      root: workspace.root,
      name: workspace.name,
      repositories: Object.fromEntries(
        repositories
          .filter((repository) => repository.access === "write")
          .map((repository) => [repository.id, repository.root]),
      ),
    });
    registered = registry.config.workspaces[workspace.id];
  }

  const config = workspaceConfig({
      workspace: registered.root,
      env: { ...process.env, AVOOZL_WORKSPACE: registered.root },
    }),
    store = new Store(config.dbPath),
    settings = new RepositorySettings(store, {
      workspaceRoot: config.workspaceRoot,
    }),
    operations = new Operations(store, {
      configuration: settings,
      workspaceRoot: config.workspaceRoot,
      plansRoot: config.plansRoot,
      configDirectory: path.dirname(registry.configPath),
    });
  try {
    for (const repository of repositories)
      await operations.execute(
        "repositories.configure",
        {
          id: repository.id,
          ...(repository.name ? { name: repository.name } : {}),
          localCheckout: repository.root,
          baseBranch: repository.baseBranch,
          planning: repository.planning,
          editable: repository.access === "write",
        },
        undefined,
        { person: true },
      );
  } finally {
    store.close();
  }
  if (workspace.initializeGit) initializeControlRepository(workspace.root);
  registry.reload();
  return registry.get(workspace.id);
}
