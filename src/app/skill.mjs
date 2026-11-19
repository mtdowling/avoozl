import fs from "node:fs";
import path from "node:path";
import { workspaceConfig, applicationRoot } from "./config.mjs";
export function workflowSkill(config = workspaceConfig()) {
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command =
    "node " +
    quote(path.join(applicationRoot, "cli.mjs")) +
    " --workspace " +
    quote(config.workspaceRoot);
  const values = {
    PLANS_ROOT: config.workspaceRoot,
    BASE: config.endpoint,
    CLI: command,
    WORKSPACE_CLI: command,
    APP_ROOT: applicationRoot.replace(/\/$/, ""),
  };
  return fs
    .readFileSync(new URL("./skills/avoozl/SKILL.md", import.meta.url), "utf8")
    .replace(
      /\{\{(PLANS_ROOT|BASE|CLI|WORKSPACE_CLI|APP_ROOT)\}\}/g,
      (_, key) => values[key],
    );
}
