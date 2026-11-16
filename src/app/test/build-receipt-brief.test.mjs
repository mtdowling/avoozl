// RC32.8: the issue brief tells crews to use bin/build-receipt, only when the
// repository says it has it.
import assert from "node:assert/strict";
import test from "node:test";
import { leaf, setup } from "./radar-coder-release-fixture.mjs";

test("the brief names bin/build-receipt only for a repository that has it", async (t) => {
  const withIt = await setup(t, { buildReceipts: true }, [leaf("b-one")]);
  await withIt.tick();
  assert.match(
    withIt.issueOf(withIt.approved.taskIds[0]).body,
    /## Agent rules[\s\S]*bin\/build-receipt -- npm test/,
  );
  const without = await setup(t, {}, [leaf("b-two")]);
  await without.tick();
  assert.doesNotMatch(
    without.issueOf(without.approved.taskIds[0]).body,
    /build-receipt/,
  );
});
