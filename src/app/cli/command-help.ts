import type { Operations } from "../api/operations.ts";
import type { WorkspaceConfig } from "../settings/config.ts";
import type { Store } from "../store/store.ts";

// What cli.ts hands each command's `run`: the parsed command line and the
// helpers it builds.
export interface CommandContext {
  options: Record<string, string | true | undefined>;
  positionals: string[];
  command: string;
  env: NodeJS.ProcessEnv;
  requestedWorkspace: string | true | undefined;
  requestedFrom: string | undefined;
  // A configuration that did not load has only its root and configError.
  config: Partial<WorkspaceConfig> & {
    workspaceRoot: string;
    configError?: string;
  };
  dbPath: string | undefined;
  endpoint: string | undefined;
  requireDatabase: () => string;
  requireLocalMaintenancePath: (action: string) => void;
  input: () => Record<string, unknown>;
  localOperations: (store: Store) => Operations;
  // The result's shape depends on the operation: the caller names it.
  localOrRequest: <T = unknown>(
    operation: string,
    input?: Record<string, unknown>,
    expectedRevision?: number,
  ) => Promise<T>;
  machineStateDirectory: () => string;
  need: (value: string | true | undefined, usage: string) => string;
  helpPointer: (command: string) => string;
}

// One entry of a command table (cli-commands.ts).
export interface Command {
  command: string;
  help: HelpLine[];
  startsWithBadConfig?: boolean;
  run: (context: CommandContext) => unknown;
}

// One usage line of `avoozl help`: the group it is listed under, the usage,
// what it does, and (`first`) the shorter wording the overview shows.
export interface HelpLine {
  group: string;
  usage: string;
  about: string;
  first: { usage: string; about: string } | null;
}
export const help = (
  group: string,
  usage: string,
  about = "",
  first: HelpLine["first"] = null,
): HelpLine => ({
  group,
  usage,
  about,
  first,
});
