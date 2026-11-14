// The git side of a forward (RC24.7, design D29.5): a scratch clone of the
// public repository, the merged change applied on its default branch, one
// commit by the approving person, and a normal push of one explicit refspec.
// Nothing here force pushes, and nothing pushes to the default branch.
//
// shortcut: the change is the diff of the merge commit against its first
// parent, so a rebase-merged mirror pull request forwards only its last
// commit. Upgrade when a mirror merges by rebase.
// shortcut: no live test; tests use local bare repositories through `urlFor`.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const github = (repo) => `https://github.com/${repo}.git`;

function exec(args, { cwd, env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      { cwd, env: { ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) =>
        error
          ? reject(Object.assign(error, { stdout, stderr }))
          : resolve({ stdout, stderr }),
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

// `run(args, options)` runs one git command; tests pass a recording wrapper.
export function forwardGit({ urlFor = github, run = exec } = {}) {
  const helper = (url, token) =>
    token && url.startsWith("https://")
      ? [
          "-c",
          "credential.helper=",
          "-c",
          `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
        ]
      : [];
  return {
    // Returns {dir, commit, added, paths}. Throws {conflict: true, paths} when
    // the change does not apply on the public base.
    async prepare({
      source,
      mirror,
      base,
      mergeSha,
      author,
      message,
      branch,
      date,
      token,
    }) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-forward-")),
        git = (args, options) => run(args, { cwd: dir, ...options });
      try {
        await git(["init", "-q"]);
        const sourceUrl = urlFor(source),
          mirrorUrl = urlFor(mirror);
        await git([
          ...helper(sourceUrl, token),
          "fetch",
          "-q",
          "--depth=1",
          sourceUrl,
          `refs/heads/${base}`,
        ]);
        await git(["checkout", "-q", "-b", branch, "FETCH_HEAD"]);
        await git([
          ...helper(mirrorUrl, token),
          "fetch",
          "-q",
          mirrorUrl,
          mergeSha,
        ]);
        const patch = (
          await git(["diff", "--binary", `${mergeSha}^1`, mergeSha])
        ).stdout;
        try {
          await git(["apply", "--index", "--3way"], { input: patch });
        } catch (error) {
          const unmerged = (
              await git(["diff", "--name-only", "--diff-filter=U"]).catch(
                () => ({ stdout: "" }),
              )
            ).stdout,
            failed = [
              ...String(error.stderr).matchAll(/patch failed: (.+?):\d+/g),
            ].map((m) => m[1]),
            paths = [
              ...new Set([...unmerged.split("\n"), ...failed].filter(Boolean)),
            ].sort();
          throw Object.assign(new Error("The change does not apply."), {
            conflict: true,
            paths,
          });
        }
        const stamp = { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
          identity = {
            ...stamp,
            GIT_AUTHOR_NAME: author.name,
            GIT_AUTHOR_EMAIL: author.email,
            GIT_COMMITTER_NAME: author.name,
            GIT_COMMITTER_EMAIL: author.email,
          };
        await git(["commit", "-q", "--no-verify", "-F", "-"], {
          env: identity,
          input: message,
        });
        const commit = (await git(["rev-parse", "HEAD"])).stdout.trim(),
          diff = (await git(["show", "--format=", "-U0", "HEAD"])).stdout,
          added = [];
        let file = "";
        for (const line of diff.split("\n")) {
          const name = /^\+\+\+ b\/(.*)$/.exec(line);
          if (name) file = name[1];
          else if (line.startsWith("+") && !line.startsWith("+++"))
            added.push({
              target: file,
              line: added.length + 1,
              text: line.slice(1),
            });
        }
        const paths = (
          await git(["show", "--format=", "--name-only", "HEAD"])
        ).stdout
          .split("\n")
          .filter(Boolean);
        return { dir, commit, added, paths };
      } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
      }
    },
    // A normal push of one explicit refspec to a new branch.
    async push({ dir, forwardTo, branch, token }) {
      const url = urlFor(forwardTo);
      await run(
        [
          ...helper(url, token),
          "push",
          "-q",
          url,
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        { cwd: dir },
      );
    },
    cleanup({ dir }) {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
