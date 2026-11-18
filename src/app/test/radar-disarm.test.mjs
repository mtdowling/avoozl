// RC5.4: Disarm turns auto-merge off on one pull request Avoozl armed. The
// tick no longer arms anything, so the armed record is seeded as an earlier
// tick wrote it. Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { REPO, setup } from "./radar-coder-merge-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

test("Disarm turns auto-merge off for a person and is refused for an agent", async (t) => {
  const { github, store } = setup(t);
  github.addPull(16);
  await github.armAutoMerge(REPO, "PR_16", "SQUASH");
  store.setMeta("radarMerge", {
    armed: { [`${REPO}#16`]: new Date().toISOString() },
  });
  const ops = new Operations(store, { github, workspaceRoot: "/nope" });
  assert.deepEqual(
    (await ops.execute("radar.armed", {})).pullRequests.map((p) => [
      p.repository,
      p.number,
    ]),
    [[REPO, 16]],
  );
  const input = { repository: REPO, pullRequest: 16 };
  await assert.rejects(
    ops.execute("radar.disarm", input, undefined, { mcp: true }),
    /person/,
  );
  await assert.rejects(
    ops.execute("radar.disarm", input, undefined, { caller: "s" }),
    /person/,
  );
  assert.deepEqual(github.disarmed, []);
  await ops.execute("radar.disarm", input);
  assert.deepEqual(github.disarmed, ["PR_16"]);
  assert.deepEqual((await ops.execute("radar.armed", {})).pullRequests, []);
  await assert.rejects(
    ops.execute("radar.disarm", { repository: REPO, pullRequest: 99 }),
    /did not arm/,
  );
});

test("the tick arms no pull request", async (t) => {
  const { github, tick } = setup(t);
  github.addPull(16);
  github.closes.set(6, [16]);
  for (let i = 0; i < 3; i += 1) await tick();
  assert.deepEqual(github.armed, []);
});
