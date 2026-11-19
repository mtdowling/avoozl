---
completion: integrated
checks: npm test
integrationBranch: rewrite/my-epic
integrationSync: weekly
---

# Tasks

- [ ] port-module-a Port the first module behind the new interface
  - Facts:
    - done:
      - The first module passes its own tests on the new interface.
- [ ] port-module-b Port the second module, after the first
  - Facts:
    - done:
      - The second module passes its own tests on the new interface.
    - after: port-module-a
- [ ] port-module-c Port the third module, after the first
  - Facts:
    - done:
      - The third module passes its own tests on the new interface.
    - after: port-module-a
- [ ] switch-callers Switch the callers to the new part
  - Facts:
    - done:
      - No caller uses the old part.
    - after: port-module-b, port-module-c
- [ ] remove-old-code Remove the old part
  - Facts:
    - done:
      - The old part is gone and every check passes.
    - after: switch-callers
