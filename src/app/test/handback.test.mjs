// Hand-back over SSH (task 11.13, R41.15): a remote crew commits in its own
// folder and this machine fetches the branch with a pinned host key. A fake
// ssh command stands in for the host; no test connects anywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pinned, sshCommand } from "../handback.mjs";
import { fakeCrew, git } from "./fake-crew.mjs";
import { FAKE_SSH } from "./fixtures/crews/driver.mjs";
import { CREWS, defaults, workspace } from "./fixtures/crews/workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("the first fetch pins a host key and later fetches require it", () => {
  const file = path.join(temporaryDirectory("avoozl-kh-"), "known_hosts");
  assert.equal(
    sshCommand({ knownHosts: file, host: "box.example.test" }).mode,
    "accept-new",
  );
  fs.writeFileSync(file, "box.example.test ssh-ed25519 AAAA\n");
  assert.ok(pinned(file, "box.example.test"));
  const { mode, command } = sshCommand({
    knownHosts: file,
    host: "box.example.test",
  });
  assert.equal(mode, "yes");
  assert.match(command, /StrictHostKeyChecking=yes/);
  assert.match(command, /BatchMode=yes/);
  assert.match(command, /UserKnownHostsFile='/);
});

test("a hand-back crew's commit is fetched over ssh, checked, and integrated; a changed key is refused", async (t) => {
  const remoteRoot = temporaryDirectory("avoozl-handback-remote-"),
    knownHosts = path.join(
      temporaryDirectory("avoozl-handback-kh-"),
      "known_hosts",
    ),
    log = path.join(remoteRoot, "ssh.log");
  process.env.FAKE_SSH_LOG = log;
  process.env.FAKE_SSH_HOST_KEY = "ssh-ed25519 AAAAfirst";
  t.after(() => {
    delete process.env.FAKE_SSH_LOG;
    delete process.env.FAKE_SSH_HOST_KEY;
  });
  const env = await workspace(t, {
    routing: { rules: [{ id: "spread-work", on: "any" }] },
    machine: {
      rules: [
        { id: "pin-linux", when: { roles: ["worker"] }, on: "fake-linux" },
      ],
    },
    crews: {
      ...CREWS,
      "fake-linux": {
        ...CREWS["fake-linux"],
        delivery: "handback",
        sshHost: "builder@fake-linux.example.test",
        worktreeRoot: remoteRoot,
      },
    },
    ids: ["w1", "w2"],
  });
  env.ops.placement.sshCommand = FAKE_SSH;
  env.ops.placement.knownHosts = knownHosts;
  const base = git(env.checkout, "rev-parse", "main");
  const handback = async ({ session, report }) => {
    const commit = env.driver.remoteCommit(session, {
      url: env.bare,
      base,
      file: `src/${session.alias}.txt`,
      text: `${session.alias}\n`,
    });
    await report({ commit });
    return commit;
  };
  const crew = fakeCrew(env.ops, {
    aliases: env.aliases,
    defaults: defaults(env),
    scripts: {
      "w1:worker": handback,
      "w2:worker": async ({ session, refused }) => {
        const commit = env.driver.remoteCommit(session, {
          url: env.bare,
          base,
          file: "src/w2.txt",
          text: "w2\n",
        });
        await refused({ commit }, /host key changed since it was pinned/);
        return commit;
      },
    },
  });
  const dispatch = (await crew.tick()).dispatch.filter(
    (d) => d.role === "worker",
  );
  assert.deepEqual(
    dispatch.map((d) => d.crew),
    ["fake-linux", "fake-linux"],
  );
  const brief = dispatch[0].brief;
  assert.match(brief, new RegExp(`Work in ${remoteRoot}/app-`));
  assert.match(brief, /Do not push, and write nothing to GitHub/);
  assert.ok(!brief.includes(env.checkout));
  await crew.play((s) => s.alias === "w1");
  assert.ok(
    pinned(knownHosts, "fake-linux.example.test"),
    "pinned on first use",
  );
  for (let i = 0; i < 4; i++) {
    await crew.tick();
    await crew.play((s) => s.alias === "w1");
  }
  assert.ok(
    env.ops.read().tasks.find((x) => x.id === env.id.w1).integration?.commit,
    "w1 integrated",
  );
  // The host now shows another key: nothing is fetched.
  process.env.FAKE_SSH_HOST_KEY = "ssh-ed25519 AAAAsecond";
  await crew.play((s) => s.alias === "w2");
  const calls = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  // git may open the connection more than once per fetch; every call after
  // the pin checks the key, and the changed key is refused.
  assert.equal(calls[0].result, "pinned");
  assert.ok(!calls.slice(1).some((c) => c.result === "pinned"));
  const later = calls.filter((c) => c.mode === "yes");
  assert.ok(later.length && later.every((c) => c.result === "changed"));
  // Avoozl never pushed: the bare remote has only main.
  assert.equal(
    git(env.bare, "for-each-ref", "--format=%(refname)", "refs/heads"),
    "refs/heads/main",
  );
});
