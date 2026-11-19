// One dispatch for both servers that run the Avoozl page's operations: the
// Kiro Crew app backend (app-backend.mjs) and `avoozl serve`. The caller
// authenticates and passes the principal claim; this module authorizes the
// operation, opens the workspace, and runs it. Each Kiro Crew reader in the
// context is optional: an operation that needs an absent one answers
// "Needs Kiro Crew" instead of throwing.
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.mjs";
import { Operations } from "./operations.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { CLIENT_OPERATIONS } from "./client.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import { workspaceConfig } from "./config.mjs";
import { machineAvoozlPaths, WorkspaceRegistry } from "./host-config.mjs";
import { initializeWorkspace } from "./workspace.mjs";
import { expandHome, listFolders } from "./folder-browse.mjs";
import {
  DEMO_WORKSPACE_ID,
  defaultDemoRoot,
  demoOperations,
  installDemo,
} from "./demo.mjs";

export const NEEDS_KIROCREW = "Needs Kiro Crew";
import { requiredReader } from "./needs-kirocrew.mjs";

// The page also runs the tick, reads its health, reads the Graph,
// Delivery and Conflicts views, edits the GitHub settings, and runs Set up GitHub. The cron and agents reach `workspace.tick`
// through the MCP server instead.
export const APP_OPERATIONS = new Set([
  ...CLIENT_OPERATIONS,
  "workspace.tick",
  "workspace.tick.health",
  "workspace.tick.log",
  "highlight.languages",
  "activity.recent",
  "activity.list",
  "task.evidence",
  "activity.settings.get",
  "activity.settings.update",
  "chat.context",
  "graph.view",
  "delivery.view",
  "landing.queue",
  "conflicts.view",
  "plan.review.get",
  "plan.review.decide",
  "panel.view",
  "remote.view",
  "untriaged.view",
  "specpr.view",
  "radar.crews",
  "review.drafts",
  "gate.list",
  "radar.flow",
  "radar.retro",
  "radar.retro.apply",
  "radar.mergepath",
  "radar.values",
  "radar.releasequeue",
  "epics.view",
  "radar.releasestep",
  "radar.armed",
  "integration.view",
  "landing.view",
  "gap.preview",
  "gap.accept",
  "integration.land",
  "radar.preflight",
  "radar.disarm",
  "conflictfix.decide",
  "radar.integrationbranch",
  "intake.list",
  "intake.view",
  "intake.sources",
  "intake.deliver",
  "intake.confirm",
  "intake.plan",
  "intake.source.add",
  "intake.source.remove",
  "flow.view",
  "untriaged.crews",
  "untriaged.handoff",
  "specpr.adopt",
  "specpr.reject",
  "specpr.requestChanges",
  "github.crewlabel.backfill",
  "review.chat",
  "untriaged.plan",
  "github.repository.labels",
  "task.detail",
  "task.summary.request",
  "task.files",
  "task.diff",
  "plan.spec.read",
  "plan.table",
  "epic.list",
  "epic.get",
  "plan.new",
  "github.repository.inspect",
  "task.change.preview",
  "plugins.list",
  "plugin.preview",
  "plugin.add",
  "plugin.approve",
  "plugin.disable",
  "plugin.remove",
  "plugin.update",
  "plugin.pack.preview",
  "plugin.pack.import",
  "route.cancel",
  "route.resubmit",
  "tracker.takeBack",
  // Owner actions the Conflicts and Delivery views offer.
  "content.rules",
  "content.allow",
  "content.show",
  "content.terms.get",
  "content.terms.update",
  "content.sets.update",
  "conflicts.settle",
  "delivery.retry",
  "verify.allow",
  "task.start",
  "flow.runAnyway",
  "flow.stop",
  "publiccrews.stop",
  "flow.resume",
  "gate.clear",
  "flow.settings.get",
  "models.settings.get",
  "models.settings.update",
  "flow.settings.update",
  "driver.status",
  "instance.view",
  "instance.rename",
  "driver.takeover.preview",
  "driver.settings.update",
  "driver.handoff",
  "driver.takeover",
  "driver.forceTakeover",
  "driver.away.decide",
  "providers.view",
  "provider.switch.preview",
  "provider.switch.dryRun",
  "provider.switch",
  "provider.health.clear",
  "providers.settings.update",
  "investigation.decide",
  "delivery.integrate",
  "delivery.settings.get",
  "delivery.settings.update",
  "flow.instructions.update",
  "flow.retro.decide",
  "flow.retro.start",
  "flow.retro.again",
  "flow.proposals",
  "prompt.override.revert",
  "prompt.override.rebase",
  "github.settings.get",
  "github.trigger.preview",
  "github.settings.validate",
  "github.settings.update",
  "github.setup",
  "github.setup.cancel",
  "radar.setup",
  "mirror.adopt",
  "mirror.create",
  "mirror.forward",
  "mirror.forward.review",
  "radar.signoff",
  "publiccrews.signoff",
  // The Onboard flow's reads; its writes are the operations above.
  "onboarding.inspect",
  "onboarding.scan",
  "plan.delete",
  "plan.delete.preview",
  "plan.archive",
  "plan.unarchive",
  // Send message on a `process` session (R98.2).
  "session.send",
  "session.open",
  "session.view",
  // Manual tasks, task links, and workflow templates (§4.16).
  "task.manual.complete",
  "task.manual.reopen",
  "task.notes.list",
  "task.notes.add",
  "task.notes.edit",
  "task.notes.remove",
  "template.list",
  "template.preview",
]);
// Machine-catalog operations, served by this backend rather than a workspace.
const MACHINE_OPERATIONS = new Map([
  ["workspaces.list", "observe"],
  ["workspaces.add", "write"],
  ["workspaces.init", "write"],
  // Off Avoozl's list (the CLI's `workspace remove`): its folder, database and
  // repositories stay. Stop turns it off first. Person-only: an app token or
  // agent tool is refused (principalAllows), and MCP has no route to either.
  ["workspaces.remove", "write"],
  ["workspaces.stop", "write"],
  // A person's edit of a workspace's name, folder, run limit, on/off and
  // default. Person-only, as above.
  ["workspaces.update", "write"],
  // The Add and Edit dialogs' folder picker: folders under home. It changes
  // nothing, but names folders on this computer, so only a person reads it.
  ["workspaces.browse", "person"],
  // Demo mode (§6.11): install the sample once and open it, or close it.
  ["demo.start", "write"],
  ["demo.exit", "write"],
  ["demo.status", "observe"],
  // What the Radar screens read in the open sample (demo-radar.mjs).
  ["demo.fixtures", "observe"],
]);

// Action-level authorization. The dashboard owner may call any app operation.
// App tokens and agent tools are authenticated but act for no person, so they
// may only observe; their writes go through the MCP server.
export function principalAllows(claim, operation) {
  const kind =
    MACHINE_OPERATIONS.get(operation) ||
    (APP_OPERATIONS.has(operation) ? classifyOperation(operation) : null);
  if (!kind) return false;
  if (claim.kind === "owner-session") return true;
  if (claim.kind === "app-token" || claim.kind === "agent-tool")
    return kind === "observe";
  return false;
}

export const offered = (operation) =>
  MACHINE_OPERATIONS.has(operation) || APP_OPERATIONS.has(operation);

function badRequest(message, status = 400) {
  const error = Error(message);
  error.status = status;
  return error;
}

function sameDirectory(a, b) {
  try {
    return fs.realpathSync.native(a) === fs.realpathSync.native(b);
  } catch {
    return false;
  }
}

// Workspace list, add, init, stop and remove over the machine catalog. Registry errors are
// path and identity validation for the owner's own input, so they return 400.
function machineOperation(registry, config, operation, input, home) {
  try {
    if (operation === "workspaces.browse") return listFolders(input.path, home);
    registry.reload();
    if (operation === "workspaces.list")
      return {
        defaultWorkspace: registry.config.defaultWorkspace || null,
        items: registry.list().map((workspace) => ({
          ...workspace,
          served: sameDirectory(workspace.root, config.workspaceRoot),
        })),
      };
    if (operation === "workspaces.remove" || operation === "workspaces.stop") {
      const id = String(input.id || "").trim();
      if (!registry.config.workspaces[id])
        throw badRequest(`Workspace ${id || "(none)"} is not registered.`, 404);
      return operation === "workspaces.remove"
        ? registry.remove(id)
        : registry.setEnabled(id, false);
    }
    if (operation === "workspaces.update") {
      const id = String(input.id || "").trim();
      if (!registry.config.workspaces[id])
        throw badRequest(`Workspace ${id || "(none)"} is not registered.`, 404);
      const change = {};
      if (input.name !== undefined) change.name = String(input.name);
      if (input.root !== undefined) change.root = expandHome(input.root, home);
      let result = registry.update(id, change);
      if (
        input.enabled !== undefined &&
        Boolean(input.enabled) !== result.enabled
      )
        result = registry.setEnabled(id, Boolean(input.enabled));
      if (input.default === true && registry.config.defaultWorkspace !== id)
        result = registry.setDefault(id);
      return result;
    }
    const id = String(input.id || "").trim(),
      root = expandHome(input.root, home),
      name = String(input.name || "").trim() || undefined;
    if (!path.isAbsolute(root))
      throw badRequest("Choose an absolute workspace directory.");
    if (registry.config.workspaces[id])
      throw badRequest(`Workspace ${id} is already registered.`, 409);
    if (operation === "workspaces.init") initializeWorkspace(root, { name });
    return registry.add(id, { root, name });
  } catch (error) {
    if (!Number.isInteger(error.status)) error.status = 400;
    throw error;
  }
}

// Operations that cannot run without one Kiro Crew reader, from the one
// table of what needs Kiro Crew (needs-kirocrew.mjs). `untriaged.crews` and
// `radar.crews` answer an absent reader with an unavailable view instead.
function missingReader(context, operation, input) {
  const needed = requiredReader(operation);
  // Only a full stop reaches Kiro Crew chats; a plain stop is Avoozl's own.
  if (
    !needed ||
    context[needed.reader] ||
    (operation === "flow.stop" && !input.full)
  )
    return null;
  return `${NEEDS_KIROCREW}: ${needed.what} works only inside Kiro Crew.`;
}

// Everything a dispatch needs, built once per server. `readers` holds the
// optional Kiro Crew readers by name (`notifier`, `crewReader`,
// `sessionsReader`, `sessionStopper`, ...); absent ones stay out.
export function commandContext({
  host,
  config,
  readers = {},
  registryOptions = {},
  demoRoot = defaultDemoRoot(),
  home,
  follow = () => {},
}) {
  // The open sample, or null. Only demo.start opens it; its requests name
  // DEMO_WORKSPACE_ID, which no catalog workspace can have.
  let demo = null,
    registry = null;
  const opened = new Map(),
    machine = () => (registry ||= new WorkspaceRegistry(registryOptions));
  const demoOperation = async (operation) => {
    if (operation === "demo.status")
      return { active: Boolean(demo), workspaceId: DEMO_WORKSPACE_ID };
    if (operation === "demo.fixtures") {
      if (!demo)
        throw badRequest(
          "The demo is not open. Start it again from Settings.",
          409,
        );
      return demo.fixtures();
    }
    if (operation === "demo.exit") {
      demo?.close();
      demo = null;
      return { active: false };
    }
    const installed = await installDemo(demoRoot);
    demo ||= demoOperations(installed.root);
    return {
      active: true,
      workspaceId: DEMO_WORKSPACE_ID,
      existing: installed.existing,
      at: installed.receipt?.at ?? null,
    };
  };
  // A request names a catalog workspace by ID, or uses the served workspace.
  // Only registered roots are opened; the caller never supplies a path here.
  const workspaceFor = (workspaceId) => {
    if (workspaceId === undefined || workspaceId === null) return config;
    if (typeof workspaceId !== "string")
      throw badRequest("Choose a workspace ID.");
    let root, name;
    try {
      machine().reload();
      ({ root, name } = machine().get(workspaceId));
    } catch (error) {
      throw badRequest(error.message, 404);
    }
    const found = workspaceConfig({
      workspace: root,
      env: { ...process.env, AVOOZL_WORKSPACE: root },
    });
    // The catalog's name is the one the workspace picker shows.
    return name ? { ...found, name } : found;
  };
  // One store and Operations per workspace root, opened on first use.
  const operations = (target) => {
    let entry = opened.get(target.dbPath);
    if (!entry) {
      const store = new Store(target.dbPath);
      if (!store.initialized()) {
        store.close();
        throw badRequest("Initialize this Avoozl workspace first.", 503);
      }
      entry = {
        store,
        ops: new Operations(store, {
          operator: target.operator,
          workspaceRoot: target.workspaceRoot,
          plansRoot: target.plansRoot,
          configDirectory: machineAvoozlPaths().configDirectory,
          notifier: readers.notifier ?? null,
          crewReader: readers.crewReader ?? null,
          sessionsReader: readers.sessionsReader ?? null,
          sessionStopper: readers.sessionStopper ?? null,
          kirocrewAbsent: host === "standalone",
          driver: { settingsFile: driverSettingsPath() },
          // No page request waits on GitHub or Kiro Crew.
          backgroundReads: true,
        }),
      };
      opened.set(target.dbPath, entry);
    }
    return entry;
  };
  return {
    host,
    config,
    home,
    readers,
    crewReader: readers.crewReader,
    sessionStopper: readers.sessionStopper,
    follow,
    machine,
    workspaceFor,
    operations,
    demoOperation,
    demoOpen: () => demo,
    close() {
      for (const { store } of opened.values()) store.close();
      demo?.close();
      registry?.close();
    },
  };
}

// Run one request for an authenticated principal. Returns `{ status, body }`
// and never throws: an error becomes its status and message.
export async function dispatchCommand({ claim, request, context }) {
  try {
    const {
      operation,
      input = {},
      expectedRevision,
      workspaceId,
    } = request || {};
    if (typeof operation !== "string" || !principalAllows(claim, operation))
      return {
        status: 403,
        body: {
          error: offered(operation)
            ? "This caller may not run that operation."
            : // A page newer than its backend sends operations this build
              // lacks; the installed app copies bin/lib as last built.
              `This Avoozl backend does not offer ${String(operation).slice(0, 80)}. The installed backend may be older than its page: run npm run build:kirocrew-app, then kirocrew app update avoozl.`,
        },
      };
    if (!input || typeof input !== "object" || Array.isArray(input))
      return { status: 400, body: { error: "Send input as a JSON object." } };
    if (operation.startsWith("demo."))
      return {
        status: 200,
        body: { result: await context.demoOperation(operation) },
      };
    if (workspaceId === DEMO_WORKSPACE_ID) {
      const demo = context.demoOpen();
      if (!demo)
        return {
          status: 409,
          body: {
            error: "The demo is not open. Start it again from Settings.",
          },
        };
      return {
        status: 200,
        body: {
          result: await demo.execute(operation, input, expectedRevision),
        },
      };
    }
    if (MACHINE_OPERATIONS.has(operation)) {
      const result = machineOperation(
        context.machine(),
        context.config,
        operation,
        input,
        context.home,
      );
      if (MACHINE_OPERATIONS.get(operation) === "write") context.follow();
      return { status: 200, body: { result } };
    }
    const needs = missingReader(context, operation, input);
    if (needs)
      return { status: 409, body: { error: needs, needsKiroCrew: true } };
    const { ops } = context.operations(context.workspaceFor(workspaceId));
    const result = await ops.execute(operation, input, expectedRevision);
    return {
      status: 200,
      body: {
        result:
          operation === "instance.view"
            ? { ...result, host: context.host }
            : result,
      },
    };
  } catch (error) {
    const status =
      Number.isInteger(error.status) && error.status >= 400
        ? error.status
        : 500;
    if (status === 500) console.error(error);
    return {
      status,
      body: {
        error: status === 500 ? "Avoozl backend error." : error.message,
        // A Demo mode preview: what the change would have done.
        ...(error.demo ? { demo: true } : {}),
        // A person's save a content rule blocked names its decisions, so the
        // page can offer Allow once inline (R61.18). IDs only.
        ...(status === 422 && Array.isArray(error.decisions)
          ? { decisions: error.decisions.map(String) }
          : {}),
      },
    };
  }
}
