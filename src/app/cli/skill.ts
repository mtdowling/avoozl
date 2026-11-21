import fs from "node:fs";
import path from "node:path";
import { workspaceConfig, applicationRoot } from "../settings/config.ts";
export function workflowSkill(config = workspaceConfig()) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command =
    "node " +
    quote(path.join(applicationRoot, `cli${path.extname(import.meta.url)}`)) +
    " --workspace " +
    quote(config.workspaceRoot);
  const values: Record<string, string> = {
    PLANS_ROOT: config.workspaceRoot,
    CLI: command,
    WORKSPACE_CLI: command,
    APP_ROOT: applicationRoot.replace(/\/$/, ""),
  };
  return fs
    .readFileSync(new URL("../skills/avoozl/SKILL.md", import.meta.url), "utf8")
    .replace(
      /\{\{(PLANS_ROOT|CLI|WORKSPACE_CLI|APP_ROOT)\}\}/g,
      (_, key: string) => values[key]!,
    );
}
