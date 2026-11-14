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

const MATERIALIZED = /^[^/\\]+--(.+)\.json$/;
const CHANGE_NOTE =
  "Changing the agent of an existing crew is unreliable: Issue Radar did not move the crew's slot. Create a new crew with agent avoozl-crew.";

// Whether Issue Radar's Agent list holds the crew agent, as one of three
// states: "present", "missing" or "not-verified".
// `list` is Radar's Agent list read through the grant; `files` are the file
// names in the installed agents folder (an app agent is materialized as
// `<app>--<name>.json`). The grant outranks files. With neither, the answer is
// "not-verified", never a guess. `crews` are {name, agent} as Radar shows them;
// one on another agent is not covered.
export function crewAgentCheck({ list, files, crews = [] } = {}) {
  const names = Array.isArray(list)
    ? list
    : Array.isArray(files)
      ? files.map((file) => MATERIALIZED.exec(String(file))?.[1] ?? null)
      : null;
  const state = !names
    ? "not-verified"
    : names.includes(CREW_AGENT)
      ? "present"
      : "missing";
  const rows = (Array.isArray(crews) ? crews : []).map((crew) => ({
    name: typeof crew?.name === "string" ? crew.name : null,
    agent: typeof crew?.agent === "string" ? crew.agent : null,
    covered: crew?.agent === CREW_AGENT,
  }));
  return {
    state,
    crews: rows,
    note: rows.some((row) => !row.covered) ? CHANGE_NOTE : null,
  };
}
