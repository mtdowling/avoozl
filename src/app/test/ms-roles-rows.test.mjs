// The role proof's rows (machine-server D6, ms-1.7): every role the process
// executor runs has a row, so a new role cannot skip the live proof.
import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TABLE } from "../agents/role-table.mjs";
import { ROWS } from "../../../scripts/proofs/ms-roles-rows.mjs";

test("every ROLE_TABLE row with process: true is a row of the role proof", () => {
  const driven = new Set(ROWS.flatMap((row) => row.drives));
  for (const row of Object.values(ROLE_TABLE))
    if (row.process)
      assert.ok(
        driven.has(row.setting),
        `${row.setting} runs as a child but the role proof has no row for it`,
      );
});

test("a row the proof does not drive says why", () => {
  for (const row of ROWS)
    if (row.driven === false)
      assert.ok(row.why?.length > 10, `${row.id} needs a reason`);
});
