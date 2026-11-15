// The Proposals operations (design §4.18, Requirement 68): what the Flow
// tab's Proposals view reads, and the person-only acts on prompt overrides.
// Operations routes each name here; every write is a person's, and
// sessions, MCP, the app token and plugins get 403. The lessons store and
// its operations were removed (RC30.4).
import { fail } from "./store.mjs";
import { listOr } from "./flow.mjs";
import { currentPrompts, overridesFile, retroMemory } from "./retro-memory.mjs";
import { rebasePrompt, revertPrompt, shippedPrompts } from "./prompts.mjs";

export const RETRO_READS = new Set(["flow.proposals"]);
export const RETRO_WRITES = new Set([
  "prompt.override.revert",
  "prompt.override.rebase",
]);

const memory = (store) => {
  const m = retroMemory(store);
  if (!m) fail("This Avoozl process has no settings folder for prompts.", 409);
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
    // The removed lessons store's export (RC30.5): its count, or why it
    // failed and the store stays.
    lessonsExport: retroMemory(store)?.lessonsExport ?? null,
  };
}

export async function retroOperation(
  store,
  name,
  input = {},
  context = {},
  { by = "dashboard", now = Date.now() } = {},
) {
  if (name === "flow.proposals") return proposalsView(store);
  const m = memory(store);
  if (
    RETRO_WRITES.has(name) &&
    (context.caller || context.mcp || context.plugin)
  )
    fail("Only a person changes prompt overrides, in the Avoozl page.", 403);
  const at = new Date(now).toISOString();
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
  fail("Unknown operation " + name, 404);
}
