// Share chosen proven lessons (design §4.18, R69.11-R69.15). A person picks
// share candidates in the Lessons view; Avoozl writes their summaries, in
// the lessons pack shape, to `.avoozl/lessons.json` on a new branch of the
// mode's repository and opens a pull request. The raw store (contexts,
// histories, workspace IDs) never leaves this machine this way.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./git.mjs";
import { fail } from "./store.mjs";
import { exportPack } from "./lessons.mjs";
import { sha256 } from "./prompts.mjs";

export const SHARE_FILE = path.join(".avoozl", "lessons.json");
const lower = (v) => String(v || "").toLowerCase();

// Record this workspace's traits, so fit can count the other workspaces a
// lesson would suit (R69.11).
export function recordTraits(lessons, workspaceId, traits) {
  const known = lessons.getMeta("workspaces") || {};
  if (JSON.stringify(known[workspaceId]) === JSON.stringify(traits)) return;
  lessons.setMeta("workspaces", { ...known, [workspaceId]: traits });
}

// This workspace's share candidates, best first, each with why (R69.11).
export function shareCandidates(lessons, workspaceId) {
  const others = Object.entries(lessons.getMeta("workspaces") || {}).filter(
    ([id]) => id !== workspaceId,
  );
  return lessons
    .list()
    .filter(
      (l) =>
        l.source === workspaceId &&
        !l.readOnly &&
        l.outcome === "kept" &&
        l.state === "ok",
    )
    .map((l) => {
      const traits = l.pattern?.traits || [],
        fit = others.filter(
          ([, theirs]) =>
            !traits.length || traits.some((t) => theirs.includes(t)),
        ).length,
        tasks = l.evidence?.tasks || 0;
      return {
        id: l.id,
        tasks,
        fit,
        confidence: l.confidence,
        why: `kept after PDCA, ${tasks} tasks of evidence, fits ${fit} other workspace${fit === 1 ? "" : "s"}, confidence ${l.confidence.toFixed(2)}`,
      };
    })
    .sort(
      (a, b) =>
        b.tasks - a.tasks || b.fit - a.fit || b.confidence - a.confidence,
    );
}

// Where Share writes in this mode (R69.14), or why it cannot.
export function shareTarget(store, policy, workspaceRoot, input = {}) {
  const mode = policy?.mode || "local";
  if (mode === "local")
    return {
      mode,
      off: "This workspace is Local only, so lessons share nowhere.",
    };
  const projects = store.list("projects").filter((p) => p.root),
    byRepository = (name) =>
      projects.find((p) => lower(p.repository) === lower(name));
  let repository, project;
  if (mode === "plans-repo") {
    repository = policy.planningRepository;
    project =
      byRepository(repository) ||
      projects.find((p) => p.planning) ||
      (workspaceRoot ? { id: "planning", root: workspaceRoot } : null);
  } else {
    const names = Object.keys(policy.repositories || {});
    repository =
      input.repository ||
      (names.length === 1 ? names[0] : null) ||
      projects.find((p) => p.repository)?.repository;
    if (!repository)
      return { mode, off: "Choose the code repository to share to." };
    project = byRepository(repository);
  }
  if (!project?.root)
    return {
      mode,
      repository,
      off: `${repository} has no local checkout on this computer.`,
    };
  return {
    mode,
    repository,
    root: project.root,
    base: project.baseBranch || "main",
    file: SHARE_FILE.split(path.sep).join("/"),
  };
}

async function baseFile(root, base) {
  for (const ref of [`origin/${base}`, base])
    try {
      return JSON.parse(
        await git(root, [
          "show",
          `${ref}:${SHARE_FILE.split(path.sep).join("/")}`,
        ]),
      );
    } catch {
      // Not on this ref; try the next.
    }
  return null;
}

// The exact text Share would write, and its hash (R69.12, R69.13).
export async function sharePreview(lessons, target, { workspaceId, ids }) {
  if (target.off) fail(target.off, 409);
  if (!Array.isArray(ids) || !ids.length || ids.length > 50)
    fail("Choose 1-50 lessons to share.");
  const allowed = new Set(
      shareCandidates(lessons, workspaceId).map((c) => c.id),
    ),
    refused = ids.filter((id) => !allowed.has(id));
  if (refused.length)
    fail(
      `Only kept, unmarked lessons from this workspace can be shared; not ${refused.join(", ")}.`,
      409,
    );
  const chosen = exportPack(lessons, { workspaceId }).lessons.filter((l) =>
      ids.map((id) => id.toLowerCase()).includes(l.id),
    ),
    existing = await baseFile(target.root, target.base),
    kept = (Array.isArray(existing?.lessons) ? existing.lessons : []).filter(
      (l) => !chosen.some((c) => c.id === l?.id),
    ),
    pack = {
      version: new Date().toISOString().slice(0, 10),
      lessons: [...kept, ...chosen].sort((a, b) => (a.id < b.id ? -1 : 1)),
    },
    text = JSON.stringify(pack, null, 2) + "\n";
  return {
    mode: target.mode,
    repository: target.repository,
    base: target.base,
    file: target.file,
    lessons: chosen.map((l) => l.id),
    text,
    hash: sha256(text),
  };
}

// Write the previewed text on a new branch, push it and open a pull
// request. Without GitHub the commit stays on the branch.
export async function shareLessons(
  target,
  preview,
  { github, now = Date.now() },
) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").slice(0, 15),
    branch = `avoozl/lessons-${stamp.toLowerCase()}`,
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-share-"));
  let commit, base;
  try {
    try {
      await git(target.root, ["fetch", "--quiet", "origin", target.base]);
      base = `origin/${target.base}`;
    } catch {
      base = target.base;
    }
    fs.rmSync(folder, { recursive: true, force: true });
    await git(target.root, [
      "worktree",
      "add",
      "--quiet",
      "-b",
      branch,
      folder,
      base,
    ]);
    fs.mkdirSync(path.join(folder, path.dirname(SHARE_FILE)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(folder, SHARE_FILE), preview.text);
    await git(folder, ["add", SHARE_FILE]);
    await git(folder, [
      "commit",
      "--quiet",
      "-m",
      `Share ${preview.lessons.length} retro lesson${preview.lessons.length === 1 ? "" : "s"}`,
    ]);
    commit = await git(folder, ["rev-parse", "HEAD"]);
  } finally {
    try {
      await git(target.root, ["worktree", "remove", "--force", folder]);
    } catch {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
  const result = {
    ...preview,
    branch,
    commit,
    pushed: false,
    pullRequest: null,
  };
  delete result.text;
  try {
    await git(target.root, [
      "push",
      "--quiet",
      "origin",
      `${branch}:${branch}`,
    ]);
    result.pushed = true;
  } catch (error) {
    return {
      ...result,
      reason: "the branch could not be pushed; the commit stays on it here",
    };
  }
  if (!github?.createPullRequest || !target.repository)
    return {
      ...result,
      reason: "GitHub cannot be reached; the branch is pushed",
    };
  try {
    const pull = await github.createPullRequest(target.repository, {
      title: result.title || "Share retro lessons",
      head: branch,
      base: target.base,
      body: `Shares ${preview.lessons.length} lesson${preview.lessons.length === 1 ? "" : "s"} a person chose from Avoozl's retros, as summaries in \`${preview.file}\`. Import it like a lessons pack.`,
    });
    result.pullRequest = { number: pull.number, url: pull.html_url };
  } catch (error) {
    result.reason = `GitHub refused the pull request: ${String(error.message).slice(0, 200)}`;
  }
  return result;
}
