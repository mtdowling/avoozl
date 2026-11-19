---
completion: integrated
---

# Tasks

- [ ] migration-tool Build the tool or compatibility layer
  - $done: The tool migrates a sample repository and its tests pass.
- [ ] migrate-repo-a Migrate the first repository
  - $done: The repository uses the new way and its own check passes.
  - $after: migration-tool
- [ ] migrate-repo-b Migrate the second repository
  - $done: The repository uses the new way and its own check passes.
  - $after: migration-tool
- [ ] remove-old-path Remove the old path
  - $done: No repository uses the old way.
  - $after: migrate-repo-a, migrate-repo-b
