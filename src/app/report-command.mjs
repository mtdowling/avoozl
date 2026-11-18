// The command a worker runs to reach Avoozl (worker-paths WP4.3): the Node
// binary and the CLI file of this running Avoozl, each quoted for a shell, so
// it needs nothing on the session's PATH. In a checkout it is `cli.mjs`; in
// the built app package, where this module sits under `bin/lib`, it is the
// bundled `cli.mjs` beside `src/`.
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../cli.mjs", import.meta.url));

// One word for a POSIX shell or, on Windows, for cmd.exe and PowerShell.
export const shellQuote = (text, platform = process.platform) =>
  platform === "win32"
    ? `"${String(text).replaceAll('"', '\\"')}"`
    : `'${String(text).replaceAll("'", `'\\''`)}'`;

export const cliCommand = () =>
  `${shellQuote(process.execPath)} ${shellQuote(CLI)}`;
