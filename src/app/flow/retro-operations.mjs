// The Proposals operations (design §4.18, Requirement 68): what the Flow
// tab's Proposals view reads, and the person-only acts on prompt overrides.
// The entries below are registered with the other operations; every write is a person's, and
// sessions, MCP, the app token and plugins get 403.
import { fail } from "../store/store.mjs";
import { listOr } from "./flow.mjs";
import { currentPrompts, overridesFile, retroMemory } from "./retro-memory.mjs";
import {
  rebasePrompt,
  revertPrompt,
  shippedPrompts,
} from "../agents/prompts.mjs";
import { notOnMcp, person } from "../api/operation-policy.mjs";

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
  };
}

const overrides = {
  "prompt.override.revert": (store, input, m, by, at) =>
    revertPrompt(
      overridesFile(store),
      { target: input.target, by, at },
      m.shipped || shippedPrompts(),
    ),
  "prompt.override.rebase": (store, input, m, by, at) =>
    rebasePrompt(
      overridesFile(store),
      {
        target: input.target,
        section: input.section,
        hash: input.hash,
        by,
        at,
      },
      m.shipped || shippedPrompts(),
    ),
};

function overrideHandler({ name, input, context }) {
  const m = memory(this.store);
  if (context.caller || context.mcp || context.plugin)
    fail("Only a person changes prompt overrides, in the Avoozl page.", 403);
  return overrides[name](
    this.store,
    input,
    m,
    context.local ? "cli" : this.operator || "dashboard",
    new Date().toISOString(),
  );
}

export const entries = [
  {
    name: "flow.proposals",
    class: "observe",
    policy: notOnMcp(
      "The Flow tab's Proposals view; proposals are a person's to decide.",
    ),
    handler() {
      return proposalsView(this.store);
    },
  },
  ...Object.keys(overrides).map((name) => ({
    name,
    class: "execute",
    policy: person("Only a person changes prompt overrides."),
    handler: overrideHandler,
  })),
];
