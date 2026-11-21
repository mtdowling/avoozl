// A CLI command's context for a test that runs one command's `run`: the
// fields it names, and every other one refusing to be used.
import type { CommandContext } from "../cli/command-help.ts";

const unused = (name: string) => () => {
  throw Error(`This test gives the command no ${name}.`);
};

export function commandContext(
  fields: Partial<Omit<CommandContext, "localOrRequest">> & {
    // What each operation the command asks for answers.
    answer?: (name: string, input: Record<string, unknown>) => unknown;
  },
): CommandContext {
  const { answer = unused("operations"), ...rest } = fields;
  return {
    options: {},
    positionals: [],
    command: "",
    env: {},
    requestedWorkspace: undefined,
    requestedFrom: undefined,
    config: { workspaceRoot: "" },
    dbPath: undefined,
    endpoint: undefined,
    requireDatabase: unused("database"),
    requireLocalMaintenancePath: unused("maintenance path"),
    input: () => ({}),
    localOperations: unused("local operations"),
    // The command names the answer's shape; the test's fake gives it.
    localOrRequest: async <T>(name: string, input = {}) =>
      (await answer(name, input)) as T,
    machineStateDirectory: unused("state directory"),
    need: (value, usage) => {
      if (typeof value !== "string") throw Error(usage);
      return value;
    },
    helpPointer: (command) => `avoozl help ${command}`,
    ...rest,
  };
}
