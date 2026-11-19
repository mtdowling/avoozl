---
completion: integrated
---

# Tasks

- [ ] `change-generator` Change the generator and its tests
  - $done: The generator tests pass.
- [ ] `regenerate-sample` Regenerate one sample and review the diff
  - $done: The sample diff is small, reviewed and matches <compare command>.
  - $after: change-generator
  - Regenerate one sample with <generate command> and compare it with <compare command>.
- [ ] `regenerate-batch-1` Regenerate the first batch
  - $done: <compare command> reports no unexpected change in the first batch.
  - $after: regenerate-sample
  - Regenerate the first batch with <generate command> and compare it with <compare command>.
- [ ] `regenerate-batch-2` Regenerate the second batch
  - $done: <compare command> reports no unexpected change in the second batch.
  - $after: regenerate-batch-1
  - Regenerate the second batch with <generate command> and compare it with <compare command>.
- [ ] `remove-old-output` Remove the old output
  - $done: No file of the old output remains and every check passes.
  - $after: regenerate-batch-2
