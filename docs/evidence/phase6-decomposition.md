# Broad-task decomposition (proposal)

Source revision 2010; documents at commit `3efad7cea590b3f12c19efb75a966b7fc5183c41`; code refs main = `465fce8f2e63`, integration = `0b8748fef88c`. 32 unfinished packages that are not partial; 27 proposed leaves. Only leaves can become ready. Every row is a planner proposal for owner review; none is applied.

| Verdict | Count |
|---|---|
| hold | 7 |
| leaf | 16 |
| package | 9 |

| Task | Epic | Status | Verdict | Leaves | Reason |
|---|---|---|---|---|---|
| frame-layouts | W2 | planned | leaf | itself | Bounded: reserve three named layouts and one collector rule. Acceptance: The frame layout has a frame-resident object area, task data stacks sit beside frame stacks, and the collector traces frame-resident objects with their frame, shown by collector units. |
| core-workers | W3 | deferred | hold | 0 | Has four deferred children (WC-C1 to WC-C4). Deferred by the owner. Decomposing now would guess at scope; decompose when it is resumed. |
| worker-core-contract | W3 | deferred | hold | 0 | Deferred by the owner. Decomposing now would guess at scope; decompose when it is resumed. |
| worker-core-entry | W3 | deferred | hold | 0 | Deferred by the owner. Decomposing now would guess at scope; decompose when it is resumed. |
| worker-core-channels | W3 | deferred | hold | 0 | Deferred by the owner. Decomposing now would guess at scope; decompose when it is resumed. |
| worker-core-checkpoints | W4 | deferred | hold | 0 | Deferred by the owner. Decomposing now would guess at scope; decompose when it is resumed. |
| http | W3 | planned | package | 3 | Client, server and a fuzzed parser are separate deliverables. |
| tls | W3 | planned | package | 2 | A library decision comes before the integration. |
| graph-snapshots | W4 | planned | package | 3 | Save/load, transactional loadInto and worker saves are separable. |
| snapshot-history | W4 | planned | leaf | itself | Bounded by its stated tests. Acceptance: Stable identities, bounded history, delta and full capture, branching rewind and recorded-event replay pass, including divergence and reused-address tests. |
| event-loop-restore | W4 | planned | leaf | itself | Bounded by its stated test. Acceptance: A replayed run repeats no externally visible write, and a divergent operation is reported. |
| hot-reload | W4 | planned | package | 3 | Staging, debug.reload and nupp watch are separate surfaces. |
| patterns | W5 | planned | package | 3 | Compiled patterns, limits and caller migration are separate. |
| combined-acceptance | W6 | blocked | hold | 0 | Blocked on the W1 to W6 work; it is the final gate, so its leaves are the per-platform runs once the parts land. Keep it a package until then. |
| publish-core-seed | W6 | planned | leaf | itself | Bounded release steps in a fixed order. Acceptance: A pre-release core seed pair is published, its digests verified, and the pin moved, in that order. |
| benchmark-suite | W7 | planned | package | 2 | Porting the suite and recording the controls are separate. |
| residual-loader | W7 | planned | leaf | itself | Bounded. Acceptance: Residual-template selection goes through an authoritative Nupp loader, and selection, body and slot authority are verified, with a refusal case for each. |
| residual-graphs | W7 | planned | leaf | itself | Bounded. Acceptance: Symbolic-operand residual graphs are generated from the handlers at runtime build within a bound, and unsupported forms are refused explicitly. |
| baseline-tier | W7 | planned | leaf | itself | Bounded by its measurements. Acceptance: A baseline tier stitched from residuals runs, with compile latency, memory and warmup measured, and one implementation kept. |
| graph-optimizations | W7 | planned | package | 5 | An ordered program of five optimizations. |
| typed-hot-code | W7 | planned | leaf | itself | Bounded. Acceptance: Typed code compiles to native shape with no type guards, known field offsets and unboxed numbers, and typed hot functions compile ahead of time or on first call. |
| metamethod-specialization | W7 | planned | leaf | itself | The task names its own acceptance. Acceptance: Vec2 + Vec2 on structs compiles to the same code as two hand-written float adds. |
| generator-fusion | W7 | planned | leaf | itself | Bounded by its benchmarks. Acceptance: Generators and iterator chains fuse or become stackless state machines where valid, and benchmarks match their hand-written twins. |
| osr-background-jit | W7 | planned | package | 4 | Guarded inlining, OSR, background compile and inline caches are separate mechanisms. |
| result-destinations | W7 | planned | leaf | itself | Bounded. Acceptance: The interpreter, compiled tiers and AOT agree on result destinations in the calling convention, and unknown callers pass the heap. |
| allocation-fast-path | W7 | planned | leaf | itself | Bounded by its measurements. Acceptance: Compiled code allocates with an inline bump or freelist pop, with allocation, collection, RSS and retained pages measured on the workloads. |
| shape-probes | W7 | planned | leaf | itself | Bounded. Acceptance: Shape-probe storage for compiled code is owned by the core, image growth is no longer refused at the fixed capacity, and invalidation is tested. |
| bounded-specialization | W7 | planned | leaf | itself | Bounded. Acceptance: Feedback and guard specializations have finite site states, code budgets and invalidation across image changes, with cases. |
| derived-aot | W7 | planned | leaf | itself | The task names its own acceptance. Acceptance: The full CLI, checks, rebuild and fixpoint run through derived AOT within 2% of the frozen AOT compiler's control, with no RSS or code-size regression past the budget. |
| gc-tuning | W7 | planned | package | 2 | Pacing tuning and the compressed-reference evaluation are separate. |
| shared-compiler-production | W6 | planned | hold | 0 | Conditional on the sharing pilot passing; the pilot gate did not pass, so nothing here may start without an owner go. |
| vm-tmpfile-seek | W5 | planned | leaf | itself | Bounded, but the first step is an owner choice (main-first or not). Acceptance: The frozen VM's file handles support io.tmpfile and File:seek as lua.d.nupp declares, or the declarations are removed by an owner decision. |

## Proposed leaves

| Leaf | Title | Acceptance | Checklist entries |
|---|---|---|---|
| http.parser | HTTP/1.1 parser with fuzzing | An HTTP/1.1 request and response parser in Nupp is fuzzed in CI from its first commit. |  |
| http.client | HTTP/1.1 client over the reactor | An HTTP/1.1 client in Nupp runs over the reactor and passes client cases. | plan-73651db27eded597d2 |
| http.server | HTTP/1.1 server over the reactor | An HTTP/1.1 server in Nupp runs over the reactor and passes server cases; the Rust http and net crates are deleted. |  |
| tls.choose-library | Choose the I/O-free TLS library | A written decision picks one I/O-free TLS library with platform certificate verification. | plan-7d3e347a674651f8db |
| tls.integrate | Connect TLS through one C call | TLS connects to the loop through one C call and the Rust tls crate and its tokio adapter are deleted. |  |
| graph-snapshots.save-load | Graph save and load over a checked codec | Graph save and load and durable values round-trip over a bounded checked codec, with cases. | plan-bb3114bf1f6c4e049c, plan-169757c28ee84471d5 |
| graph-snapshots.transactional-load | Transactional prepare and loadInto | prepare and loadInto are transactional: a failed load leaves the runtime unchanged, with cases. | plan-08389534cc773327ea |
| graph-snapshots.whole-runtime-capture | Whole-runtime captures with resource policies | Whole-runtime captures apply each resource's policy, with cases. |  |
| hot-reload.staging-validation | Stage and validate a reload by function id | A reload is staged and validated by function id, and an unmigrated layout change is refused, with cases. | plan-462a0cbcc93c69a6a8 |
| hot-reload.debug-reload | debug.reload modes | debug.reload's manual, pending, apply and observe modes work, with inlined bodies invalidated. |  |
| hot-reload.nupp-watch | nupp watch as an event-loop task | nupp watch runs as an event-loop task and applies reloads at safe points. |  |
| patterns.compiled-patterns | Patterns through the ordinary compiler | Patterns compile through the ordinary compiler and eval pipeline and pass the Lua pattern suite. | plan-67f346994cb3a19b25 |
| patterns.work-limits | Pattern work accounts and limits | One work account covers a whole gmatch iterator or gsub, and compile, match, output and retained-code limits are enforced, with cases. |  |
| patterns.migrate-regex-callers | Migrate regex callers | Every regex caller uses Patterns. |  |
| benchmark-suite.port-suite | Port the benchmark suite | The six workloads, Are We Fast Yet and the numeric, graph and JSON families run as Nupp benchmarks, dynamic and typed where relevant. | plan-1f0e5815b7b2986e5f |
| benchmark-suite.luajit-controls | Record LuaJIT controls on recorded main | LuaJIT control timings are recorded on the recorded main for every ported benchmark. |  |
| graph-optimizations.lazy-writeback | Lazy frame write-back and grouped exits | Frame write-back is lazy with grouped exits, keeping identity, roots and recovery, and the six workloads are re-measured. | plan-50aa5d86f6db990bd5 |
| graph-optimizations.typed-calls | Real typed calls between compiled functions | Compiled functions call each other with typed arguments, with cases. |  |
| graph-optimizations.fast-path-compilation | Fast-path-only compilation | Functions compile their fast path only, with exits for the rest, with cases. |  |
| graph-optimizations.finite-feedback | Feedback with finite site states | Feedback sites have finite states and invalidation, with cases. |  |
| graph-optimizations.allocation-removal | Allocation removal | Allocation elimination A1 to A4, A4b and A6 land with roots, recovery and materialization kept. | plan-1f6a14dc0bbc203a4e |
| osr-background-jit.guarded-inlining | Inlining guarded by callee identity | Calls inline under a callee-identity guard and deoptimize when it fails, with cases. |  |
| osr-background-jit.osr | Enter compiled code mid-loop | Loops enter compiled code after about 56 iterations and functions after about 112 calls. | plan-efb63cacaa2541d134 |
| osr-background-jit.background-compile | Compile on a background worker | Compilation runs on a background worker without blocking the program. |  |
| osr-background-jit.patchable-inline-caches | Patchable inline caches | The interpreter and baseline tier keep patchable inline caches. |  |
| gc-tuning.pacing-from-measurements | Tune collector pacing from measurements | Collector pacing is tuned from allocation elimination's measurements, with before and after numbers. |  |
| gc-tuning.compressed-references | Evaluate 32-bit compressed references | A written evaluation of 32-bit compressed references gives memory and time numbers and a decision. | plan-e910bf94cd6a0f40ff |
