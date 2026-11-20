---
repo: avoozl
---
# Tasks

## Facts

- [x] `cf-1` Read the facts, layout and front matter [CF1, CF2, CF3, CF4, CF5] (§1)
  - $done: Every refused fact and key is a lint error at its line, naming it
  - $done: Nesting gives a task's kind and the `##` heading its phase
  - $done: A leaf's plain bullets are its results when it has no `$done`
  - $done: Every spec in the repository lints with 0 errors
  - $done: `docs/specs.md` lists every fact the reader takes, checked by a test
- [x] `cf-2` One session and worktree per ready leaf (§2)
  - $after: cf-1
  - $done: The tick dispatches each ready leaf alone
  - $done: The worker's harness comes from the role setting
