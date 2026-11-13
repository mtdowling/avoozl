// The Onboard flow's reads (Settings > Repositories > Onboard). Adding a
// repository walks: pick the folder, pick the mode, check GitHub, set up
// GitHub, import specs, leak scan, preview issues, finish. Every write in
// that flow is an existing operation (repositories.configure,
// github.settings.update, github.setup with confirm, plan.create); this
// module only reads, so a flow cancelled before Set up GitHub writes nothing.
import fs from "node:fs";
import path from "node:path";
import {
  PUBLISH_RULES,
  matchLine,
  specContentDiagnostics,
} from "./content-rules.mjs";
import { detectCheckout } from "./git.mjs";
import { listSpecFolders } from "./spec-plans.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { fail } from "./store.mjs";

const realpath = (value) => {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return value;
  }
};

// Step 1: what the folder already has. `registered` is the workspace entry
// for the same checkout or the same GitHub repository; `visibility` is
// GitHub's answer, or null when GitHub can't be read.
export async function inspectFolder({ store, github, folder }) {
  const found = await detectCheckout(folder),
    root = found.root,
    registered =
      workspaceRepositories(store).find(
        (entry) =>
          (entry.localCheckout &&
            realpath(entry.localCheckout) === realpath(root)) ||
          (found.github &&
            entry.github &&
            entry.github.toLowerCase() === found.github.toLowerCase()),
      ) || null;
  let visibility = null,
    githubError = null;
  if (found.github) {
    if (!github?.available?.()) githubError = "GitHub is not signed in.";
    else
      try {
        const remote = await github.repository(found.github);
        visibility = remote.private === false ? "public" : "private";
      } catch (error) {
        githubError = `GitHub could not be read: ${error.message}`;
      }
  }
  return {
    ...found,
    settingsFile: fs.existsSync(path.join(root, ".avoozl.json")),
    specs: listSpecFolders(root),
    registered: registered && {
      id: registered.id,
      localCheckout: registered.localCheckout,
      github: registered.github,
      baseBranch: registered.baseBranch,
      planning: registered.planning,
    },
    visibility,
    githubError,
  };
}

// Step 6: the leak scan of spec folders bound for a public repository. The
// workspace's content rules (as approval would apply them) plus the public
// rules for secrets and machine paths. A finding names the file, line, set
// and rule, never the matched text.
export function scanSpecs(store, readSpec, names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string"))
    fail("Name the spec folders to scan.");
  return {
    items: names.map((name) => {
      const spec = readSpec(name);
      if (!spec.exists) return { name, findings: [], missing: true };
      const findings = specContentDiagnostics(store, spec).map((d) => ({
        file: d.file,
        line: d.lineStart,
        set: d.set,
        rule: d.rule ?? null,
        message: d.message,
      }));
      for (const [file, text] of Object.entries(spec.files || {}))
        String(text)
          .split("\n")
          .forEach((line, index) => {
            for (const hit of matchLine(line, PUBLISH_RULES))
              findings.push({
                file,
                line: index + 1,
                set: "builtin:publish",
                rule: hit.rule,
                message: `${file} line ${index + 1} holds a ${hit.category === "secret" ? "secret" : "path on this computer"} (${hit.rule}). Remove it before the repository's issues show it.`,
              });
          });
      return { name, findings, missing: false };
    }),
  };
}
