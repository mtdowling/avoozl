// The two setup buttons for a private mirror (RC27, design D32): Adopt what
// exists, Create what is missing. Both are one engine: a dry run that reads
// and lists every write, then an apply that takes the dry run's hash and only
// the ticked lines. Neither deletes or overwrites a repository, a branch, a
// label's text or a rule. Every write goes to the mirror, never to `source`.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ruleBranch, seenCheckNames } from "./github-branch-rules.mjs";
import { parseRepository } from "./github.mjs";
import { assertNoInstance } from "./instance.mjs";
import { mirrorInput } from "./mirror-policy.mjs";
import { labelsWanted, writeSetupStep } from "./radar-setup.mjs";
import { fail } from "./store.mjs";

const run = promisify(execFile);

// shortcut: the plans branch name is read from `mirror.plansBranch` once the
// setting exists (rc-24.1); until then every mirror uses this default.
export const PLANS_BRANCH_DEFAULT = "avoozl-plans";
const PERMISSION = {
  push: "Write access to the repository (Contents: write)",
  admin: "Administration on the repository (Repository administration: write)",
  create: "Permission to create repositories",
};
const lower = (value) => String(value).toLocaleLowerCase();
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
const missingRepo = (error) => error?.status === 404;

// The one place that copies a repository. Tests pass a fake; nothing else in
// the app calls it. A bare clone holds branches and tags only, so GitHub's
// hidden pull request refs are never pushed.
export const mirrorGit = {
  async pushMirror({ source, mirror }) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-seed-"));
    try {
      await run("git", [
        "clone",
        "--bare",
        `https://github.com/${source}.git`,
        directory,
      ]);
      await run("git", [
        "-C",
        directory,
        "push",
        "--mirror",
        `https://github.com/${mirror}.git`,
      ]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
};

// Reads GitHub and returns the lines in order. `world.stop` is set when no
// write may follow (the mirror is missing, exists for Create, is not private,
// or could not be read).
async function inspect(kind, deps, target) {
  const { github, entry } = deps,
    { mirror, source } = target,
    lines = [],
    add = (line) => lines.push({ ticked: line.status === "change", ...line });
  let remote = null;
  try {
    remote = await github.repository(parseRepository(mirror));
  } catch (error) {
    if (!missingRepo(error)) {
      add({
        id: "mirror",
        state: "differs",
        status: "error",
        detail: `${mirror} could not be read: ${error.message}`,
      });
      return { lines, stop: true };
    }
  }
  if (remote && kind === "create") {
    add({
      id: "mirror",
      state: "found",
      status: "refused",
      detail: `${mirror} already exists. Use Adopt existing setup.`,
    });
    return { lines, stop: true };
  }
  if (remote && remote.private !== true) {
    add({
      id: "mirror",
      state: "differs",
      status: "error",
      detail: `${mirror} is not private. Avoozl stops and deletes nothing. Make it private or remove it yourself.`,
    });
    return { lines, stop: true };
  }
  if (!remote && kind === "adopt") {
    add({
      id: "mirror",
      state: "missing",
      status: "error",
      detail: `${mirror} was not found. Use Create setup to build it.`,
    });
    return { lines, stop: true };
  }
  let branch = entry?.baseBranch ?? remote?.default_branch ?? null;
  if (!remote) {
    let origin = null;
    try {
      origin = await github.repository(parseRepository(source));
    } catch (error) {
      add({
        id: "mirror",
        state: "missing",
        status: "error",
        detail: `${source} could not be read: ${error.message}`,
      });
      return { lines, stop: true };
    }
    branch ??= origin.default_branch ?? "main";
    add({
      id: "mirror",
      state: "missing",
      status: "change",
      detail: `Create the private repository ${mirror}.`,
      permission: PERMISSION.create,
    });
    add({
      id: "seed",
      state: "missing",
      status: "change",
      detail: `Copy every branch and tag from ${source} into ${mirror} once.`,
    });
  } else {
    add({
      id: "mirror",
      state: "found",
      status: "ok",
      detail: `${mirror} exists and is private.`,
    });
  }
  const can = remote?.permissions ?? null,
    allowed = (level) =>
      !can ||
      can.admin === true ||
      (level === "push" && (can.maintain === true || can.push === true)),
    gate = (level, line) =>
      allowed(level)
        ? line
        : {
            ...line,
            status: "blocked",
            permission: PERMISSION[level],
            ticked: false,
          };

  // The plans branch: an orphan branch, no common history with the default.
  const plans = entry?.mirror?.plansBranch ?? PLANS_BRANCH_DEFAULT;
  let existing = null;
  if (remote)
    try {
      existing = await github.request(
        "GET",
        `/repos/${mirror}/branches/${encodeURIComponent(plans)}`,
      );
    } catch (error) {
      if (!missingRepo(error)) {
        add({
          id: "plans-branch",
          state: "differs",
          status: "error",
          detail: `Branch ${plans} could not be read: ${error.message}`,
        });
      }
    }
  if (!lines.some((line) => line.id === "plans-branch")) {
    if (!existing)
      add(
        gate("push", {
          id: "plans-branch",
          state: "missing",
          status: "change",
          detail: `Create the orphan branch ${plans}.`,
        }),
      );
    else {
      let orphan = false;
      try {
        await github.request(
          "GET",
          `/repos/${mirror}/compare/${encodeURIComponent(branch)}...${encodeURIComponent(plans)}`,
        );
      } catch (error) {
        orphan = missingRepo(error);
      }
      add(
        orphan
          ? {
              id: "plans-branch",
              state: "found",
              status: "ok",
              detail: `${plans} is an orphan branch.`,
            }
          : {
              id: "plans-branch",
              state: "differs",
              status: "error",
              detail: `${plans} shares history with ${branch}. Avoozl leaves it alone; pick another name.`,
            },
      );
    }
  }

  // Labels.
  const wanted = labelsWanted(entry ?? {}),
    have = remote
      ? new Set(
          ((await github.listLabels(parseRepository(mirror))) ?? []).map(
            (label) => lower(label.name),
          ),
        )
      : new Set(),
    absent = wanted.filter((label) => !have.has(lower(label.name)));
  add(
    absent.length
      ? gate("push", {
          id: "labels",
          state: "missing",
          status: "change",
          detail: `Create ${absent.map((l) => l.name).join(", ")}.`,
          write: { create: absent },
        })
      : {
          id: "labels",
          state: "found",
          status: "ok",
          detail: `${wanted.map((l) => l.name).join(", ")} exist.`,
        },
  );

  // The branch rule that requires CI. A rule another tool keeps is listed
  // but not ticked.
  const named = entry?.requiredChecks ?? [];
  if (!named.length)
    add({
      id: "branch-rule",
      state: "missing",
      status: "input",
      detail: `Name the CI check in ${mirror}'s requiredChecks setting.`,
    });
  else {
    let required = [];
    if (remote)
      try {
        branch = await ruleBranch(github, mirror, entry);
        required = (await seenCheckNames(github, mirror, branch)).required;
      } catch (error) {
        add({
          id: "branch-rule",
          state: "differs",
          status: "error",
          detail: `GitHub could not be read: ${error.message}`,
        });
      }
    if (!lines.some((line) => line.id === "branch-rule")) {
      const lacking = named.filter((name) => !required.includes(name));
      add(
        !lacking.length
          ? {
              id: "branch-rule",
              state: "found",
              status: "ok",
              detail: `${branch} requires ${named.join(", ")}.`,
            }
          : {
              ...gate("admin", {
                id: "branch-rule",
                state: required.length ? "differs" : "missing",
                status: "change",
                detail: required.length
                  ? `${branch} has a rule from another tool. Add ${lacking.join(", ")} beside it.`
                  : `${branch} requires ${lacking.join(", ")}.`,
                write: { branch, checks: lacking },
              }),
              ...(required.length ? { ticked: false } : {}),
            },
      );
    }
  }

  add(
    remote?.allow_auto_merge === true
      ? {
          id: "auto-merge",
          state: "found",
          status: "ok",
          detail: "The mirror allows auto-merge.",
        }
      : gate("admin", {
          id: "auto-merge",
          state: "missing",
          status: "change",
          detail: `Turn on "Allow auto-merge" in ${mirror}.`,
        }),
  );

  // The `mirror` setting itself.
  const desired = mirrorInput(
    { ...(entry?.mirror ?? {}), source, mirror },
    "mirror",
  );
  add(
    JSON.stringify(entry?.mirror ?? null) === JSON.stringify(desired)
      ? {
          id: "setting",
          state: "found",
          status: "ok",
          detail: "The mirror setting is saved.",
        }
      : {
          id: "setting",
          state: entry?.mirror ? "differs" : "missing",
          status: "change",
          detail: `Save the mirror setting (${source} to ${mirror}).`,
          write: { mirror: desired, baseBranch: branch },
        },
  );

  // The Radar values: read only. Entering them is the next screen.
  if (deps.radarValues) {
    let values = null;
    try {
      values = await deps.radarValues();
    } catch {
      values = null;
    }
    add({
      id: "radar-values",
      state: values ? "found" : "missing",
      status: "ok",
      detail: values
        ? "Issue Radar's values were read."
        : "Issue Radar's values were not read. Enter them on the Radar values screen.",
    });
  }
  return { lines, stop: false };
}

const shown = (line) => {
  const { write: _write, ...rest } = line;
  return rest;
};
const hashOf = (lines) =>
  digest(lines.map((l) => [l.id, l.state, l.status, l.write ?? null]));

function target(kind, deps, input) {
  if (!input.repository) fail("Name the mirror repository.", 400);
  parseRepository(input.repository);
  const source = input.source ?? deps.entry?.mirror?.source;
  if (!source)
    fail(`Name the public repository ${kind} reads from (source).`, 400);
  parseRepository(source);
  if (lower(source) === lower(input.repository))
    fail("The mirror must differ from its source.", 400);
  return { mirror: input.repository, source };
}

function blockedStatus(error) {
  return error?.status === 401 || error?.status === 403;
}

async function plansBranchWrite(github, mirror, name, identity) {
  const text = assertNoInstance(
      `Private plans for ${mirror}. This branch shares no history with the default branch.\n`,
      identity,
    ),
    message = assertNoInstance("Start the plans branch", identity),
    tree = await github.request("POST", `/repos/${mirror}/git/trees`, {
      body: {
        tree: [
          { path: "README.md", mode: "100644", type: "blob", content: text },
        ],
      },
    }),
    commit = await github.request("POST", `/repos/${mirror}/git/commits`, {
      body: { message, tree: tree.sha, parents: [] },
    });
  await github.request("POST", `/repos/${mirror}/git/refs`, {
    body: { ref: `refs/heads/${name}`, sha: commit.sha },
  });
}

async function perform(line, deps, { mirror, source }, plans) {
  const { github } = deps;
  if (line.id === "mirror") {
    const { login } = await github.currentUser(),
      { owner, repo } = parseRepository(mirror),
      body = {
        name: repo,
        private: true,
        description: `Private mirror of ${source}`,
        auto_init: false,
      };
    await github.request(
      "POST",
      lower(login) === lower(owner) ? "/user/repos" : `/orgs/${owner}/repos`,
      { body },
    );
    const made = await github.repository(parseRepository(mirror));
    if (made?.private !== true)
      return {
        stop: true,
        status: "error",
        detail: `${mirror} was made but does not read as private. Avoozl stopped and deleted nothing. Remove it yourself.`,
      };
  } else if (line.id === "seed") await deps.git.pushMirror({ source, mirror });
  else if (line.id === "plans-branch")
    await plansBranchWrite(github, mirror, plans, deps.identity);
  else if (line.id === "setting")
    await deps.saveSetting(mirror, line.write.mirror, line.write.baseBranch);
  else await writeSetupStep(github, mirror, line);
  return null;
}

// kind is "adopt" or "create". Without `confirm` it returns the dry run and
// writes nothing. With it: {confirm: true, previewHash, ticked?: [ids]}.
export async function mirrorSetup(kind, deps, input = {}) {
  const where = target(kind, deps, input),
    world = await inspect(kind, deps, where),
    previewHash = hashOf(world.lines),
    view = {
      kind,
      repository: where.mirror,
      source: where.source,
      previewHash,
      lines: world.lines.map(shown),
      writes: world.stop
        ? 0
        : world.lines.filter((l) => l.status === "change").length,
    };
  if (world.stop) view.lines.forEach((line) => (line.ticked = false));
  if (input.confirm !== true) return view;
  if (input.previewHash !== previewHash)
    return {
      ...view,
      refused: true,
      detail:
        "GitHub or the request changed since the dry run. Check it, then confirm again.",
    };
  const plans = deps.entry?.mirror?.plansBranch ?? PLANS_BRANCH_DEFAULT,
    ticked = new Set(
      input.ticked ??
        world.lines.filter((line) => line.ticked).map((line) => line.id),
    ),
    applied = [];
  if (!world.stop) {
    if (
      kind === "create" &&
      world.lines.some((l) => l.id === "mirror" && l.status === "change") &&
      !ticked.has("mirror")
    )
      applied.push({
        id: "mirror",
        status: "skipped",
        detail:
          "The repository line is not ticked, so nothing else was written.",
      });
    else
      for (const line of world.lines) {
        if (line.status === "blocked") {
          applied.push({
            id: line.id,
            status: "blocked",
            detail: `Nothing changed. ${line.permission} is needed.`,
          });
          continue;
        }
        if (line.status !== "change" || !ticked.has(line.id)) continue;
        let outcome = null;
        try {
          outcome = await perform(line, deps, where, plans);
        } catch (error) {
          outcome = {
            stop: kind === "create",
            status: blockedStatus(error) ? "blocked" : "error",
            detail: blockedStatus(error)
              ? `Nothing changed. ${line.permission ?? "More access"} is needed.`
              : error.message,
          };
        }
        applied.push(
          outcome
            ? { id: line.id, status: outcome.status, detail: outcome.detail }
            : { id: line.id, status: "done", detail: line.detail },
        );
        if (outcome?.stop) break;
      }
  }
  const after = await inspect(kind, deps, where).catch(() => world);
  return {
    ...view,
    previewHash: hashOf(after.lines),
    lines: after.lines.map(shown),
    writes: after.stop
      ? 0
      : after.lines.filter((l) => l.status === "change").length,
    applied,
    needsYou: applied.filter(
      (row) => !["done", "skipped"].includes(row.status),
    ),
    ...(kind === "create" &&
    applied.some((row) => row.id === "setting" && row.status === "done")
      ? { next: "radar-values" }
      : {}),
  };
}
