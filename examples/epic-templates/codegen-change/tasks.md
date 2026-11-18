---
completion: integrated
checks: npm test
---

# Tasks

Status: Draft

- [ ] change-generator Change the generator and its tests
  - Facts:
    - summary: Change the generator and add its tests.
    - done:
      - The generator tests pass.
- [ ] regenerate-sample Regenerate one sample and review the diff
  - Facts:
    - summary: Regenerate one sample with <generate command> and compare it with <compare command>.
    - done:
      - The sample diff is small, reviewed and matches <compare command>.
    - after: change-generator
- [ ] regenerate-batch-1 Regenerate the first batch
  - Facts:
    - summary: Regenerate the first batch with <generate command> and compare it with <compare command>.
    - done:
      - <compare command> reports no unexpected change in the first batch.
    - after: regenerate-sample
- [ ] regenerate-batch-2 Regenerate the second batch
  - Facts:
    - summary: Regenerate the second batch with <generate command> and compare it with <compare command>.
    - done:
      - <compare command> reports no unexpected change in the second batch.
    - after: regenerate-batch-1
- [ ] remove-old-output Remove the old output
  - Facts:
    - summary: Remove the old output.
    - done:
      - No file of the old output remains and every check passes.
    - after: regenerate-batch-2
