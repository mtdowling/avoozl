// Test helper: a scratch git repository for the settings tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Runs git in `root` and returns its trimmed output.
export function git(root: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// A repository at `root` on main with one commit of README.md, and an
// `origin` remote at `origin` when one is given.
export function testRepository(root: string, origin?: string) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Avoozl test"]);
  git(root, ["config", "user.email", "avoozl@example.test"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Test\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "Initialize"]);
  if (origin) git(root, ["remote", "add", "origin", origin]);
}
