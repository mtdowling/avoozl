// integration.foreign (simplify §D21.1): a branch on origin named for a spec
// is that spec's integration branch, so its own commits must be the spec's
// work. Each first-parent commit past the default branch must be a merge of
// the default branch or a landing that names one of the spec's tasks, or a
// task of a spec it links. Reads the checkout's remote-tracking refs; with
// no origin, or no such branch, it finds nothing.
import { git } from "../git/git.mjs";

const TRAILER = /^Avoozl-Task:\s*([^@\s]+)@/gm;

const ref = (root, name) =>
  git(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/remotes/origin/${name}`,
  ]).catch(() => null);

// The commits on origin/<spec> that are not the spec's work: [{commit,
// subject}].
export async function foreignCommits(root, { spec, taskIds, defaultBranch }) {
  const [branch, base] = await Promise.all([
    ref(root, spec),
    ref(root, defaultBranch),
  ]);
  if (!branch || !base) return [];
  const log = await git(root, [
      "log",
      "--first-parent",
      "--format=%H%x00%P%x00%B%x1e",
      `${base}..${branch}`,
    ]),
    ids = new Set(taskIds),
    foreign = [];
  for (const entry of log.split("\x1e")) {
    const [commit, parents = "", body = ""] = entry.trim().split("\x00");
    if (!commit) continue;
    const [, merged] = parents.split(" ");
    if (merged) {
      const fromDefault = await git(root, [
        "merge-base",
        "--is-ancestor",
        merged,
        base,
      ]).then(
        () => true,
        () => false,
      );
      if (fromDefault) continue;
    }
    if ([...body.matchAll(TRAILER)].some((match) => ids.has(match[1])))
      continue;
    foreign.push({ commit, subject: body.split("\n")[0] });
  }
  return foreign;
}
