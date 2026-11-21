// The CLI's confirm for high-risk GitHub steps (plugin-credentials PC13.6):
// the same lines the page's modal shows, then `Allow? [y/N]` on a terminal,
// or `--yes`. Without a terminal and without `--yes` it refuses. `--yes` is
// a person's flag: refused inside an agent session (the markers of PC6.7).
import readline from "node:readline";
import type { Readable, Writable } from "node:stream";
import { agentSession } from "../mcp/mcp-policy.ts";

interface Step {
  action: string;
  target: string;
  job: string;
  permissionsText: string;
  risk?: string;
}

const confirmText = (steps: Step[]) =>
  steps
    .map(
      (step) =>
        `  ${step.action} on ${step.target}\n    ${step.job} asks GitHub for ${step.permissionsText}`,
    )
    .join("\n");

async function ask(
  question: string,
  { input, output }: { input: Readable; output: Writable },
) {
  const lines = readline.createInterface({ input, output });
  try {
    return await new Promise<string>((resolve) =>
      lines.question(question, resolve),
    );
  } finally {
    lines.close();
  }
}

// `--yes` from an agent session is refused before anything is read.
export function refuseAgentYes(yes: unknown, env = process.env) {
  if (yes && (agentSession(env) || env.AVOOZL_CHILD))
    throw Error(
      "--yes is a person's answer; it is refused inside an agent session. Run it in your own terminal.",
    );
}

// Grant ids for the high-risk `steps`, or null when the person said no.
export async function confirmHighRisk(
  steps: Step[] | null | undefined,
  {
    yes = false,
    localOrRequest,
    env = process.env,
    input = process.stdin,
    output = process.stderr,
  }: {
    yes?: unknown;
    localOrRequest: (
      operation: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    env?: NodeJS.ProcessEnv;
    input?: Readable & { isTTY?: boolean };
    output?: Writable;
  },
) {
  const high = (steps || []).filter((step) => step.risk === "high");
  if (!high.length) return [];
  output.write(
    `These steps change GitHub with these permissions:\n${confirmText(high)}\n`,
  );
  refuseAgentYes(yes, env);
  if (!yes) {
    if (!input.isTTY)
      throw Error(
        "These steps need a person's yes: run in a terminal, or add --yes.",
      );
    const answer = await ask("Allow? [y/N] ", { input, output });
    if (!/^y(es)?$/i.test(String(answer).trim())) return null;
  }
  const { grants } = (await localOrRequest("github.job.confirm", {
    steps: high,
  })) as { grants: string[] };
  return grants;
}
