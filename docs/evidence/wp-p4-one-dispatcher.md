# wp-p4 receipt: one dispatcher, two executors, one remote route

Run 2026-11-19 at `9398cd8a` (`task/worker-paths-rest`, which carries wp-5.2), with task 45.4 of the avoozl spec landed (#716). Script: `node scripts/proof-wp-p4.mjs`. It reads the checkout and writes nothing. Result: **PASS** on all four steps. No image.

## Steps

1. **The source test of WP1.4 and the pair table's test.** `src/app/test/one-dispatcher.test.mjs` and `src/app/test/worker-briefs.test.mjs`: 11 pass, 0 fail.
2. **Every operation that writes a session request with role `worker`.** The scan the WP1.4 test uses finds two modules:
   - `delivery.mjs`, the tick's planner (`planReadyDispatches`).
   - `remote-runner.mjs`, a worker machine's own tick, which starts a task it pulled.
   - The manual claim (`manual-claim.mjs`) binds a person's claim with role `worker` and writes no request.
3. **Every worker brief the pair table builds, searched for "push", "pull request" and "auto-merge".** The table builds nine briefs: `kirocrew` single, investigate, batch, round and machine, and `process` single, investigate, round and machine. No sentence tells the worker to push, open a pull request or turn on auto-merge. The words appear in 12 sentences:
   - 11 forbid it, such as "Do not push, open or edit a pull request, merge, turn on auto-merge, label, or comment."
   - 1 says what the runner does: "The runner runs the checks and pushes." (`kirocrew` machine).
   Before 45.4, the plans-repo brief told the worker to push, open the pull request and turn on auto-merge. That brief is gone.
4. **Lines of `src/app`, tests excluded.** Before Phase 2 (`203e136c`, the parent of wp-2.1's merge `fabe9bc5`): 113,531. Now: 94,203. 47 files went.
   - From this spec: `src/app/runner/avoozl-runner.md` (wp-2.2) and `src/app/moved-operations.mjs` (#698, which wp-5.1 follows).
   - Most of the drop is other work that landed in the same window: 45.4 and 45.5 (the GitHub projection, plans-repo and close modules), the Issue Radar coder removal (#700), and the merge batches that replaced the integrator trains.
   - The full list is in the script's output.

## Expected and observed

- EXPECTED (1): both pass. OBSERVED: 11 of 11.
- EXPECTED (2): the list is the tick's planner and the manual claim. OBSERVED: the tick's planner, a worker machine's own tick (the one remote route, WP5), and the manual claim.
- EXPECTED (3): nothing is found, once task 45.4 has landed. OBSERVED: no instruction to push, open a pull request or turn on auto-merge. Only prohibitions and one sentence about the runner remain.
- EXPECTED (4): the receipt records the two counts and the modules that went. OBSERVED: above.
