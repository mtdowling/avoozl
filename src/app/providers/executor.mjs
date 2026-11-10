import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodexAdapter, CODEX_CAPABILITIES } from "./codex.mjs";
import { ClaudeAdapter, claudeModels, CLAUDE_CAPABILITIES } from "./claude.mjs";
import {
  OpenHandsAdapter,
  openHandsProviderInfo,
  OPENHANDS_CAPABILITIES,
} from "./openhands.mjs";

const exec = promisify(execFile);

export function providerRegistry(factories = {}) {
  const specs = new Map([
    [
      "codex",
      {
        id: "codex",
        label: "Codex",
        capabilities: CODEX_CAPABILITIES,
        create: factories.codex || ((options) => new CodexAdapter(options)),
        async inspect() {
          const version = (
            await exec("codex", ["--version"], { timeout: 5000 })
          ).stdout.trim();
          return {
            id: "codex",
            label: "Codex",
            available: true,
            version,
            capabilities: CODEX_CAPABILITIES,
            authentication: "Checked when starting a session",
          };
        },
      },
    ],
    [
      "claude",
      {
        id: "claude",
        label: "Claude",
        capabilities: CLAUDE_CAPABILITIES,
        create: factories.claude || ((options) => new ClaudeAdapter(options)),
        async inspect() {
          const sdk = await import("@anthropic-ai/claude-agent-sdk");
          return {
            id: "claude",
            label: "Claude",
            available: true,
            version: sdk.version || null,
            capabilities: CLAUDE_CAPABILITIES,
            authentication: "Checked when starting a session",
          };
        },
      },
    ],
    [
      "openhands",
      {
        id: "openhands",
        label: "OpenHands",
        capabilities: OPENHANDS_CAPABILITIES,
        create:
          factories.openhands || ((options) => new OpenHandsAdapter(options)),
        inspect: openHandsProviderInfo,
      },
    ],
  ]);
  for (const [id, create] of Object.entries(factories))
    if (!specs.has(id))
      specs.set(id, {
        id,
        label: id,
        capabilities: {},
        create,
        async inspect() {
          return { id, label: id, available: true, capabilities: {} };
        },
      });
  return specs;
}

export async function providerModels(spec, createOptions = {}) {
  if (spec.id === "claude" && !createOptions.query) {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    return claudeModels({ query: sdk.query });
  }
  const adapter = spec.create({
    emit: () => {},
    onRequest: () => {},
    ...createOptions,
  });
  try {
    const models = await adapter.start({
      cwd: process.cwd(),
      catalogOnly: true,
    });
    if (!Array.isArray(models))
      throw Error("This provider connection does not expose a model catalog.");
    return models;
  } finally {
    await adapter.close();
  }
}
