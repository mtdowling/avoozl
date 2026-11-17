// R94.6: does Claude Code's `--max-budget-usd` bind on a plan login? This
// runs the real CLI on the person's own login, so it spends a little of
// their quota and is skipped unless they ask for it:
//
//   AVOOZL_LIVE_CLAUDE_PLAN=1 node --test src/app/test/claude-plan-budget.test.mjs
//
// It refuses to run on a login that `claude auth status` reports as an API
// key or a cloud provider, where the answer is not the one asked. The finding
// is printed as a diagnostic; it is never assumed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const live = process.env.AVOOZL_LIVE_CLAUDE_PLAN === "1";

test(
  "Claude Code's --max-budget-usd on a plan login",
  { skip: !live && "set AVOOZL_LIVE_CLAUDE_PLAN=1 on a plan login" },
  (t) => {
    const status = spawnSync("claude", ["auth", "status"], {
      encoding: "utf8",
    });
    assert.equal(status.status, 0, status.stderr);
    const auth = JSON.parse(status.stdout);
    assert.ok(auth.loggedIn, "claude is not signed in");
    if (auth.apiProvider || /api.?key|third_party/i.test(auth.authMethod ?? ""))
      assert.fail(
        `This login is ${auth.authMethod}${auth.apiProvider ? ` (${auth.apiProvider})` : ""}, not a plan login.`,
      );
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-plan-budget-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    // A cap far below one turn's cost: on an API login the run stops on it.
    const run = spawnSync(
      "claude",
      [
        "-p",
        "--output-format",
        "json",
        "--permission-mode",
        "plan",
        "--max-budget-usd",
        "0.0001",
        "Reply with the word OK. Then write a 300-word story.",
      ],
      { cwd, encoding: "utf8", timeout: 120_000 },
    );
    const result = JSON.parse(run.stdout);
    const binds = /budget/i.test(`${result.subtype} ${result.result ?? ""}`);
    t.diagnostic(
      `authMethod=${auth.authMethod} subtype=${result.subtype} ` +
        `total_cost_usd=${result.total_cost_usd} binds=${binds}`,
    );
    assert.equal(result.type, "result");
  },
);
