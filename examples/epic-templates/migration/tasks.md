---
completion: integrated
---

# Tasks

Status: Draft

- [ ] migration-tool Build the tool or compatibility layer
  - Facts:
    - done:
      - The tool migrates a sample repository and its tests pass.
- [ ] migrate-repo-a Migrate the first repository
  - Facts:
    - done:
      - The repository uses the new way and its own check passes.
    - after: migration-tool
- [ ] migrate-repo-b Migrate the second repository
  - Facts:
    - done:
      - The repository uses the new way and its own check passes.
    - after: migration-tool
- [ ] remove-old-path Remove the old path
  - Facts:
    - done:
      - No repository uses the old way.
    - after: migrate-repo-a, migrate-repo-b
