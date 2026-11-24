// Approvals live in git (design §4.42). An approval is a commit on the spec
// repository's main branch that changes the spec's files and carries
// evidence that an approver stands behind it (approverCheck): the approver
// merged its pull request, the approver's verified signature signs it, or the
// repository declares that branch protection lets only approvers in. It
// approves the spec as that commit's tree holds it: Avoozl hashes the files
// there itself. The commit message carries nothing, and the committer is not
// evidence, so a squash merge (committer GitHub) counts through its merger.
//
// Every commit is made with the checkout's own git identity. An agent's spec
// draft stays on a spec branch, and Approve squashes it onto main as the
// person clicking, so a draft reaches main only through an approval.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, remoteGit } from "./git.ts";
import { actorAllowed } from "../github/github-policy.ts";
import {
  isSpecFile,
  readSpecFolder,
  revisionFiles,
  specHash,
  specName,
} from "../specs/spec-plans.ts";
import { flatSpecPath, SPEC_NAME, specsPath } from "../specs/specs-path.ts";
import { fail } from "../store/store.ts";

const lower = (value: unknown) => String(value ?? "").toLowerCase();
const specPath = (root: string, spec: string) =>
  `${specsPath(root)}/${specName(spec)}`;

// What GitHub said about one commit (approverCheck's cache holds these).
export interface CommitEvidence {
  mergedBy: string | null;
  signer: string | null;
  pull?: number;
  pushedBy?: string | null;
}
// The GitHub reads approverCheck makes.
export interface ApprovalGitHub {
  available?: () => boolean;
  permission(
    repository: string,
    login: string,
  ): Promise<{ permission?: string } | null>;
  commitPullRequests(
    repository: string,
    commit: string,
  ): Promise<{ number: number; merged_at?: string | null }[] | null>;
  pullRequest(
    repository: string,
    number: number,
  ): Promise<{
    number?: number;
    merged?: boolean;
    merge_commit_sha?: string;
    merged_by?: { login?: string } | null;
  } | null>;
  commit(
    repository: string,
    commit: string,
  ): Promise<{
    commit?: { verification?: { verified?: boolean } };
    committer?: { login?: string } | null;
    author?: { login?: string } | null;
  } | null>;
}
export interface EvidenceCache {
  get(commit: string): CommitEvidence | undefined;
  set(commit: string, value: CommitEvidence): void;
}
// approverCheck's answer: (email, commit, login?) -> whether that author may
// approve, with the evidence each accepted commit used.
export type ApproverCheck = ((
  email: string,
  commit: string | null,
  login?: string | null,
) => Promise<boolean>) & { used: Map<string, string> };

// The checkout's top folder, or null when `dir` is not in a git work tree.
export async function gitTop(dir: string) {
  try {
    return await git(dir, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

// Who a commit made here now is authored by: git's own resolution of
// user.name and user.email (and GIT_AUTHOR_*).
export async function gitAuthor(root: string) {
  const ident = await git(root, ["var", "GIT_AUTHOR_IDENT"]).catch(() => "");
  const match = /^(.*?)\s*<([^>]*)>/.exec(ident);
  if (!match || !match[2])
    fail(
      "Approving makes a git commit as you, and git has no user.email here. Run `git config user.email you@example.com`, then approve again.",
      409,
    );
  return { name: match[1], email: match[2] };
}

// GitHub's private address for a login: 123+login@users.noreply.github.com
// or login@users.noreply.github.com.
export const noreplyLogin = (email: unknown) =>
  /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(
    String(email ?? ""),
  )?.[1] ?? null;

// Whether a commit's author may approve, as an async (email, commit, login)
// -> bool. Workflow rule 7.1 names the evidence. `used` maps each commit it
// accepted to the evidence: `merged_by`, `signature`, `branch-protection`
// or `local`.
//
// - `repository` is the repository's policy entry (allowedActors,
//   minimumPermission), or null when no GitHub policy names it.
// - `trust` "github" (the default) accepts a commit when GitHub says an
//   approver merged the pull request whose merge commit it is, or an
//   approver's GitHub-verified signature signs it. The author email proves
//   nothing, because anyone can write it.
// - `trust` "branch-protection" is the repository's declaration that branch
//   protection lets only approvers push to and merge into the specs branch.
//   It trusts the author: an email named in allowedActors, a GitHub address
//   for an approver's login, or the login GitHub reports for the commit.
// - A login is an approver when allowedActors names it, or, with a
//   minimumPermission, when it holds that permission.
// - `login`, when given, is who GitHub says is making the commit now (the
//   signed-in person clicking Approve), so no evidence is read.
// - `cache` (get, set) keeps what GitHub returned for each commit, so a
//   rebuild reads it back instead of asking again.
// - With no policy at all (a local workspace) the one approver is this
//   checkout's own git user.email, `localEmail`.
export function approverCheck({
  repository = null,
  localEmail = null,
  github = null,
  repositoryName = null,
  trust = "github",
  cache = null,
}: {
  repository?: {
    allowedActors?: string[];
    minimumPermission?: string | null;
  } | null;
  localEmail?: string | null;
  github?: ApprovalGitHub | null;
  repositoryName?: string | null;
  trust?: string;
  cache?: EvidenceCache | null;
}): ApproverCheck {
  const known = new Map<string, unknown>(),
    used = new Map<string, string>(),
    actors = (repository?.allowedActors || []).map(lower),
    askable = () => Boolean(github?.available?.() && repositoryName);
  // askable() holds only with a client and a repository name; a policy
  // entry exists whenever a login is checked.
  const gh = github as ApprovalGitHub,
    name = repositoryName as string,
    policy = repository as NonNullable<typeof repository>;
  const loginAllowed = async (login: string): Promise<boolean> => {
    const key = `login:${lower(login)}`;
    if (known.has(key)) return known.get(key) as boolean;
    let allowed = false;
    if (actors.includes(lower(login)) && !policy.minimumPermission)
      allowed = true;
    else if (askable())
      try {
        const held = policy.minimumPermission
          ? (await gh.permission(name, login))?.permission
          : null;
        allowed = actorAllowed(policy, login, held).allowed;
      } catch {
        allowed = false;
      }
    known.set(key, allowed);
    return allowed;
  };
  // What GitHub says about one commit: who merged the pull request whose
  // merge commit it is (and its number, for spec issue publishing), and who
  // signed it with a verified signature.
  const read = async (commit: string): Promise<CommitEvidence> => {
    let found = cache?.get(commit);
    if (found) return found;
    let mergedBy: string | null = null,
      number: number | null = null;
    for (const pull of (await gh.commitPullRequests(name, commit)) ?? [])
      if (pull.merged_at) {
        const full = await gh.pullRequest(name, pull.number);
        if (full?.merged && full.merge_commit_sha === commit) {
          mergedBy = full.merged_by?.login ?? null;
          number = full.number ?? pull.number;
          break;
        }
      }
    const data = await gh.commit(name, commit),
      signer = data?.commit?.verification?.verified
        ? (data.committer?.login ?? null)
        : null;
    found = {
      mergedBy,
      signer: signer === "web-flow" ? null : signer,
      ...(number ? { pull: number } : {}),
    };
    cache?.set(commit, found);
    return found;
  };
  const proven = async (commit: string | null) => {
    if (!commit || !askable()) return null;
    let found: CommitEvidence;
    try {
      found = await read(commit);
    } catch {
      return null;
    }
    const logins: [string, string | null | undefined][] = [
      ["merged_by", found.mergedBy],
      ["signature", found.signer],
      ["pushed", found.pushedBy],
    ];
    for (const [by, login] of logins)
      if (login && (await loginAllowed(login))) return by;
    return null;
  };
  const check = async (
    email: string,
    commit: string | null,
    login: string | null = null,
  ) => {
    const key = lower(email);
    if (!key && !login) return false;
    if (!repository) {
      const own = Boolean(localEmail) && key === lower(localEmail);
      if (own && commit) used.set(commit, "local");
      return own;
    }
    if (login) return loginAllowed(login);
    let by: string | null = null;
    if (trust === "github") by = await proven(commit);
    else if (key && actors.includes(key)) by = "branch-protection";
    else {
      const quick = noreplyLogin(email);
      let who = quick;
      if (!who && key && askable() && commit) {
        const cached = `email:${key}`;
        if (!known.has(cached))
          known.set(
            cached,
            await gh
              .commit(name, commit)
              .then((data) => data?.author?.login ?? null)
              .catch(() => null),
          );
        who = known.get(cached) as string | null;
      }
      if (who && (await loginAllowed(who))) by = "branch-protection";
    }
    if (by && commit) used.set(commit, by);
    return Boolean(by);
  };
  return Object.assign(check, { used });
}

// A JSON file as a (get, set) cache of what GitHub returned for each commit
// (approverCheck), so rebuilding a deleted database reads it back. Avoozl's
// own approval commit is recorded here with `pushedBy`, the signed-in person
// whose token pushed it.
export function evidenceCache(workspaceRoot: string): EvidenceCache {
  const file = path.join(workspaceRoot, ".avoozl", "approval-evidence.json");
  let data: Record<string, CommitEvidence> | null = null;
  const load = (): Record<string, CommitEvidence> => {
    if (!data)
      try {
        data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
          string,
          CommitEvidence
        >;
      } catch {
        data = {};
      }
    return data;
  };
  return {
    get: (commit) => load()[commit],
    set(commit, value) {
      load()[commit] = value;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
    },
  };
}

// The branch approvals land on and the commit it is at: `wanted` (the
// workspace's specs.branch) or origin's default branch, fetched, when the
// checkout has an origin; else that local branch or main, else the branch
// checked out. {branch, head, remote}.
export async function approvalBase(
  root: string,
  { branch: wanted = null }: { branch?: string | null } = {},
): Promise<{ branch: string; head: string | null; remote: string | null }> {
  const remote = await git(root, ["remote", "get-url", "origin"]).then(
    () => "origin",
    () => null,
  );
  let branch: string;
  if (remote) {
    branch =
      wanted ||
      (
        await git(root, [
          "symbolic-ref",
          "-q",
          "refs/remotes/origin/HEAD",
        ]).catch(() => "")
      ).replace(/^refs\/remotes\/origin\//, "") ||
      "main";
    await remoteGit(root, ["fetch", "--quiet", "origin", branch], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      branch,
      head: await git(root, ["rev-parse", "FETCH_HEAD"]),
      remote,
    };
  }
  for (const name of [wanted || "main", null]) {
    const ref = name
      ? `refs/heads/${name}`
      : await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(() => "");
    if (!ref) continue;
    const head = await git(root, ["rev-parse", "-q", "--verify", ref]).catch(
      () => "",
    );
    if (head)
      return { branch: ref.replace(/^refs\/heads\//, ""), head, remote };
  }
  // A checkout with no commit yet: the first commit is the approval.
  const unborn = await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(
    () => "",
  );
  if (unborn)
    return { branch: unborn.replace(/^refs\/heads\//, ""), head: null, remote };
  fail("The spec checkout has no branch to approve on.", 409);
}

// One commit on the base branch that sets each path to its text (null
// removes it), parented on the branch head, then pushed (never forced) and
// the local branch moved. `env` sets who authors it. Returns {commit,
// branch}, or null when the tree would not change.
//
// `replace` names folders whose spec files the commit replaces: one of them
// the new files leave out is removed.
async function commitOnMain(
  root: string,
  given: Record<string, string | null>,
  {
    message,
    env = {},
    replace = [],
    branch = null,
  }: {
    message: string;
    env?: NodeJS.ProcessEnv;
    replace?: string[];
    branch?: string | null;
  },
) {
  const files = { ...given };
  const base = await approvalBase(root, { branch }),
    index = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-main-")),
      "index",
    ),
    indexEnv = { ...process.env, GIT_INDEX_FILE: index };
  try {
    await git(
      root,
      base.head ? ["read-tree", base.head] : ["read-tree", "--empty"],
      { env: indexEnv },
    );
    for (const folder of replace) {
      const listed = await git(root, ["ls-files", "-z", "--", `${folder}/`], {
        env: indexEnv,
      });
      for (const target of listed.split("\0"))
        if (
          target &&
          !(target in files) &&
          isSpecFile(target.slice(folder.length + 1))
        )
          files[target] = null;
    }
    for (const [target, text] of Object.entries(files)) {
      if (typeof text !== "string") {
        await git(root, ["update-index", "--force-remove", "--", target], {
          env: indexEnv,
        });
        continue;
      }
      const blob = await gitInput(root, ["hash-object", "-w", "--stdin"], text);
      await git(
        root,
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${target}`],
        { env: indexEnv },
      );
    }
    const tree = await git(root, ["write-tree"], { env: indexEnv });
    if (
      base.head &&
      tree === (await git(root, ["rev-parse", `${base.head}^{tree}`]))
    )
      return null;
    const commit = await gitInput(
      root,
      ["commit-tree", tree, ...(base.head ? ["-p", base.head] : []), "-F", "-"],
      `${message}\n`,
      { ...process.env, ...env },
    );
    if (base.remote)
      await remoteGit(
        root,
        ["push", "--quiet", "origin", `${commit}:refs/heads/${base.branch}`],
        {
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          job: "spec-branch",
        },
      );
    await moveLocal(root, base.branch, commit, Object.keys(files));
    return { commit, branch: base.branch };
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

// The approval commit: each spec's files set to the reviewed revision,
// authored by the person git names here. This is the squash of a spec
// branch: drafts never reach main before it (design §4.42). Refuses when
// main already holds exactly this text, since git keeps no record of an
// empty commit under a path. Returns {commit, author, branch}.
export async function commitApproval(
  root: string,
  files: Record<string, Record<string, unknown>>,
  { message, branch = null }: { message?: string; branch?: string | null } = {},
) {
  const specs = Object.keys(files),
    author = await gitAuthor(root);
  const paths: Record<string, string | null> = {};
  for (const spec of specs) {
    const layout = readSpecFolder(root, spec),
      flat = flatSpecPath(root, spec);
    if (layout.flat) {
      const text = files[spec][`${spec}.md`];
      if (typeof text !== "string" || revisionFiles(files[spec]).length !== 1)
        fail(
          `Spec ${spec} changed layout since it was reviewed. Reload before approving.`,
          409,
        );
      paths[flat] = text;
      continue;
    }
    paths[flat] = null;
    for (const file of revisionFiles(files[spec])) {
      const text = files[spec][file];
      if (typeof text === "string")
        paths[`${specPath(root, spec)}/${file}`] = text;
    }
  }
  const made = await commitOnMain(root, paths, {
    replace: specs.map((spec) => specPath(root, spec)),
    branch,
    message:
      message ??
      (specs.length === 1
        ? `Approve spec ${specs[0]}`
        : `Approve ${specs.length} specs`),
  });
  if (!made)
    fail(
      `${specs.join(", ")} on main already holds this text, committed by someone who is not an approver. Edit it through a spec branch, then approve.`,
      409,
    );
  return { ...made, author };
}

// The local branch follows the approval when it only moves forward. A
// checked-out branch also has the spec paths of its index reset to the new
// commit; the files in the work tree are never touched.
async function moveLocal(
  root: string,
  branch: string,
  commit: string,
  paths: string[],
) {
  const ref = `refs/heads/${branch}`,
    old = await git(root, ["rev-parse", "-q", "--verify", ref]).catch(() => "");
  if (old) {
    const forward = await git(root, [
      "merge-base",
      "--is-ancestor",
      old,
      commit,
    ]).then(
      () => true,
      () => false,
    );
    if (!forward) return;
    await git(root, ["update-ref", ref, commit, old]);
  } else await git(root, ["update-ref", ref, commit, ""]);
  const current = await git(root, ["symbolic-ref", "-q", "HEAD"]).catch(
    () => "",
  );
  if (current === ref)
    await git(root, ["reset", "-q", "--", ...paths]).catch(() => {});
}

// `git args` with `text` on standard input; its trimmed output.
function gitInput(
  root: string,
  args: string[],
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd: root, env }, (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim()),
    );
    child.stdin?.end(text);
  });
}

// `git cat-file --batch` over `objects` (commit:path): path -> text, a
// missing object left out.
export function catFiles(
  root: string,
  objects: string[],
): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], { cwd: root }),
      chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(Error(`git cat-file exited ${code}`));
      const out = Buffer.concat(chunks),
        texts = new Map<string, string>();
      let at = 0;
      for (const object of objects) {
        const end = out.indexOf(10, at),
          header = out.subarray(at, end).toString();
        at = end + 1;
        if (/ missing$/.test(header)) continue;
        const size = Number(header.split(" ")[2]);
        texts.set(object, out.subarray(at, at + size).toString("utf8"));
        at += size + 1;
      }
      resolve(texts);
    });
    child.stdin.end(objects.map((o) => `${o}\n`).join(""));
  });
}

// Every approval commit on `ref`, newest first: one entry per spec a commit
// by an approver changed, with the spec's files and hash at that commit.
// `allowed(email, commit)` decides each author once per commit.
export interface ApprovalCommit {
  spec: string;
  commit: string;
  email: string;
  name: string;
  at: string;
  evidence: string | null;
  files: Record<string, string>;
  hash: string;
}

export async function approvalCommits(
  root: string,
  {
    allowed,
    ref = "HEAD",
    specs = null,
  }: {
    allowed: ((email: string, commit: string) => Promise<boolean>) & {
      used?: Map<string, string>;
    };
    ref?: string;
    specs?: string[] | null;
  },
): Promise<ApprovalCommit[]> {
  let log: string;
  try {
    // Each commit's changes are its diff against its first parent (rule 7):
    // a merged pull request's merge commit lists the spec files it brought.
    log = await git(root, [
      "log",
      "--first-parent",
      "--diff-merges=first-parent",
      "--no-renames",
      "--format=%x1e%H%x1f%ae%x1f%an%x1f%aI",
      "--name-only",
      ref,
      "--",
      ...(specs
        ? specs.flatMap((spec) => [
            specPath(root, spec),
            flatSpecPath(root, spec),
          ])
        : [specsPath(root)]),
    ]);
  } catch {
    return [];
  }
  const found: Omit<ApprovalCommit, "files" | "hash">[] = [],
    prefix = `${specsPath(root)}/`,
    // Every spec file name each spec's history touched. A file in a commit's
    // tree was added by a commit in this log, so these are all the names a
    // spec folder ever held.
    names = new Map<string, Set<string>>();
  for (const block of log.split("\x1e").filter((b) => b.trim())) {
    const [head, ...files] = block.split("\n"),
      [commit, email, name, at] = head.split("\x1f"),
      touched = new Set<string>();
    for (const file of files) {
      if (!file.startsWith(prefix)) continue;
      const [first, ...rest] = file.slice(prefix.length).split("/");
      const spec = rest.length
        ? first
        : first.endsWith(".md")
          ? first.slice(0, -3)
          : "";
      if (!SPEC_NAME.test(spec)) continue;
      if (specs && !specs.includes(spec)) continue;
      touched.add(spec);
      if (rest.length === 1 && isSpecFile(rest[0])) {
        if (!names.has(spec)) names.set(spec, new Set());
        names.get(spec)!.add(rest[0]);
      }
    }
    if (!touched.size || !(await allowed(email, commit))) continue;
    const evidence = allowed.used?.get(commit) ?? null;
    for (const spec of touched)
      found.push({ spec, commit, email, name, at, evidence });
  }
  const object = (commit: string, spec: string, file: string) =>
      `${commit}:${prefix}${spec}/${file}`,
    flatObject = (commit: string, spec: string) =>
      `${commit}:${prefix}${spec}.md`,
    objects = found.flatMap(({ spec, commit }) => [
      flatObject(commit, spec),
      ...[...(names.get(spec) ?? [])].map((file) => object(commit, spec, file)),
    ]),
    texts = objects.length ? await catFiles(root, objects) : new Map();
  return found
    .map((entry) => {
      const files: Record<string, string> = {};
      for (const file of names.get(entry.spec) ?? []) {
        const text = texts.get(object(entry.commit, entry.spec, file));
        if (text !== undefined) files[file] = text;
      }
      const flat = texts.get(flatObject(entry.commit, entry.spec));
      if (flat !== undefined) {
        if (Object.keys(files).length) return null;
        files[`${entry.spec}.md`] = flat;
      }
      return Object.keys(files).length
        ? { ...entry, files, hash: specHash(files, flat !== undefined) }
        : null;
    })
    .filter((entry): entry is ApprovalCommit => entry !== null);
}
