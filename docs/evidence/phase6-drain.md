# Old-host run drain

Source revision 2010; documents at commit `3efad7cea590b3f12c19efb75a966b7fc5183c41`; code refs main = `465fce8f2e63`, integration = `0b8748fef88c`. 6 runs were open in the old host (1 interrupted, 5 observing).

| Run | Task | Task status | State | Ended as | Transcript | Worktree | Archived in old host |
|---|---|---|---|---|---|---|---|
| run-00000000-0000-0000-0000-000000000001 | conversation:run-00000000-0000-0000-0000-000000000001 | none | interrupted | interrupted | - | present | 2026-11-12T15:48:11.640Z |
| external-1911df5c446fb91e79f75c91 | nonreturning-bodies | implemented | observing | - | gone | gone | 2026-11-12T15:48:11.820Z |
| external-2998bba771328d4b7667a1c1 | guest-fixture-exports | implemented | observing | - | gone | gone | 2026-11-12T15:48:11.879Z |
| external-40411a657e4323382f27c1b6 | core-runtime-code-loading | implemented | observing | - | gone | gone | 2026-11-12T15:48:11.946Z |
| external-0452dee64c795cac2dac7aa6 | core-string-method-errors | implemented | observing | - | gone | gone | 2026-11-12T15:48:12.013Z |
| external-a8d9a7a9cb7aeed563058b1d | general-ffi | partial | observing | - | gone | gone | 2026-11-12T15:48:12.091Z |

## run-00000000-0000-0000-0000-000000000001

- Task: conversation:run-00000000-0000-0000-0000-000000000001 (no task); codex ask; created 2026-11-09T17:17:56.929Z; last event 2026-11-09T17:47:31.119Z
- Branch: none
- Prompt: review plans and find ones that are no longer necessary or now totally obsolete or partially obselete given the changes on main and direction with the core rewrite
- Owner message (accepted): archive the stale ones and close their now defunct tasks. Then archive test assertion usability entirely including unresolved tasks from it. Any plan that is now rolled into another plan from you list should just be archived. Plans that are still part of the greater effort but are wrong should be updated now.
- 2026-11-09T17:18:01.117Z: I’ll compare the plans with the current code and the core rewrite direction, then separate plans that are obsolete from those that only need narrowing.
- 2026-11-09T17:18:20.933Z: The plans already distinguish the current core migration from several preserved historical accounts. I’m checking the remaining open plans for specific stale implementation steps and for work already present on main.
- 2026-11-09T17:18:53.818Z: The clearest obsolete work is concentrated in older VM and JIT execution plans; the current core still has substantial unfinished delivery and acceptance work. I also found stale API names and old progress claims inside otherwise useful plans.
- 2026-11-09T17:19:16.530Z: Yes. The strongest candidates are the old VM migration and interpreter execution plans. Several active plans also contain obsolete steps or status claims, but their underlying goals remain relevant. **Archive as execution plans:** - [Nupp VM in Nupp](<plans-workspace>/todo/nupp-vm-in-nupp.md:3) and [Nupp runtime migration](<plans-workspace>/todo/nupp-runtime.md:3) already say they were superseded by the native runtime plan. Their unchecked historical tasks should not appear to be independent work. - [Make the Nupp VM interpreter fast](<plans-workspace>/todo/interpreter-speed/prompt.md:8) asks a new worker to choose between Rust and C dispatch implementations on the old experiment branch. The core direction has since chosen Nupp handlers and a frozen bootstrap. Keep the measurements as history, not the prompt as a task. **Retain the goal, replace stale implementation guidance:** - [JIT specialization and deoptimization](<plans-workspace>/todo/jit-specialization-design.md:35) targets the old bytecode-to-Cranelift tier. Its invalidation, recovery, weak-reference and measurement requirements remain useful; its branch, tier and lowering instructions need translation to the shared graph and derived tiers. - [Allocation elimination](<plans-workspace>/todo/nupp-allocation-elimination.md:19) has the same problem: it references the superseded VM port, Rust collector and register-form lowering. Escape analysis, identity, recovery and measured allocation reduction remain relevant to the core. - [Nupp-owned machine backend](<plans-workspace>/todo/nupp-owned-backend.md:12) is still needed, but its statement that guest calls and the six workloads remain open is stale. The live ledger records the six workloads executing; current-head acceptance is a separate open task. - [Native runtime](<plans-workspace>/todo/nupp-native-runtime.md:535) still prescribes `coroutine.suspension.suspend`; main now exposes `coroutine.suspend` and `coroutine.host`. The concurrency and cancellation contracts remain open. Likewise, the rewrite plan’s [old `io.files` destination](<plans-workspace>/todo/nupp-compiler-runtime-rewrite.md:19) predates its removal from the public API. Importing current main and validating core behavior remains necessary. - [Filesystem functions in os](<plans-workspace>/todo/nupp-io-files-removal-options.md:96) is mostly delivered, but glob streaming and the post-stage-zero cleanup are explicitly still pending. Narrow it to those, rather than treating the entire migration as unfinished. [Test assertion usability](<plans-workspace>/todo/test-assertion-usability.md:3) is marked implemented with all five items checked and is a good completed-plan archive candidate. I opened a [breakout in the plans UI](<local app>) showing representative stale items beside live core work. This is a targeted review, not an exhaustive audit of every plan; I changed no source or task acceptance.
- 2026-11-09T17:41:19.672Z: I’ll archive the superseded plans and their defunct tasks, then correct the remaining plans without marking unfinished core work accepted.
- 2026-11-09T17:41:24.677Z: I’m using the Nupp plans workflow to preserve task history and distinguish archival from acceptance.
- 2026-11-09T17:42:32.765Z: The old VM plans contain 61 open catalog items, including the one already archived. I’m retaining their recorded evidence while closing those obsolete execution items; the current runtime tasks remain separate.
- 2026-11-09T17:44:03.015Z: The four plans are now archived in the library, and I’ve added current-direction corrections to the retained designs. The workspace flags linked tasks for review whenever a design changes, so I’m checking those flags against the limited corrections and preserving any preexisting review state.
- 2026-11-09T17:45:21.383Z: The old VM tasks are being retired without changing the live core milestones. I’m also preserving review flags where the corrected design may affect a task’s interpretation or another worker has touched it.
- 2026-11-09T17:46:23.832Z: The archive now includes the superseded plans and the test assertion plan. Its five indexed tasks were already recorded as complete; their history is preserved. The remaining cleanup is finishing the old VM task records and checking the resulting review queue.

## external-1911df5c446fb91e79f75c91

- Task: nonreturning-bodies (implemented); claude observe, external observation; created 2026-11-09T06:28:56.043Z; last event 2026-11-09T06:28:56.116Z
- Branch: worktree-bridge-cse_019eMCkAHssczkFVDnmvueqw
- Task activity: finished: Committed a6b1e5a36; awaiting lead gate
- Commits: `a6b1e5a36` integration

## external-2998bba771328d4b7667a1c1

- Task: guest-fixture-exports (implemented); claude observe, external observation; created 2026-11-09T06:24:13.473Z; last event 2026-11-09T06:24:13.545Z
- Branch: worktree-bridge-cse_019eMCkAHssczkFVDnmvueqw
- Task activity: finished: Baseline run of 5 failing Lua suites on pre-migration sources

## external-40411a657e4323382f27c1b6

- Task: core-runtime-code-loading (implemented); claude observe, external observation; created 2026-11-09T06:24:13.355Z; last event 2026-11-09T06:24:13.406Z
- Branch: worktree-bridge-cse_019eMCkAHssczkFVDnmvueqw
- Task activity: active: final verification on f3f7ba0b3
- Commits: `f3f7ba0b3` integration

## external-0452dee64c795cac2dac7aa6

- Task: core-string-method-errors (implemented); claude observe, external observation; created 2026-11-09T06:24:13.225Z; last event 2026-11-09T06:24:13.279Z
- Branch: worktree-bridge-cse_019eMCkAHssczkFVDnmvueqw
- Task activity: finished: Committed d165d6043; awaiting lead gate
- Commits: `d165d6043` integration

## external-a8d9a7a9cb7aeed563058b1d

- Task: general-ffi (partial); claude observe, external observation; created 2026-11-09T06:24:13.069Z; last event 2026-11-09T06:24:13.143Z
- Branch: worktree-bridge-cse_019eMCkAHssczkFVDnmvueqw
- Task activity: paused: native-bridge-rest committed (b497d98f7, 8ed598730), paused for the osfiles gate question
- Commits: `b497d98f7` integration, `8ed598730` integration
