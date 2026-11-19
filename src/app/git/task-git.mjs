// Git on a task folder, from the host (vm-harness D6, VM5.2). A worker, and
// its box, can write the folder's top-level `.git` file, since the task
// folder is writable. A `.git` file that names a git directory the worker
// made, with `core.fsmonitor`, a hook, a filter or a signing program in its
// config, would run a command on the host at Avoozl's next `git add`. So
// every git command Avoozl runs in a task folder goes through taskGit, which
//
//   1. reads the `.git` file and refuses unless it names the git directory
//      git recorded when the folder was added: `{common}/worktrees/{name}`
//      of the repository's own checkout, whose `gitdir` file points back at
//      this folder (the checkout's git directory is outside every write root
//      and mounted read-only in a box);
//   2. runs `git --git-dir={gitdir} --work-tree={folder}`, so the file is not
//      read again;
//   3. adds `-c core.hooksPath={empty folder} -c core.fsmonitor=false`.
//
// The checkout itself (a folder whose `.git` is a directory) is run the same
// way, with its own git directory.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fail } from "../store/store.mjs";

const exec = promisify(execFile);
const real = (file) => fs.realpathSync.native(file);

let emptyHooks = null;
// One empty folder per process: no hook is found there.
export function emptyHooksFolder() {
  if (emptyHooks && fs.existsSync(emptyHooks)) return emptyHooks;
  const made = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-no-hooks-"));
  emptyHooks = made;
  process.once("exit", () => fs.rmSync(made, { recursive: true, force: true }));
  return made;
}
// The config every host git call on a task folder carries.
export const noHookConfig = () => [
  "-c",
  `core.hooksPath=${emptyHooksFolder()}`,
  "-c",
  "core.fsmonitor=false",
];

const commonDirs = new Map();
async function checkoutCommonDir(checkout) {
  const root = real(checkout);
  if (!commonDirs.has(root)) {
    const { stdout } = await exec(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: root },
    );
    commonDirs.set(root, real(stdout.trim()));
  }
  return commonDirs.get(root);
}

// The git directory of `folder`, checked against `checkout`'s own records,
// or a refusal naming why.
export async function taskGitDir(folder, checkout) {
  if (typeof checkout !== "string" || !checkout)
    fail(`Avoozl needs the repository checkout to run git in ${folder}.`);
  let root;
  try {
    root = real(folder);
  } catch {
    fail(`The task folder ${folder} does not exist.`, 409);
  }
  const common = await checkoutCommonDir(checkout),
    dotGit = path.join(root, ".git");
  let stat;
  try {
    stat = fs.lstatSync(dotGit);
  } catch {
    fail(`${folder} has no .git file.`, 409);
  }
  if (stat.isDirectory()) {
    // The checkout itself.
    if (root === real(checkout) && real(dotGit) === common) return common;
    fail(`${folder} holds a git directory Avoozl did not make.`, 409);
  }
  if (!stat.isFile())
    fail(
      `${folder}/.git is not a regular file, so Avoozl will not run git there.`,
      409,
    );
  const line = /^gitdir: (.+)\n?$/.exec(fs.readFileSync(dotGit, "utf8"));
  const named = line && path.resolve(root, line[1]);
  let gitDir = null;
  try {
    gitDir = named && real(named);
  } catch {}
  let pointsBack = false;
  try {
    const back = fs.readFileSync(path.join(gitDir, "gitdir"), "utf8").trim();
    pointsBack = real(path.dirname(path.resolve(back))) === root;
  } catch {}
  if (
    !gitDir ||
    path.dirname(gitDir) !== path.join(common, "worktrees") ||
    !pointsBack
  )
    fail(
      `${folder}/.git no longer names the git directory Avoozl made it with, so Avoozl will not run git there. Remove the task folder and start the task again.`,
      409,
    );
  return gitDir;
}

// Run git in a task folder (D6). `checkout` is the repository's own
// checkout, which names the folder's git directory.
export async function taskGit(folder, args, { checkout, env } = {}) {
  const gitDir = await taskGitDir(folder, checkout),
    root = real(folder);
  return (
    await exec(
      "git",
      [
        `--git-dir=${gitDir}`,
        `--work-tree=${root}`,
        ...noHookConfig(),
        ...args,
      ],
      {
        cwd: root,
        maxBuffer: 8 * 1024 * 1024,
        ...(env ? { env } : {}),
      },
    )
  ).stdout.trim();
}
