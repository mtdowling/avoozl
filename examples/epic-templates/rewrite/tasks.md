---
completion: integrated
checks: npm test
integrationBranch: rewrite/my-epic
integrationSync: weekly
---
# Tasks

Status: Draft

- [ ] port-module-a Port the first module behind the new interface
  - Facts:
    - summary: Port the first module.
    - done:
      - The first module passes its own tests on the new interface.
- [ ] port-module-b Port the second module, after the first
  - Facts:
    - summary: Port the second module.
    - done:
      - The second module passes its own tests on the new interface.
    - after: port-module-a
- [ ] port-module-c Port the third module, after the first
  - Facts:
    - summary: Port the third module.
    - done:
      - The third module passes its own tests on the new interface.
    - after: port-module-a
- [ ] switch-callers Switch the callers to the new part
  - Facts:
    - summary: Switch the callers to the new part.
    - done:
      - No caller uses the old part.
    - after: port-module-b, port-module-c
- [ ] remove-old-code Remove the old part
  - Facts:
    - summary: Remove the old part.
    - done:
      - The old part is gone and every check passes.
    - after: switch-callers
