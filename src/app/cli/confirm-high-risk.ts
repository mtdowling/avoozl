// The CLI's confirm for high-risk GitHub steps (plugin-credentials PC13.6):
// the same lines the page's modal shows, then `Allow? [y/N]` on a terminal,
// or `--yes`. Without a terminal and without `--yes` it refuses.
import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

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

// Grant ids for the high-risk `steps`, or null when the answer was no.
export async function confirmHighRisk(
  steps: Step[] | null | undefined,
  {
    yes = false,
    localOrRequest,
    input = process.stdin,
    output = process.stderr,
  }: {
    yes?: unknown;
    localOrRequest: (
      operation: string,
      input: Record<string, unknown>,
    ) => Promise<unknown>;
    input?: Readable & { isTTY?: boolean };
    output?: Writable;
  },
) {
  const high = (steps || []).filter((step) => step.risk === "high");
  if (!high.length) return [];
  output.write(
    `These steps change GitHub with these permissions:\n${confirmText(high)}\n`,
  );
  if (!yes) {
    if (!input.isTTY)
      throw Error("These steps need a yes: run in a terminal, or add --yes.");
    const answer = await ask("Allow? [y/N] ", { input, output });
    if (!/^y(es)?$/i.test(String(answer).trim())) return null;
  }
  const { grants } = (await localOrRequest("github.job.confirm", {
    steps: high,
    confirm: true,
  })) as { grants: string[] };
  return grants;
}
