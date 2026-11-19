// The Onboard flow's reads (Settings > Repository setup > Set up GitHub and import specs). Adding a
// repository walks: pick the folder, pick the mode, check GitHub, set up
// GitHub, import specs, pick approvers, leak scan, finish. Every write in
// that flow is an existing operation (repositories.configure,
// github.settings.update, github.setup with confirm, plan.create) or
// adoptRepository below; the rest of this module only reads, so a flow
// cancelled before Set up GitHub writes nothing.
import fs from "node:fs";
import path from "node:path";
import {
  PUBLISH_RULES,
  matchLine,
  specContentDiagnostics,
} from "../content/content-rules.mjs";
import { detectCheckout, git } from "../git/git.mjs";
import { approvalBase, approverCheck, gitTop } from "../git/git-approvals.mjs";
import { listSpecFolders } from "../specs/spec-plans.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { fail } from "../store/store.mjs";

const realpath = (value) => {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return value;
  }
};
export const sameFolder = (a, b) => realpath(a) === realpath(b);

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
                message: `${file} line ${index + 1} holds a ${hit.category === "secret" ? "secret" : "path on this computer"} (${hit.rule}). Remove it before the specs are approved.`,
              });
          });
      return { name, findings, missing: false };
    }),
  };
}

// The people who authored commits on the repository's main branch, most
// commits first, for the person to pick the approvers list from.
export async function commitAuthors(folder, { limit = 50 } = {}) {
  const root = await gitTop(folder);
  if (!root) fail("That folder is not a Git checkout.");
  const base = await approvalBase(root).catch(() => null),
    out = await git(root, [
      "log",
      "--format=%ae%x1f%an%x1f%aI",
      base?.head ?? "HEAD",
    ]).catch(() => ""),
    people = new Map();
  for (const row of out.split("\n").filter(Boolean)) {
    const [email, name, at] = row.split("\x1f"),
      key = email.toLowerCase();
    if (!key) continue;
    const entry = people.get(key) ?? { email, name, commits: 0, last: at };
    entry.commits += 1;
    people.set(key, entry);
  }
  return {
    items: [...people.values()]
      .sort((a, b) => b.commits - a.commits)
      .slice(0, limit),
  };
}

// Adopts the specs of a repository already added to the workspace, from git
// alone, with the same reader as `avoozl rebuild` (Operations.readFromGit):
// a spec an approver committed on main comes in approved, its [x] tasks done
// at the commit that ticked them, and landing trailers and retros are read
// back. `approvers` is the list the person confirmed; with none, specs come
// in as drafts. Returns the reader's result.
export async function adoptRepository(ops, { folder, specs, approvers }) {
  const emails = Array.isArray(approvers) ? approvers : null;
  if (!emails || emails.some((email) => typeof email !== "string"))
    fail("Confirm the approvers list: emails, or an empty list.");
  if (!Array.isArray(specs) || specs.some((name) => typeof name !== "string"))
    fail("Name the spec folders to adopt.");
  const root = await gitTop(folder);
  if (!root) fail("That folder is not a Git checkout.");
  if (
    !workspaceRepositories(ops.store).some(
      (entry) => entry.localCheckout && sameFolder(entry.localCheckout, root),
    )
  )
    fail("Add the repository to this workspace first.", 409);
  const here = new Set(listSpecFolders(root)),
    missing = specs.find((name) => !here.has(name));
  if (missing) fail(`${missing} is not a spec folder in ${root}.`);
  return ops.readFromGit({
    names: specs,
    root,
    allowed: approverCheck({ repository: { allowedActors: emails } }),
  });
}
