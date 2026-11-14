import fs from "node:fs";
import path from "node:path";

// The agent Avoozl ships for Issue Radar crews (kirocrew-app/agents).
export const CREW_AGENT = "avoozl-crew";
export const BUILD_COMMAND = "npm run build:kirocrew-app";

// An app folder that Kiro Crew can run: the build copies the CLI into bin/lib.
// Without it the MCP server and the cron fail at start, so refuse early and
// name the command that makes it.
export function appBuildCheck(appRoot) {
  const lib = path.join(appRoot, "bin", "lib");
  if (fs.existsSync(path.join(lib, "cli.mjs"))) return { ok: true };
  return {
    ok: false,
    command: BUILD_COMMAND,
    message: `The app has no bin/lib, so it was not built. Run \`${BUILD_COMMAND}\` in the Avoozl checkout, then install kirocrew-app again.`,
  };
}
