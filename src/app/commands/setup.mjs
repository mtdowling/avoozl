// CLI commands of one kind: command, help lines and run.
import { workspaceConfig } from "../config.mjs";
import { WorkspaceRegistry } from "../host-config.mjs";
import { machineStatus } from "../machine-status.mjs";
import { workflowSkill } from "../skill.mjs";
import { workspaceStatus } from "../workspace-status.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { help } from "../command-help.mjs";

async function runSpecOffer({ options, positionals, localOrRequest, need }) {
  // The driver offers a task to a worker login and reserves the claims its
  // workers ask for (R90.4): each a person's own act at this machine.
  // `spec claims release SPEC TASK` and `spec claims status SPEC`.
  const sub =
      positionals[0] === "claims" &&
      ["release", "status"].includes(positionals[1])
        ? positionals.splice(1, 1)[0]
        : null,
    planId = need(positionals[1], `spec ${positionals[0]} SPEC ...`);
  console.log(
    JSON.stringify(
      await localOrRequest(
        sub ? `spec.claims.${sub}` : `spec.${positionals[0]}`,
        sub === "status"
          ? { planId }
          : sub === "release"
            ? {
                planId,
                task: need(
                  positionals[2],
                  "spec claims release SPEC TASK --claims OWNER/REPO",
                ),
                claims: need(options.claims, "--claims OWNER/REPO"),
              }
            : positionals[0] === "offer"
              ? {
                  planId,
                  task: need(
                    positionals[2],
                    "spec offer SPEC TASK --worker LOGIN --repository OWNER/REPO --branch B --commit SHA --base SHA",
                  ),
                  worker: need(options.worker, "--worker LOGIN"),
                  repository: need(
                    options.repository,
                    "--repository OWNER/REPO",
                  ),
                  branch: need(options.branch, "--branch B"),
                  commit: need(options.commit, "--commit SHA"),
                  base: need(options.base, "--base SHA"),
                }
              : {
                  planId,
                  claims: need(
                    options.claims,
                    "spec claims SPEC --claims OWNER/REPO --base BRANCH [--cap N]",
                  ),
                  base: need(options.base, "--base BRANCH"),
                  ...(options.cap ? { cap: Number(options.cap) } : {}),
                },
      ),
      null,
      2,
    ),
  );
}
export async function runWorkspace({
  options,
  positionals,
  command,
  requestedWorkspace,
  requestedFrom,
  config,
  input,
  machineStateDirectory,
}) {
  const action = command === "status" ? "status" : positionals[0] || "list";
  const registry = new WorkspaceRegistry({
    env: options.env || process.env,
    ...(options["host-config"] ? { configPath: options["host-config"] } : {}),
    ...(options.catalog ? { catalogPath: options.catalog } : {}),
  });
  const hostUrl =
    registry.config.url || `http://127.0.0.1:${registry.config.port || 9428}`;
  const live = async (pathname, { method = "GET", body } = {}) => {
    if (registry.config.port === 0 && !registry.config.url) return null;
    let response;
    try {
      response = await fetch(hostUrl + pathname, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      return null;
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok)
      throw Error(
        payload.error ||
          `The running Avoozl host rejected ${method} ${pathname}.`,
      );
    return Object.hasOwn(payload, "result") ? payload.result : payload;
  };
  try {
    let result;
    if (action === "list" || action === "status") {
      result = (await live("/api/workspaces")) || registry.describe();
      if (command === "status") {
        // A workspace named on the command line or in the environment is
        // reported first, whether or not this machine's catalog lists it.
        // A registered ID names its root in the catalog this command reads.
        const named =
            typeof requestedWorkspace === "string" ? requestedWorkspace : null,
          registered = named ? registry.config.workspaces[named] : null;
        result = {
          ...(named
            ? {
                workspace: workspaceStatus({
                  named,
                  from: requestedFrom,
                  config: registered
                    ? workspaceConfig({
                        ...options,
                        workspace: registered.root,
                      })
                    : config,
                  catalog: result,
                }),
              }
            : {}),
          ...result,
          machine: machineStatus({
            stateDirectory: machineStateDirectory(),
          }),
        };
      }
    } else if (action === "add") {
      const provided = input();
      const repositories =
        provided.repositories ||
        (options.repositories ? JSON.parse(options.repositories) : {});
      const id = options.id || positionals[1] || provided.id;
      const registration = {
        id,
        root: options.root || provided.root,
        name: options.name || provided.name,
        enabled:
          options.inactive === true
            ? false
            : provided.enabled === undefined
              ? true
              : provided.enabled,
        repositories,
      };
      result =
        (await live("/api/workspaces", {
          method: "POST",
          body: registration,
        })) || registry.add(id, registration);
    } else if (action === "adopt") {
      if (await live("/api/workspaces"))
        throw Error(
          "Workspace adoption is local-only. Stop the running Avoozl host before adopting an existing workspace.",
        );
      const provided = input(),
        id = options.id || positionals[1] || provided.id;
      result = registry.adopt(id, {
        root: options.root || provided.root,
        name: options.name || provided.name,
        enabled:
          options.inactive === true
            ? false
            : provided.enabled === undefined
              ? true
              : provided.enabled,
        repositories:
          provided.repositories ||
          (options.repositories ? JSON.parse(options.repositories) : {}),
      });
    } else if (
      ["remove", "start", "drain", "resume", "stop"].includes(action)
    ) {
      const id = options.id || positionals[1];
      result = await live(
        `/api/workspaces/${encodeURIComponent(id)}/lifecycle`,
        { method: "POST", body: { action } },
      );
      if (!result) {
        if (action === "remove") result = registry.remove(id);
        else if (action === "drain") result = registry.drain(id);
        else result = registry.setEnabled(id, action !== "stop");
      }
    } else if (action === "set-default") {
      const id = options.id || positionals[1];
      result =
        (await live("/api/workspaces/default", {
          method: "POST",
          body: { workspaceId: id },
        })) || registry.setDefault(id);
    } else if (action === "rebuild") result = registry.rebuild();
    else
      throw Error(
        "Choose workspace list, add, adopt, remove, start, drain, resume, stop, set-default, or rebuild.",
      );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    registry.close();
  }
}
function runTask({ command }) {
  throw Error(
    {
      task: "Choose task supersede.",
      checks: "Choose checks run.",
    }[command],
  );
}

export const commands = [
  {
    command: "init",
    help: [
      help(
        "setup",
        "init PATH [--name NAME] [--port 9428]",
        "Create an empty workspace",
        { usage: "init PATH", about: "Create an empty workspace" },
      ),
    ],
    run({ options, positionals }) {
      if (!positionals[0])
        throw Error("Choose a workspace directory: avoozl init PATH.");
      console.log(
        JSON.stringify(
          initializeWorkspace(positionals[0], {
            name: options.name,
            port: options.port,
            documents: options.documents,
            db: options.db,
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "seed",
    help: [
      help(
        "setup",
        "seed --workspace PATH [--example ID]",
        "Install an example once; with no ID, draft Recipe Box spec folders",
        {
          usage: "seed --workspace PATH",
          about: "Install the example pack (optional)",
        },
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      console.log(
        JSON.stringify(
          // No name installs the default pack (`examples` says which).
          await localOrRequest("workspace.seed", {
            example: options.example || positionals[0],
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "examples",
    help: [
      help(
        "setup",
        "examples --workspace PATH",
        "List available example packs",
      ),
    ],
    async run({ localOrRequest }) {
      console.log(
        JSON.stringify(await localOrRequest("workspace.examples"), null, 2),
      );
    },
  },
  { command: "spec offer", help: [], run: runSpecOffer },
  { command: "spec claims", help: [], run: runSpecOffer },
  {
    command: "workspace",
    help: [
      help(
        "setup",
        "workspace list",
        "The workspaces registered on this machine",
      ),
      help("setup", "workspace add ID --root PATH", ""),
      help(
        "setup",
        "workspace adopt ID --root PATH",
        "Adopt an existing stopped workspace in place",
      ),
      help(
        "setup",
        "workspace remove|start|drain|resume|stop|set-default ID",
        "",
      ),
      help(
        "setup",
        "workspace rebuild",
        "Rebuild the catalog from configuration",
      ),
    ],
    run: runWorkspace,
  },
  {
    command: "repository",
    help: [
      help(
        "setup",
        "repository configure ID --root PATH [--branch main] [--worktrees PATH] [--json CONFIG]",
        "",
      ),
    ],
    async run({ options, positionals, input, localOrRequest }) {
      const action = positionals[0],
        provided = input();
      if (action !== "configure") throw Error("Choose repository configure.");
      console.log(
        JSON.stringify(
          await localOrRequest("repository.configure", {
            ...provided,
            id: options.id || positionals[1] || provided.id,
            root: options.root || provided.root,
            baseBranch: options.branch || provided.baseBranch,
            worktreeRoot: options.worktrees || provided.worktreeRoot,
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "github",
    help: [
      help(
        "setup",
        "github configure OWNER/REPO --repo ID [--assignee LOGIN] [--allowed-actors LOGINS]",
        "",
      ),
      help(
        "setup",
        "github setup --mode plans-repo|single-repo [--planning-repository OWNER/REPO]\n[--repositories A,B] [--no-epic]",
        "Preview the GitHub setup; add --confirm --preview-hash HASH to apply",
      ),
      help(
        "deliver",
        "github sync [--repository OWNER/REPO]",
        "Import assigned ready issues",
      ),
      help(
        "inspect",
        "github status",
        "Show repository and machine registration",
      ),
    ],
    async run({ options, positionals, input, localOrRequest }) {
      const action = positionals[0] || "status";
      let operation, value;
      if (action === "status") {
        operation = "github.repositories";
        value = {};
      } else if (action === "sync") {
        operation = "github.sync";
        value = {
          repository: options.repository || positionals[1],
          autoStart: options["auto-start"],
        };
      } else if (action === "configure") {
        operation = "github.configure";
        value = {
          repository: options.repository || positionals[1],
          repositoryId: options.repo,
          assignee: options.assignee,
          label: options.label,
          managedLabel: options["managed-label"],
          provider: options.provider,
          model: options.model,
          autoStart: options["auto-start"],
          active: !options.inactive,
          minimumPermission: options.permission,
          allowedActors: options["allowed-actors"]
            ?.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        };
      } else if (action === "setup") {
        // Preview first; rerun with --confirm --preview-hash HASH to write.
        const list = (value) =>
          value
            ?.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
        const provided = input();
        operation = "github.setup";
        value = {
          ...provided,
          mode: options.mode ?? provided.mode,
          planningRepository:
            options["planning-repository"] ?? provided.planningRepository,
          repositories: list(options.repositories) ?? provided.repositories,
          epic: options["no-epic"] ? false : provided.epic,
          confirm: options.confirm ?? provided.confirm,
          previewHash: options["preview-hash"] ?? provided.previewHash,
        };
      } else throw Error("Choose github status, configure, sync, or setup.");
      console.log(
        JSON.stringify(await localOrRequest(operation, value), null, 2),
      );
    },
  },
  {
    command: "mirror",
    help: [
      help(
        "setup",
        "mirror adopt|create OWNER/MIRROR --source OWNER/REPO [--ticked IDS]",
        "Dry run of the mirror setup; add --confirm --preview-hash HASH to apply",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Preview first; rerun with --confirm --preview-hash HASH to apply.
      const action = positionals[0];
      if (action !== "adopt" && action !== "create")
        throw Error("Choose mirror adopt or mirror create.");
      console.log(
        JSON.stringify(
          await localOrRequest(`mirror.${action}`, {
            repository: need(
              options.repository || positionals[1],
              `mirror ${action} OWNER/MIRROR --source OWNER/REPO`,
            ),
            source: options.source,
            confirm: options.confirm,
            previewHash: options["preview-hash"],
            ticked: options.ticked
              ?.split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "setup",
    help: [
      help(
        "setup",
        "setup OWNER/REPO --repo ID --checks NAME[,NAME] [--base BRANCH]\n[--methods merge,squash,rebase] [--landing pr|direct|off] [--yes]",
        "Preview repository setup for landing; --checks names the required GitHub checks, not the repository's own checks; --yes applies it",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Preview by default; --yes applies (R89.1). Not `github setup`.
      const list = (value) =>
        value
          ?.split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      console.log(
        JSON.stringify(
          await localOrRequest("repository.setup", {
            repository: need(
              positionals[0],
              "setup OWNER/REPO --repo ID --checks NAME[,NAME] [--base BRANCH] [--methods merge,squash,rebase] [--landing pr|direct|off] [--yes]",
            ),
            repositoryId: options.repo,
            base: options.base,
            checks: list(options.checks),
            methods: list(options.methods),
            landing: options.landing,
            confirm: Boolean(options.yes),
          }),
          null,
          2,
        ),
      );
    },
  },
  {
    command: "workspace-repo",
    help: [
      help(
        "setup",
        "workspace-repo configure PATH [--branch avoozl-workspace] [--directory .avoozl]",
        "",
      ),
      help(
        "setup",
        "workspace-repo publish [--dry-run]",
        "Safely publish portable planning state",
      ),
      help(
        "setup",
        "workspace-repo sync",
        "Hydrate from the configured private repo",
      ),
      help(
        "setup",
        "workspace-repo status",
        "Show portable repository revisions",
      ),
    ],
    async run({ options, positionals, localOrRequest }) {
      const action = positionals[0] || "status";
      let operation, value;
      if (action === "status") {
        operation = "workspace.repository.status";
        value = {};
      } else if (action === "configure") {
        operation = "workspace.repository.configure";
        value = {
          root: options.root || positionals[1],
          remote: options.remote,
          branch: options.branch,
          directory: options.directory,
        };
      } else if (action === "publish") {
        operation = "workspace.repository.publish";
        value = {
          dryRun: options["dry-run"],
          message: options.message,
        };
      } else if (action === "sync") {
        operation = "workspace.repository.sync";
        value = {};
      } else
        throw Error(
          "Choose workspace-repo status, configure, publish, or sync.",
        );
      console.log(
        JSON.stringify(await localOrRequest(operation, value), null, 2),
      );
    },
  },
  {
    command: "plugins",
    help: [
      help(
        "setup",
        "plugins [list]",
        "Declared plugins, their approval and health",
      ),
      help(
        "setup",
        "plugins add ID --path DIR|--package NAME|--git URL --ref REF [--subdir DIR] [--contract 1] [--config JSON] [--repository [--confirm-public]]",
        "",
      ),
      help(
        "setup",
        "plugins update ID",
        "Resolve a git plugin's ref again and fetch that commit",
      ),
      help(
        "setup",
        "plugins approve ID --hash HASH [--commit SHA]",
        "Approve the exact version, hash and commit `plugins list` shows",
      ),
      help(
        "setup",
        "plugins disable|enable|remove ID",
        "Stop, restart, or remove a plugin; its tasks park as needs you",
      ),
      help(
        "setup",
        "plugins pack-preview ID [--github OWNER/REPO]",
        "What importing a plugin's pack would create, change, or keep",
      ),
      help(
        "setup",
        "plugins pack-import ID --preview HASH [--github OWNER/REPO] [--accept-lowered] [--confirm-public]",
        "Import the exact preview",
      ),
    ],
    async run({ options, positionals, localOrRequest, need }) {
      // Settings' plugin actions at the command line (design §4.8). Approval
      // names the hash `plugins list` showed, so a person approves what they saw.
      const [action = "list", id] = positionals,
        calls = {
          list: () => ["plugins.list", {}],
          approve: () => [
            "plugin.approve",
            {
              id,
              hash: options.hash,
              ...(options.commit ? { commit: options.commit } : {}),
            },
          ],
          // A git plugin: resolve its ref again and fetch that commit.
          update: () => ["plugin.update", { id }],
          disable: () => ["plugin.disable", { id, disabled: true }],
          enable: () => ["plugin.disable", { id, disabled: false }],
          remove: () => ["plugin.remove", { id }],
          // A pack: what importing it would change, then the import of that
          // exact preview (design §4.14).
          "pack-preview": () => [
            "plugin.pack.preview",
            {
              id,
              ...(options.github
                ? { repositories: [options.github].flat() }
                : {}),
            },
          ],
          "pack-import": () => [
            "plugin.pack.import",
            {
              id,
              previewHash: options.preview,
              ...(options.github
                ? { repositories: [options.github].flat() }
                : {}),
              acceptLowered: Boolean(options["accept-lowered"]),
              confirmPublic: Boolean(options["confirm-public"]),
            },
          ],
          add: () => [
            "plugin.add",
            {
              scope: options.repository ? "repository" : "machine",
              confirmPublic: Boolean(options["confirm-public"]),
              entry: {
                id,
                ...(options.package ? { package: options.package } : {}),
                ...(options.path ? { path: options.path } : {}),
                ...(options.git ? { git: options.git, ref: options.ref } : {}),
                ...(options.subdir ? { subdir: options.subdir } : {}),
                contract: Number(options.contract ?? 1),
                ...(options.config
                  ? { config: JSON.parse(options.config) }
                  : {}),
              },
            },
          ],
        };
      if (!calls[action])
        throw Error(
          "Choose plugins list, add, update, approve, disable, enable, remove, pack-preview, or pack-import.",
        );
      if (action !== "list") need(id, `plugins ${action} ID ...`);
      console.log(
        JSON.stringify(await localOrRequest(...calls[action]()), null, 2),
      );
    },
  },
  {
    command: "skill",
    help: [
      help(
        "setup",
        "skill --workspace PATH",
        "Print the portable workflow skill",
      ),
    ],
    run({ config }) {
      process.stdout.write(workflowSkill(config));
    },
  },
  { command: "task", help: [], run: runTask },
  { command: "checks", help: [], run: runTask },
];
