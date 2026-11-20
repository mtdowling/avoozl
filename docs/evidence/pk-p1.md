# pk-p1 receipt: a slow outside check on a scratch repository

Run 2026-11-19 23:52 to 00:00 UTC, on macOS (darwin arm64) with node v26.13.1. Script: `node scripts/proofs/pk-p1.mjs`, at this commit's sources, with the real 60 and 90 second waits. 19 of 19 observations passed. Screenshots checked, not kept in git. No image.

## Setup

- An isolated workspace in a temporary folder, with its own config and state folders (`XDG_CONFIG_HOME`, `XDG_STATE_HOME`), removed after the run.
- A scratch repository `acme/api` with a bare remote, registered with `requiredChecks: ["parity"]`, its own check `git status`, and the process sandbox as isolation.
- A fake review service the script starts on `127.0.0.1` only. It answers each request after 60 seconds and says `differs` for any change to `schema/`.
- A local-folder plugin `acme-checks`, declared in this workspace's own machine `plugins.json` and approved there: check `parity` (`repos: ["acme/*"]`, `paths: ["src/api/**", "schema/**"]`, `network: true`, a decide prompt, `decideAt: ["approve", "diff"]`, `stage: "task"`), a script that posts the change's files to the fake service.
- For the MCP leg: the fake stdio MCP server from the test tree (`src/app/test/fixtures/fake-review-mcp.mjs`), whose `get_review` reports `running` for 90 seconds and then `same`, or `differs` for a change to `schema/`, and logs every call. Check `parity-review` as `stage: "task"`, its alias mapped in the same `plugins.json`.
- One approved spec with eight tasks. The worker that commits each task and reports done, and the model that answers each decide call, are scripted stand-ins: the worker writes the task's file and reports through the bound session, and the decide stand-in answers through `plans_submit_decide`'s operation, bound as a `check-decide` session. Everything else is Avoozl's own code: the tick, the check runner, the filters, the cache, the stages, local integration and the MCP client.

## Expected and observed

- EXPECTED (1): the docs task lands with `parity` skipped by paths; the refactor lands with `skipped: decide` and its reason; the field change waits about 60 seconds and lands; the schema change fails and goes back to its worker; nothing of the plugin is in the repository but the name `parity`.
- OBSERVED (1): docs task integrated, `parity` skipped by `paths`. Refactor integrated, skipped by `decide`, reason "Only an internal helper changed." Field change's `parity` ran 61.1 s and passed; integrated. Schema change failed with "check `parity` exited 1" and its delivery went back to the worker. The local result of `parity` on each exact head was `success` and `failure`. The leg took 163 s.
- EXPECTED (2): a rerun on the same content is cached and takes under a second.
- OBSERVED (2): cached, first made at `822f82d`, no request reached the service, 760 ms wall time including the worktree.
- EXPECTED (3): after the plugin's script is edited, no check runs until it is approved again.
- OBSERVED (3): the plugin read `changed`, and the next task run selected only `git status`.
- EXPECTED (4): with `stage: "phase"` and a new approval, both tasks land without waiting, the phase check runs once after the second, and its failure opens one Needs you item with a Start fix.
- OBSERVED (4): both tasks integrated and neither task run selected `parity`. One phase run, at the second task's landing commit, 66 s. Its failure showed one Needs you item, "Phase Phase 2 failed plugin check parity", holding the proposed fix with the output in an untrusted block.
- EXPECTED (5): the field change passes after about 90 seconds; the schema change fails and goes back to its worker with the review's summary as its only output; one `create_review` per change despite a backend restart mid-poll; no tool but `create_review`, `get_review` and `tools/list`.
- OBSERVED (5): the script drained the queue in a child process and killed it with SIGKILL once the first `get_review` was logged. The next drain requeued the orphaned run and resumed the stored review id; the leg took 111 s, the resumed step 10.7 s. Field change passed and integrated. Schema change failed, back to its worker, output "The schema changed: the response field list differs." The server's log shows 2 `create_review` calls for the 2 changes, and only `initialize`, `notifications/initialized`, `tools/list`, `create_review` and `get_review`.
- EXPECTED (6): after the alias's mapping changes, no MCP step runs until the plugin is approved again.
- OBSERVED (6): the plugin read `changed`; the next task run did not select `parity-review`, and the server log got no new line.
- EXPECTED (all): the bare remote and GitHub hold no commit status, check run or comment from a plugin check.
- OBSERVED (all): after pushing every branch, `git log -p --all` and the refs of the bare remote hold none of `parity.mjs`, the prompt text, `PARITY_PORT`, `acme-checks` or `create_review`, and there are no notes. No GitHub client was configured; the check runner is never handed one (the pk-1.5 test runs it with a recording one).

## Not covered here

- The decide calls were answered by a scripted stand-in, not a model.
- Landing was local integration, not `pr` landing on GitHub; `requiredChecks` was read through the local result reader that `pr` landing uses, which its own tests cover.
- The `branch` stage was not run live (the spec's next decision).
