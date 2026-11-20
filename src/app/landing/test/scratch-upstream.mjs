// A bare upstream whose main holds one commit (a.txt), and a clone of it
// per name in `clones`, each with a fixture identity. `head()` reads the
// upstream's main. Local scratch repositories under `root` only.
import fs from "node:fs";
import path from "node:path";
import { git } from "../../git/git.mjs";

export async function scratchUpstream(root, clones) {
  const seed = path.join(root, "seed"),
    upstream = path.join(root, "upstream.git"),
    dirs = {};
  fs.mkdirSync(seed);
  const identity = async (dir) => {
    await git(dir, ["config", "user.name", "Fixture"]);
    await git(dir, ["config", "user.email", "fixture@example.invalid"]);
  };
  await git(seed, ["init", "-q", "-b", "main"]);
  await identity(seed);
  fs.writeFileSync(path.join(seed, "a.txt"), "a\n");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", seed, upstream]);
  for (const name of clones) {
    dirs[name] = path.join(root, name);
    await git(root, ["clone", "-q", upstream, dirs[name]]);
    await identity(dirs[name]);
  }
  const head = async () =>
    (
      await git(root, ["ls-remote", "--heads", upstream, "refs/heads/main"])
    ).split(/\s+/)[0];
  return { upstream, dirs, head };
}
