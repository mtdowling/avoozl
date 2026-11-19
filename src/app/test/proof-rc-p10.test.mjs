// Proof rc-p10 on a fake GitHub: the public sign-off is the owner's and is
// recorded only when its checklist is met. Release to crews went with Who
// codes (R91.6). Temporary workspace and fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { auditRan, crewHome, fakeRuleSet } from "./public-signoff-fixture.mjs";
import { leaf, setup } from "./radar-coder-release-fixture.mjs";

const REPO = "example/code";
const visibility = (w, value) =>
  w.store.put("github_repositories", {
    ...w.store.get("github_repositories", REPO),
    private: value,
  });

test("publiccrews.signoff records the sign-off, owner only", async (t) => {
  const { principalAllows } = await import("../app-backend.mjs");
  for (const kind of ["app-token", "agent-tool"])
    assert.equal(principalAllows({ kind }, "publiccrews.signoff"), false, kind);
  assert.equal(
    principalAllows({ kind: "owner-session" }, "publiccrews.signoff"),
    true,
  );
  const w = await setup(t, { release: { capacity: 2 } }, [leaf("leaf-a")]);
  visibility(w, false);
  await assert.rejects(
    w.ops.execute("publiccrews.signoff", { repository: "x/y" }),
    {
      status: 404,
    },
  );
  await w.ops.execute("publiccrews.signoff", {
    repository: REPO,
    complete: false,
  });
  // The checklist is not met yet, so the sign-off is refused.
  await assert.rejects(
    w.ops.execute("publiccrews.signoff", { repository: REPO, complete: true }),
    { status: 409 },
  );
  fakeRuleSet(w.store);
  auditRan(w.store, REPO);
  await w.ops.execute("publiccrews.signoff", {
    repository: REPO,
    complete: true,
    home: crewHome(),
  });
  assert.equal(w.store.getMeta("publicSignoff")[REPO].complete, true);
});

// Live run of Proof 10: after the sign-off, the tick projected nothing again,
// because the release fingerprint did not cover the hold, so nothing was
// released until something else changed the plan.
