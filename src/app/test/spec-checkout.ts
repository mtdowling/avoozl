// A scratch git checkout for spec approval tests: `run(args, env)` runs git
// in it, and the owner is the checkout's own git user.
import { execFileSync } from "node:child_process";
import { temporaryDirectory } from "./temporary.ts";

export const OWNER = "owner@example.com";

export function specCheckout(prefix = "avoozl-checkout-") {
  const root = temporaryDirectory(prefix),
    run = (args: string[], env = {}) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...env },
      }).trim();
  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", OWNER]);
  run(["config", "user.name", "Owner"]);
  run(["config", "commit.gpgsign", "false"]);
  return { root, run };
}
