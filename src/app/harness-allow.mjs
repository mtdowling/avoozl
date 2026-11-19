// The per-repository command allow-list for unattended children (R94.4c,
// design §4.28). Repository config names its build and test commands
// (`sandbox.allowCommands`, each an argv list); they reach the harness's
// allow setting through `{repository_allow_commands}` so a child does not stall
// on a prompt. `git push` is never allowed, in any spelling or through any
// wrapper, and listing it is refused.
import path from "node:path";
import { fail } from "./store.mjs";
import { fillHarnessArgv } from "./harness-definitions.mjs";

// Programs that run another command given as arguments. Allowing one would
// allow anything, `git push` included.
const WRAPPERS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "cmd",
  "powershell",
  "pwsh",
  "env",
  "xargs",
  "exec",
  "nohup",
  "sudo",
  "doas",
  "time",
  "timeout",
  "nice",
  "command",
  "eval",
  "npx",
  "bunx",
  "pnpx",
  "busybox",
]);
const GIT = new Set(["git", "hub"]);
// Allow entries are prefixes in agent CLIs, so a token must be plain: no
// shell operators, quotes, globs or substitution.
const PLAIN = /^[A-Za-z0-9_.=:/@+,%-]+$/;

const program = (token) =>
  path
    .basename(token.replace(/\\/g, "/"))
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, "");

// shortcut: a listed repository script (`npm run x`, `make y`) that pushes on
// its own is not seen here; the sandbox (47.10) and Avoozl's own commit
// after exit are the real guard, as a child's git directory is out of reach.
// Why one argv list cannot be allowed, or null when it can.
export function allowCommandRefusal(command) {
  if (!Array.isArray(command) || !command.length)
    return "must be a nonempty argv list of strings";
  if (command.some((token) => typeof token !== "string" || !token))
    return "must hold only nonempty strings";
  const bad = command.find((token) => !PLAIN.test(token));
  if (bad !== undefined)
    return `holds ${JSON.stringify(bad)}; use plain words with no spaces, quotes or shell operators`;
  if (command.some((token) => /push/i.test(token)))
    return "pushes; git push is never allowed for an unattended child";
  const name = program(command[0]);
  if (WRAPPERS.has(name))
    return `runs ${command[0]}, which can run any command, git push included`;
  if (GIT.has(name)) {
    // A prefix with no fixed subcommand would cover `git push`; so would
    // config or alias options that rename one.
    const sub = command.slice(1).find((token) => !token.startsWith("-"));
    if (!sub) return "allows every git subcommand, git push included";
    if (
      command.some((token) => /^(-c|--config-env|--exec-path)/.test(token)) ||
      command.some((token) => /^alias\./i.test(token))
    )
      return "sets git config or aliases, which can reach git push";
  }
  return null;
}

// Validate a repository's `sandbox.allowCommands`.
export function sandboxAllowCommands(
  value,
  { source = "sandbox.allowCommands" } = {},
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${source} must be a list of argv lists.`);
  return value.map((command, index) => {
    const refusal = allowCommandRefusal(command);
    if (refusal) fail(`${source}[${index}] ${refusal}.`);
    return Object.freeze([...command]);
  });
}

// The harness's allow argv for one session: the definition's `allow`
// template with each repository command as one argument, words joined by a
// space. Checked again here so no path around the config check can pass a
// push through.
export function harnessAllow(definition, commands) {
  if (!definition.allow) return [];
  const allowed = sandboxAllowCommands(commands);
  return fillHarnessArgv(definition.allow, {
    repository_allow_commands: allowed.map((command) => command.join(" ")),
  });
}
