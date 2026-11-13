// The Proposals and Lessons operations (design §4.18, Requirements 68-70):
// what the Flow tab's Proposals and Lessons views read, and the person-only
// acts on prompt overrides, lessons packs and lesson exports. Operations
// routes each name here; every write is a person's, and sessions, MCP, the
// app token and plugins get 403.
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { listOr } from "./flow.mjs";
import {
  exportPack,
  importPack,
  packChanged,
  packPreview,
  validateLessonsPack,
} from "./lessons.mjs";
import {
  contentBlocks,
  currentPrompts,
  knownNames,
  lessonText,
  overridesFile,
  readLessonsPack,
  retroMemory,
  workspaceId,
} from "./retro-memory.mjs";
import { rebasePrompt, revertPrompt, shippedPrompts } from "./prompts.mjs";
import { healNow } from "./flow-retro.mjs";
import {
  shareCandidates,
  shareLessons,
  sharePreview,
  shareTarget,
} from "./lessons-share.mjs";

export const RETRO_READS = new Set([
  "flow.proposals",
  "lessons.view",
  "plugin.lessons.preview",
]);
export const RETRO_WRITES = new Set([
  "lessons.share.preview",
  "lessons.share",
  "prompt.override.revert",
  "prompt.override.rebase",
  "plugin.lessons.import",
  "lessons.export",
]);

const memory = (store) => {
  const m = retroMemory(store);
  if (!m)
    fail(
      "This Avoozl process has no settings folder for prompts and lessons.",
      409,
    );
  return m;
};

// Each proposal of every retro, newest retro first, with the prompt
// versions in use and every override drift (R68.14, R70.5).
function proposalsView(store) {
  const retros = listOr(store, "flow_retros").sort((a, b) =>
      (a.startedAt || "") < (b.startedAt || "") ? 1 : -1,
    ),
    prompts = currentPrompts(store);
  return {
    proposals: retros.flatMap((r) =>
      (r.proposals || []).map((p) => ({ retro: r.id, ...p })),
    ),
    dropped: retros.flatMap((r) =>
      (r.dropped || []).map((d) => ({ retro: r.id, ...d })),
    ),
    prompts: Object.values(prompts).map((p) => ({
      target: p.target,
      version: p.version,
      shipped: p.shipped,
      active: p.active,
      versions: p.versions,
      sections: p.sections.map((s) => ({
        name: s.name,
        locked: s.locked,
        override: s.override,
        sha256: s.sha256,
      })),
      drift: p.drift,
    })),
    // Suggested changes for an external skill's owner (R68.11).
    notes: retros.flatMap((r) =>
      (r.proposals || [])
        .filter((p) => p.note)
        .map((p) => ({
          retro: r.id,
          proposal: p.id,
          target: p.target,
          ...p.note,
        })),
    ),
    available: Boolean(retroMemory(store)),
  };
}

const FILTERS = {
  stage: (l, v) => l.pattern?.stage === v,
  check: (l, v) => l.pattern?.check === v,
  outcome: (l, v) => l.outcome === v,
  state: (l, v) => l.state === v,
  source: (l, v, id) =>
    v === "this"
      ? l.source === id
      : v === "other"
        ? !l.readOnly && l.source !== id
        : v === "pack"
          ? l.readOnly
          : l.source === v,
};

// The Lessons view (R69.10, R70.7): every lesson this workspace may read,
// with confidence, last confirmed, state, stale reason and history.
function lessonsView(store, input = {}, share = null) {
  const m = retroMemory(store);
  if (!m) return { lessons: [], available: false };
  const id = workspaceId(store),
    candidates = shareCandidates(m.lessons, id),
    lessons = m.lessons
      .list()
      .filter((l) => l.source === id || l.shared !== false)
      .filter((l) =>
        Object.entries(FILTERS).every(
          ([key, test]) =>
            input[key] === undefined ||
            input[key] === "" ||
            test(l, input[key], id),
        ),
      )
      .map((l) => ({
        id: l.id,
        pattern: l.pattern,
        finding: l.finding,
        change: {
          type: l.change?.type ?? null,
          target: l.change?.target ?? null,
          summary: l.change?.summary ?? null,
        },
        outcome: l.outcome,
        evidence: l.evidence,
        confidence: l.confidence,
        confirmedAt: l.confirmedAt,
        state: l.state,
        staleReason: l.staleReason,
        source:
          l.source === id
            ? "this workspace"
            : l.readOnly
              ? l.source
              : "another workspace",
        readOnly: Boolean(l.readOnly),
        date: l.date,
        history: l.history || [],
        ...(candidates.some((c) => c.id === l.id)
          ? { candidate: candidates.find((c) => c.id === l.id) }
          : {}),
      }));
  return {
    lessons,
    available: true,
    // Share candidates best first (R69.11) and where Share writes (R69.14).
    candidates,
    share: share
      ? {
          mode: share.mode,
          repository: share.repository ?? null,
          file: share.file ?? null,
          off: share.off ?? null,
        }
      : null,
  };
}

function pluginFolder(m, id, { approved = false } = {}) {
  if (typeof id !== "string" || !id) fail("Name the plugin by its id.");
  const folder = (m.loadPluginFolders?.() || []).find((p) => p.id === id);
  if (!folder)
    fail(
      `Plugin ${id} is not declared, or has no folder on this machine.`,
      404,
    );
  if (!folder.provides?.includes("lessons"))
    fail(`Plugin ${id} provides no lessons pack.`, 409);
  if (approved && folder.state !== "approved")
    fail(
      `Approve plugin ${id} at this version before importing its lessons pack.`,
      409,
    );
  return folder;
}

export async function retroOperation(
  store,
  name,
  input = {},
  context = {},
  {
    by = "dashboard",
    now = Date.now(),
    config = {},
    github = null,
    policy = null,
    workspaceRoot = null,
  } = {},
) {
  const target = () => shareTarget(store, policy, workspaceRoot, input);
  if (name === "flow.proposals") return proposalsView(store);
  if (name === "lessons.view") {
    if (retroMemory(store)) healNow(store, config, { now });
    return lessonsView(store, input, target());
  }
  const m = memory(store);
  if (name === "plugin.lessons.preview") {
    const folder = pluginFolder(m, input.id),
      pack = readLessonsPack(store, folder);
    // A new pack version re-checks what was imported before (R70.6).
    packChanged(m.lessons, folder.id, pack, { now });
    return packPreview(m.lessons, folder.id, pack);
  }
  if (
    RETRO_WRITES.has(name) &&
    (context.caller || context.mcp || context.plugin)
  )
    fail(
      name === "lessons.export"
        ? "Only a person exports lessons, in the Avoozl page or the CLI."
        : name === "plugin.lessons.import"
          ? "Only a person imports a lessons pack, in Settings."
          : name.startsWith("lessons.share")
            ? "Only a person shares lessons, in the Lessons view."
            : "Only a person changes prompt overrides, in the Avoozl page.",
      403,
    );
  const at = new Date(now).toISOString();
  // Share chosen proven lessons (R69.12-R69.14): preview, then the exact
  // text after the content rules.
  if (name === "lessons.share.preview" || name === "lessons.share") {
    const where = target(),
      preview = await sharePreview(m.lessons, where, {
        workspaceId: workspaceId(store),
        ids: input.ids,
      }),
      blocks = [
        ...contentBlocks(
          store,
          "lesson",
          `share:${where.repository}`,
          preview.text,
        ),
        ...contentBlocks(
          store,
          "github",
          `share:${where.repository}`,
          preview.text,
        ),
      ];
    if (blocks.length)
      fail(
        `Content rules refused the share, nothing was written: ${[...new Set(blocks)].join("; ")}.`,
        422,
      );
    if (name === "lessons.share.preview") return preview;
    if (input.previewHash !== preview.hash)
      fail(
        "The lessons or the shared file changed since that preview. Preview again.",
        409,
      );
    return shareLessons(where, preview, { github, now });
  }
  if (name === "prompt.override.revert")
    return revertPrompt(
      overridesFile(store),
      { target: input.target, by, at },
      m.shipped || shippedPrompts(),
    );
  if (name === "prompt.override.rebase")
    return rebasePrompt(
      overridesFile(store),
      {
        target: input.target,
        section: input.section,
        hash: input.hash,
        by,
        at,
      },
      m.shipped || shippedPrompts(),
    );
  if (name === "plugin.lessons.import") {
    const folder = pluginFolder(m, input.id, { approved: true }),
      pack = readLessonsPack(store, folder),
      preview = packPreview(m.lessons, folder.id, pack);
    if (input.previewHash !== preview.hash)
      fail(
        `The pack changed since that preview. Preview ${folder.id} again.`,
        409,
      );
    return importPack(m.lessons, folder.id, pack, { by, now });
  }
  if (name === "lessons.export") {
    if (
      typeof input.path !== "string" ||
      !path.isAbsolute(input.path) ||
      !input.path.endsWith(".json")
    )
      fail("Choose an absolute path for the pack file, ending in .json.");
    // The raw store, for the driver handoff export (R69.15, R66.12).
    if (input.raw === true) {
      const raw = {
        version: 1,
        raw: true,
        lessons: m.lessons.list(),
        workspaces: m.lessons.getMeta("workspaces") || {},
      };
      if (fs.existsSync(input.path) && input.replace !== true)
        fail("That file exists. Choose another path, or confirm Replace.", 409);
      fs.mkdirSync(path.dirname(input.path), { recursive: true });
      fs.writeFileSync(input.path, JSON.stringify(raw, null, 2) + "\n", {
        mode: 0o600,
      });
      return { path: input.path, lessons: raw.lessons.length, raw: true };
    }
    const pack = exportPack(m.lessons, { workspaceId: workspaceId(store) }),
      blocks = pack.lessons.flatMap((l) =>
        contentBlocks(store, "lesson", `export:${l.id}`, lessonText(l)),
      );
    if (blocks.length)
      fail(
        `Content rules refused the export, nothing was written: ${[...new Set(blocks)].join("; ")}.`,
        422,
      );
    if (fs.existsSync(input.path) && input.replace !== true)
      fail("That file exists. Choose another path, or confirm Replace.", 409);
    fs.mkdirSync(path.dirname(input.path), { recursive: true });
    fs.writeFileSync(input.path, JSON.stringify(pack, null, 2) + "\n", {
      mode: 0o600,
    });
    return {
      path: input.path,
      lessons: pack.lessons.length,
      version: pack.version,
    };
  }
  fail("Unknown operation " + name, 404);
}
