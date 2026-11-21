// @ts-nocheck: typing debt
// The role proof's rows (machine-server D6, ms-1.7): every role the process
// executor runs has a row, so a new role cannot skip the live proof.
import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_TABLE } from "../agents/role-table.ts";
import { ROWS } from "../../../scripts/proofs/ms-roles-rows.ts";

test("every ROLE_TABLE row with process: true is a row of the role proof", () => {
  const driven = new Set(ROWS.flatMap((row) => row.drives));
  for (const row of Object.values(ROLE_TABLE))
    if (row.process)
      assert.ok(
        driven.has(row.setting),
        `${row.setting} runs as a child but the role proof has no row for it`,
      );
});

test("every role a row drives is a role in ROLE_TABLE", () => {
  const settings = new Set(Object.values(ROLE_TABLE).map((row) => row.setting));
  for (const row of ROWS)
    for (const role of row.drives)
      assert.ok(
        settings.has(role),
        `${row.id} drives ${role}, which is not a role`,
      );
});

test("a row the proof does not drive says why", () => {
  for (const row of ROWS)
    if (row.driven === false)
      assert.ok(row.why?.length > 10, `${row.id} needs a reason`);
});
