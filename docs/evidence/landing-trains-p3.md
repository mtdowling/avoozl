# lt-p3 receipt: a red train lands the rest
## gated
Train train-cb77a1999431: outcome landed, culprits ["t5"], flaky [{"platform":"macos-arm64","suite":"core"}].
- OBSERVED: the flake (member 2's core suite on macOS) was recorded and ignored
- OBSERVED: member 5 was named
- OBSERVED: every probe and rerun ran only the failing suite on the failing platform (5 runs after the first full run, all linux-x64:net)
- OBSERVED: member 5's chat got the suite, the platform and a log excerpt
- OBSERVED: seven landed (7 commits on the trunk)
- OBSERVED: no forced update on any ref
## optimistic
Train train-ffdc76db436a: outcome partly-landed, culprits ["t5"], flaky [{"platform":"macos-arm64","suite":"core"}].
- OBSERVED: the flake (member 2's core suite on macOS) was recorded and ignored
- OBSERVED: member 5 was named
- OBSERVED: every probe and rerun ran only the failing suite on the failing platform (5 runs after the first full run, all linux-x64:net)
- OBSERVED: member 5's chat got the suite, the platform and a log excerpt
- OBSERVED: one revert commit
- OBSERVED: the trunk is green after the revert (bad.txt is gone)
- OBSERVED: the train counts as validated
- OBSERVED: no forced update on any ref

Run 2026-11-18T07:38:53.844Z on linux with git git version 2.50.1.
