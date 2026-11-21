// A finished command's record for a fake command runner: exit code 0 with
// no output, unless `fields` say otherwise.
import type { CommandRecord } from "../git/git.ts";

export function commandRecord(
  argv: string[] = [],
  fields: Partial<CommandRecord> = {},
): CommandRecord {
  const at = new Date().toISOString();
  return {
    argv,
    startedAt: at,
    endedAt: at,
    exitCode: 0,
    stdout: "",
    stderr: "",
    ...fields,
  };
}
