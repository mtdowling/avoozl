# Partial-task reconciliation (proposal)

Source revision 2010; documents at commit `3efad7cea590b3f12c19efb75a966b7fc5183c41`; code refs main = `465fce8f2e63`, integration = `0b8748fef88c`. 41 partial tasks; 75 proposed remaining leaves. Every verdict is a planner proposal for owner review; none is applied.

| Verdict | Count |
|---|---|
| complete-pending-acceptance | 4 |
| partial | 37 |

| Task | Epic | Verdict | Commits | Branches | Reason |
|---|---|---|---|---|---|
| whole-language | W1 | partial | 48 named: 48 on a kept ref, 0 unmerged, 0 do not resolve | codex/native-lead-union gone | Language features are integrated (48 named commits, all on the integration branch). The task's own remaining items are open: the 42-case canonical matrix is unrun, and io.write's result is missing. Native work paused at owner request on 2026-11-11; lane branches are deleted. |
| runner-on-core | W1 | partial | 43 named: 38 on a kept ref, 0 unmerged, 5 do not resolve | codex/native-runner-run gone, codex/native-nupp-chunks gone, codex/native-runner-sweep gone, codex/native-runner-small gone, codex/native-runner-read-memory gone, codex/native-builder-cleanup gone, codex/native-fused-guard gone, codex/native-core-first-programs kept, codex/native-runner-capability-tail gone, codex/native-lead-union gone | Acceptance 1 and 2 are met in part: the runner ran over real suites, and the residual classifier accounts for 51 cases. Acceptance 3 is open. 5 named commits resolve on no kept ref. Native work paused at owner request on 2026-11-11; lane branches are deleted. |
| runner-core-hangs | W1 | partial | 2 named: 0 on a kept ref, 0 unmerged, 2 do not resolve | codex/native-runner-hangs-closure gone | The two winddown commits (61854bd12, 5019a6664) are only on the deleted lane branch; source checks passed, but no runtime acceptance exists. Native work paused at owner request on 2026-11-11; lane branches are deleted. |
| compiler-self-build-on-core | W1 | partial | 13 named: 10 on a kept ref, 0 unmerged, 3 do not resolve | codex/native-self-build gone, codex/native-layout-factory gone, codex/native-core-first-programs kept, codex/native-selfbuild-boundary gone | The core self-build reaches bundling but hit the 3000-second bound with no image. 3 named commits are on no kept ref. Native work paused at owner request on 2026-11-11; lane branches are deleted. |
| cold-rebuild | W2 | partial | 5 named: 4 on a kept ref, 0 unmerged, 1 do not resolve | codex/native-core-check-snapshots gone, codex/native-rebuild-speed gone | The best quiet cold rebuild is 169.40 s (ec1baa0d5, on the integration branch); the target is under 120 s. Frontend emission (130 s) is the gap; frontend-build-speed carries that work. |
| frontend-build-speed | W2 | partial | 8 named: 8 on a kept ref, 0 unmerged, 0 do not resolve | none | Two traversal candidates were measured and rejected (ABBA within the 5% margin); all 8 named commits are on kept refs. A function-level profile is still needed before choosing the next change. |
| byte-types | W2 | partial | 4 named: 3 on a kept ref, 0 unmerged, 1 do not resolve | none | The isolated assembly e1e48f385 and followup 8919d6321 pass component tests; the combined guest gate is not passed, and the source item says no milestone is accepted until it is. |
| nominal-metadata | W2 | partial | 2 named: 1 on a kept ref, 0 unmerged, 1 do not resolve | none | The isolated fix c89c2af8f does not resolve in the code repository (its branch is gone). Interface round trips can still change reflection metadata. |
| value-layouts | W2 | partial | 1 named: 0 on a kept ref, 0 unmerged, 1 do not resolve | none | Only the tagged allocation gate is recorded as done. Packed {T} array parts and the Set plan's table kinds are open. |
| schema-roots | W2 | partial | 4 named: 4 on a kept ref, 0 unmerged, 0 do not resolve | none | Freezing, rooted metamethod names and weak modes landed (4 commits, all on the integration branch). One gap is named: a type registered from a witness after its first instance has no reflect member. |
| root-retirement | W2 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | The source item has no recorded state and no commits; partial is not supported by evidence. The two mapped checklist themes are the remaining work. |
| shared-resources | W2 | partial | 18 named: 17 on a kept ref, 0 unmerged, 1 do not resolve | codex/native-core-gc gone | Minimal full userdata and library functions as values landed. The source item names the open parts: no __gc, byte payload or host lifetime. 1a15386bf does not resolve. |
| generational-gc | W2 | partial | 3 named: 3 on a kept ref, 0 unmerged, 0 do not resolve | codex/native-core-gc gone | The generational collector runs (7b6c8ff74 and the other 2 named commits are on the integration branch). The source item's Left list is open. |
| collector-units | W2 | complete-pending-acceptance | 5 named: 5 on a kept ref, 0 unmerged, 0 do not resolve | none | Every remaining item the source names has a landing commit on the integration branch (01d40f7d3, 81a09e20b, 072721198), but no full run on one commit is recorded. Check: The full collector unit set (nativeheaptest allocator, graph and weak fixtures, plus the graph units) passes natively with and without collect-at-every-allocation on one integration commit, with a receipt. |
| memory-stress | W2 | partial | 1 named: 1 on a kept ref, 0 unmerged, 0 do not resolve | none | Interleaved stress with quarantine and the collector's own oracle landed (b5e073df6). The source item names the remaining part: independent semantic oracles. |
| parallel-aot-build | W2 | partial | 8 named: 8 on a kept ref, 0 unmerged, 0 do not resolve | none | Production parallel AOT is integrated (all 8 named commits on kept refs; 34% less AOT time). Acceptance 4 is met only on macOS, and in-flight failure coverage is missing. |
| dev-loop-ledger | W2 | complete-pending-acceptance | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | All three acceptance items are described as done in the notes, and the planning repository holds native-runtime/drivers/ledger.rb and native-inner.rb, which skips clean repeats and prints the ledger line. Check: One native run through the driver records itself in the ledger, skips a clean repeat of passing cases, and prints the one-line ledger signal. |
| task-runtime | W3 | partial | 3 named: 3 on a kept ref, 0 unmerged, 0 do not resolve | none | The constructor batch (fb340622a, 6a375d593) is on the integration branch, but the notes say no implementation acceptance is claimed. The handler-inheritance audit on the core is open. |
| reactor | W3 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | The kqueue reactor and pool run on the core. The source item's Open list is not done. The pool on Nupp workers waits on core-workers, which is deferred, so it is not a leaf here. |
| process-file-layers | W3 | partial | 1 named: 1 on a kept ref, 0 unmerged, 0 do not resolve | none | The process and file layers run on macOS. The source item's Open list is not done. |
| io-diagnostics | W3 | partial | 18 named: 17 on a kept ref, 0 unmerged, 1 do not resolve | codex/native-os-filesystem gone, codex/native-os-failures gone | Main's os filesystem functions and the call-context work are integrated (c65a5c296; 17 of 18 named commits on kept refs). The notes name one remaining item: setvbuf buffering. |
| io-os-library | W3 | partial | 2 named: 0 on a kept ref, 0 unmerged, 2 do not resolve | none | Lua's io and os run on the core against reference Lua. Name-based os calls still complete on the calling thread, not the pool. Write buffering is io-diagnostics.setvbuf-buffering. 5d888c9b3 and 431910bf3 do not resolve. |
| cancellation-stale | W3 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit, branch, evidence or state is recorded; partial is not supported by evidence, so treat it as planned. Actual worker execution needs core-workers, which is deferred. |
| image-identity | W4 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded beyond the 2026-11-09 note that this task takes module-loading's remaining image and schema orchestration. |
| library-layout | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. The source item's two parts are the leaves. |
| remove-providers | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. |
| lua-library | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit is named. warn routing landed under generational-gc (2bbe62199), so it is not a leaf here. |
| io-extensions | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit is named. os.info already matches main (io-diagnostics notes), so it is not a leaf here. |
| number-model | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. |
| records-structs | W5 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | Metatable freezing landed under schema-roots (d4c7c1987). The rest has no recorded state. |
| general-ffi | W5 | partial | 27 named: 27 on a kept ref, 0 unmerged, 0 do not resolve | codex/native-guest-ffi gone, codex/native-bridge-streams gone, codex/native-ffi-aggregates gone, codex/native-core-cdecl gone, codex/native-ffi-kernels gone, codex/native-bridge-rest gone | Steps 1 to 5 are integrated (be754b373, 83c70569b; all 27 named commits on kept refs), which meets acceptance 1, 3 and 4. Acceptance 2 (small struct returns) and guest-program FFI are open. |
| lua-differences | W5 | partial | 3 named: 3 on a kept ref, 0 unmerged, 0 do not resolve | none | The plan item holds the seeded list of differences, but no Differences from Lua page exists on the integration branch. |
| zero-python | W6 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit is named; the integration branch still has 62 .py files. |
| docs-tools | W6 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. |
| bridge-consolidation | W6 | partial | 1 named: 1 on a kept ref, 0 unmerged, 0 do not resolve | none | Host I/O wrappers are deleted (be754b373) and bridge-rest cut import slots to 10. The notes list the imports still in Rust. |
| target-parity | W6 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. |
| packaged-runner | W6 | partial | 4 named: 4 on a kept ref, 0 unmerged, 0 do not resolve | none | The compile-stage inventory fell from 31 to 15 owners (4 commits on kept refs); 13 were runtime code loading, which core-runtime-code-loading has since finished. The core run and failure set are not recorded. |
| shared-compiler-baseline | W6 | complete-pending-acceptance | 7 named: 3 on a kept ref, 0 unmerged, 4 do not resolve | codex/native-core-first-programs kept, codex/native-shared-compiler gone | Plan steps 1 and 2 are done: re-pinned, oracle 66/66, retention pilot 5.00x, and upper bound sufficient. The harness commit babc0538f is on no kept ref, and the cited evidence directory is not in the planning repository at the recorded commit. Check: The retention-pilot evidence (raw-babc0538f) is restored into the planning repository and the owner accepts the baseline as component evidence. |
| shared-compiler-sharing-pilot | W6 | complete-pending-acceptance | 2 named: 1 on a kept ref, 0 unmerged, 1 do not resolve | codex/native-shared-compiler gone | Plan step 3 ran to a verdict: gate NOT PASSED (editor p95 and memory gates fail). The cited report reports/shared-compiler-pilot-2026-11-10.md and checkpoint af53ebc are not in the planning repository. Check: reports/shared-compiler-pilot-2026-11-10.md is restored into the planning repository and the owner records the go/stop verdict. |
| numeric-loop-specialization | W7 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. The item is bounded, so it becomes one leaf. |
| backend-quality | W7 | partial | 0 named: 0 on a kept ref, 0 unmerged, 0 do not resolve | none | No commit or state is recorded; partial is not supported by evidence. |

## Proposed remaining leaves

| Leaf | Title | Acceptance | Checklist entries |
|---|---|---|---|
| whole-language.canonical-matrix | Run the canonical language matrix on the core | The 42-case source-backed language matrix passes in normal and spill modes on the core at a commit on the integration branch, with a committed receipt. |  |
| whole-language.io-write-result | Return the file from io.write on the core | io.write returns its file on the core, checked by a guest case against reference Lua 5.5. |  |
| runner-on-core.residual-failures | Fix the classified runner residual failures | On the integration head, the residual classifier shows each of the 34 executed-case failures and the beforeAll failure (17 blocked cases) fixed or filed as its own task. |  |
| runner-on-core.fresh-gate | Pass the fresh runner gate on combined source | The runner's fresh gate passes on one combined source commit on a kept ref, with loadfile served from precompiled core chunks checked against the source digest. |  |
| runner-core-hangs.restore-source-commits | Restore the two runner-hangs source commits | 61854bd12 and 5019a6664, or equal changes, are on the integration branch, and the source check reports 0 errors. |  |
| runner-core-hangs.five-suite-acceptance | Finish the five hung suites under the runner on the core | discardtest, incrementaltest, reifiablerecordtest, unusedtest and vmqualifiedcleanuptest finish under the packaged runner on the core within 120 seconds in total, with no CPU spin. |  |
| compiler-self-build-on-core.emitter-phase-markers | Add flushed emitter module and phase markers | An opt-in flag makes one bounded actual CLI build on the core print the module and phase it is in, so a timeout names where it stopped. |  |
| compiler-self-build-on-core.core-built-image | Build the compiler image on the core and compare it | nupp build of the compiler target finishes on the core, and its image is compared with the host-built image, with every difference listed. |  |
| cold-rebuild.quiet-cold-under-120 | Measure a quiet cold rebuild under 120 seconds | A quiet cold self-rebuild (fresh emit cache, warmed unchanged Rust, no other builds) at a commit on a kept ref finishes under 120 s and reproduces the compiler image byte for byte. |  |
| frontend-build-speed.function-profile | Profile frontend emission by function | A cold-emit profile with function-level attribution is committed, naming the five functions that take the most time. |  |
| frontend-build-speed.emit-reduction | Cut cold frontend emission time | Matching-pair ABBA runs show cold emission at least 5% faster, with unchanged diagnostics, emitted semantics and zero new compiler duplicates. |  |
| byte-types.combined-guest-gate | Pass the combined byte-types guest gate | The combined byte-types candidate passes the full guest gate, the shared baseline comparison and the pinned fixpoint on a commit on a kept ref. |  |
| nominal-metadata.restore-isolated-fix | Restore the nominal-metadata fix | c89c2af8f, or an equal change, is on the integration branch and its 54 actual-source cases pass there. |  |
| nominal-metadata.roundtrip-stable-metadata | Keep reflection metadata stable across interface round trips | A test shows reflection construction and copyability metadata unchanged after an interface round trip, without erasing metadata or equating descriptors. |  |
| value-layouts.packed-array-parts | Packed {T} array parts with representation switches | Tables with packed {T} array parts switch representation as Decision 15 says, with guest cases passing on the core. | plan-87db0a5efd7aa21b65 |
| value-layouts.set-table-kinds | Table kinds the Set plan needs | The table kinds the Set plan names exist on the core, with guest cases passing. |  |
| schema-roots.register-at-declaration | Register types at their declaration | Type registration moves to the declaration, so a type first seen through a witness after its first instance still has its reflect member; a guest case shows it. |  |
| root-retirement.root-accounting | Finish root enumeration, accounting and storage retirement | Root enumeration, accounting and storage retirement left after the cycle-control31 cut are done, and collector metadata never needs a collected allocation to make progress. | plan-0f07822f8675afd6bd |
| root-retirement.owner-roots | Declaration, metamethod and code-owner roots | Declaration, metamethod and code-owner roots, schema and prototype caches, and insertion barriers are rooted and covered by collector units. | plan-889ae1a1baf70b89f1, plan-782d4a426a6b63db46 |
| shared-resources.userdata-lifetime | Userdata __gc, byte payload and host lifetime | Full userdata supports __gc, a byte payload and a host lifetime on the core, with guest cases. |  |
| shared-resources.shared-moved-buffers | Shared and moved buffers with destination restore | Immutable shared and moved buffers and resource payloads work on the core, with host lifetimes kept and destination restore tested. | plan-f0f0e297d238baaeed, plan-dbc12244c0640956a0 |
| generational-gc.root-entry-generations | Generations in the root-entry heap service | The root-entry heap service runs with generations, and collector units pass with and without collect-at-every-allocation. |  |
| generational-gc.pacing-parameters | collectgarbage parameters steer pacing | The collectgarbage parameters change pacing on the core, shown by a unit that measures collections under two settings. |  |
| memory-stress.semantic-oracles | Independent semantic oracles for stress runs | Stress runs check results against an oracle independent of the collector's reachability oracle, and the claimed-target acceptance passes. | plan-346f3777fea773d798 |
| parallel-aot-build.linux-windows-linking | Actual host linking on Linux and Windows | Parallel AOT links with the real host linker on Linux x64 and Windows x64 with a supported compiler pair, and the report states each platform's coverage. |  |
| parallel-aot-build.inflight-cancellation | In-flight failure and cancellation coverage | Tests fail and cancel a child during a parallel AOT stage, and show it is cleaned up and no partial generation is selected. |  |
| task-runtime.constructor-acceptance | Accept the shared coroutine constructor on the core | A matching compiler rebuild passes the real-core acceptance cases for the shared main/core coroutine constructor. |  |
| task-runtime.handler-inheritance-audit | Audit main's coroutine handler inheritance on the core | Main's flattened coroutine constructors and inherited handlers run on the core path, with cases for closed extents, cancellation and drain. |  |
| reactor.scheduler-wiring | Wire the reactor into the scheduler | The scheduler calls reactor wait instead of sleeping, and a guest case shows parked tasks resuming on completions. |  |
| reactor.completion-ports | Completion-port backend | The reactor runs on Windows completion ports and passes the reactor cases on Windows x64. |  |
| reactor.sockets | Sockets on the reactor | Nonblocking sockets are reactor sources, with connect, accept, read and write cases on the core. |  |
| reactor.epoll-run | Run the epoll backend on Linux | The epoll backend, compile-checked only today, passes the reactor cases on Linux x64. |  |
| process-file-layers.windows-processes | Processes on Windows | The process layer uses CreateProcessW and job objects, and the process cases pass on Windows x64. |  |
| process-file-layers.linux-pidfd-run | Run the pidfd exit path on Linux | The pidfd exit path, compile-checked only today, passes the process cases on Linux x64. |  |
| process-file-layers.timeout-ms | Process timeoutms | Process waits accept timeoutms and report a timed-out exit, with a case. |  |
| io-diagnostics.setvbuf-buffering | Hold buffered file bytes as setvbuf says | A fully or line-buffered file holds bytes until flush, close, setvbuf, a read or seek switch, or program end, matching main and Lua, with cases. |  |
| io-os-library.named-calls-park | Park name-based os calls on the pool | os.remove, os.rename and os.tmpname park the task on the reactor's pool instead of blocking the thread, with cases. | plan-eb70097250f91586ea |
| cancellation-stale.teardown-restore-cases | Cancellation across teardown, restore and replacement | Cases cancel parked work across teardown, restore and replacement and show stale completions are dropped, using actual worker execution. | plan-9a68da7c89ae70b41a |
| image-identity.image-orchestration | Final image and schema orchestration | Module-loading's remaining final image and schema orchestration runs on the core, with loader cases. |  |
| image-identity.untrusted-image-validation | Validate untrusted images and raw input | Loading an untrusted image or raw input validates it fully, and malformed images are refused with cases. | plan-a6493635f6cd5b0bed |
| image-identity.one-image-format | One current image format | One current image and ABI is used and older image readers are removed. | plan-79b06712e6d46d3dec |
| library-layout.remove-nupp-global | Remove the nupp global and nupp.* names | No nupp global or nupp.* name remains; each capability lives where Decision 10 puts it, and every caller is ported. |  |
| library-layout.delete-legacy-modules | Delete the legacy nupp modules | nupp.test, nupp.util, nupp.host, nupp.io.process, nupp.text, nupp.random, nupp.system, nupp.time and nupp.runtime.hotreload are deleted, and suites and docs pass. |  |
| remove-providers.delete-spi-contracts | Delete the SPI contract modules | The SPI contract modules, their select call sites and the LuaJIT-host providers are deleted. | plan-1e50b5abd6792e69e4 |
| remove-providers.per-target-conformance | Per-target conformance suites | Provider suites run as per-target conformance suites, and package.providers stays tested on fixture packages. |  |
| lua-library.luajit-removals | Remove the LuaJIT library additions | The LuaJIT library additions that Decision 12 removes are gone, with suites passing. |  |
| lua-library.assert-suite | assert as a table and assert.suite | assert and assert.suite work as Decision 12 says, with cases. |  |
| lua-library.arg-metatable | arg's metatable | arg has the metatable Decision 12 gives it, with a case. |  |
| lua-library.exit-suffix-pcall | pcall and xpcall in exit suffixes | pcall and xpcall in exit suffixes are tested for success, raise, xpcall's handler and forwarding. |  |
| io-extensions.reader-nil-eof | nil at end of input across Reader | Every Reader and its callers return nil at end of input, with cases. |  |
| io-extensions.buffer-methods | bytes.Buffer methods and SharedBytes | bytes.Buffer's methods and transitional bytes.SharedBytes work on the core, with cases. |  |
| io-extensions.remove-string-buffer | Remove string.buffer and the queue protocol | string.buffer and the queue protocol are removed as byte-types.md says. |  |
| number-model.sized-types | Sized type names and fixed-width types | The sized type names and fixed-width types work as ordinary types with per-type namespaces. |  |
| number-model.f32-and-math | f32 operators and type-directed math | f32 operators, type-directed math and bit functions work, with no implicit fused multiply-add on any tier and math.fma explicit. | plan-5f865f1b1d4c9f79fb, plan-edaf2da345bf5d0026 |
| records-structs.protocol-clause-order | Protocol clauses before the return type | The parser, checker and nupp fmt accept and write protocol clauses before the return type, and the reference and guides show it. | plan-b998a64b7d4ec5f975 |
| records-structs.struct-storage | Records and structs storage | Records and structs use the Decision 14 and 15 storage on the core, with guest cases. |  |
| general-ffi.guest-ffi-routine | Guest-program FFI through one generic call routine | Guest programs call foreign functions through one selector-emitted generic call routine, with cases for scalar, pointer and mixed arguments. |  |
| general-ffi.small-struct-returns | Small struct returns in the ARM64 selector | The selector returns small structs by value, with cases. |  |
| general-ffi.linux-host-modules | Choose host modules per target at build time | Linux builds select hostepoll and the Linux host modules at build time, and the I/O cases pass on Linux x64. |  |
| lua-differences.differences-page | Write the Differences from Lua page | docs/learn/language/ has a Differences from Lua page listing every seeded difference, each with a short example and the reason. | plan-ca0e0b1873400b22f3 |
| zero-python.core-proof-drivers | Move the core proof drivers to Nupp | native/core/tests/*.py are replaced by Nupp suites with every case kept. |  |
| zero-python.oracle-driver | Move the Lua oracle driver to Nupp | The Lua oracle driver is a Nupp tool and its selftests pass. |  |
| zero-python.ci-scripts | Move spike scripts and CI scripts to Nupp | Spike scripts and .github/scripts are Nupp tools, and no .py file remains. |  |
| docs-tools.port-or-remove-consumers | Port or remove LuaRocks, docs and dev-tool consumers | No LuaRocks, documentation or development-tool consumer of the old runtime remains, and the LuaJIT pins, patches and fetch paths are deleted. | plan-0a09dd1cb67d9779c3 |
| bridge-consolidation.remaining-imports | Move the remaining bridge imports to Nupp | Number text and math, streams and startup facts, clocks, randomSeed, securefill, systemquery and loader imports are Nupp over FFI; only process entry, mapping, threads, dlopen/dlsym, errno and trampoline memory stay native. |  |
| bridge-consolidation.crate-consolidation | Consolidate the bridge crates and recount the budget | Bridge crates, manifests and features are consolidated, unused knobs deleted, and the Rust budget is recounted on the final artifact. | plan-ffab8e7450a71b9592 |
| target-parity.browser-wasm | Browser and Wasm paths | The browser and Wasm targets build and pass their suites. |  |
| target-parity.gpu-simd-matrix | GPU providers and the SIMD matrix | GPU provider paths and the SIMD matrix pass on the core. | plan-986d404ca6bd5ebfff, plan-c3c2ef0b4bfdf0a3e3 |
| target-parity.no-codegen-delivery | No-codegen delivery with executable memory denied | A no-codegen build runs its suite with executable memory denied. | plan-7a1470a85e901304b2 |
| target-parity.console-abis | Console ABIs on real SDKs | Supported console ABIs are validated with their real SDKs. |  |
| packaged-runner.reinventory | Re-inventory the runner after runtime code loading | The lowering and admission inventory of the runner's carried modules is rerun on the integration head and each remaining refusal is filed as a task. |  |
| packaged-runner.core-failure-set | Run the compiled runner on the core and record failures | The real testRunner runs on the core with no shim or skipped case, and every runtime failure is recorded per suite, each filed as a task. |  |
| numeric-loop-specialization.static-for-pruning | Prune statically known numeric-for arms | The shared graph drops the unused float or integer arm, the proven-zero guard and the unselected direction for static numeric for loops, keeps overflow semantics, and bytecode counts are re-measured against the pinned receipt. |  |
| backend-quality.machine-ir-lowering | Lower through machine IR | New lowering targets machine IR, not CLIF text, through the backend S0 chose. | plan-a1e5b552e64c3ad4da |
| backend-quality.selection-quality | Selection, allocation and encoding quality | Owned selection, allocation and encoding have independent MIR and code tests, with per-instruction results recorded. | plan-7cc1fc3b125719e199 |

## Commit-like words on no kept ref

A word here does not resolve to a commit on a kept ref: a commit only on a deleted branch or in an archive, or a digest that is not a commit.

| Task | Commits |
|---|---|
| runner-on-core | `6fa2b3199cd9` does not resolve, `799446b4b7b9` does not resolve, `424d6f99d7a8` does not resolve, `ab8533686dab` does not resolve, `5019a6664` does not resolve |
| runner-core-hangs | `61854bd1202683fd379c7a58204c8a2855a3ff88` does not resolve, `5019a6664d68de48d9e0c795612ffa54426fc3d9` does not resolve |
| compiler-self-build-on-core | `efa3b1729c59` does not resolve, `7fff0000000001ff` does not resolve, `71c355622033` does not resolve |
| cold-rebuild | `ce0d88e3d` does not resolve |
| byte-types | `8919d6321` does not resolve |
| nominal-metadata | `c89c2af8f` does not resolve |
| value-layouts | `c89c2af8f` does not resolve |
| shared-resources | `1a15386bf` does not resolve |
| io-diagnostics | `5d888c9b3` does not resolve |
| io-os-library | `5d888c9b3` does not resolve, `431910bf3` does not resolve |
| shared-compiler-baseline | `5d0c81dc5` does not resolve, `f24112cfb` does not resolve, `9c8a3b8be` does not resolve, `babc0538f` does not resolve |
| shared-compiler-sharing-pilot | `babc0538f` does not resolve |
