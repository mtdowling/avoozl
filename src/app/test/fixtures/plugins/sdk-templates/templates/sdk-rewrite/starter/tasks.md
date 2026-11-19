# {{sdk}} SDK rewrite tasks

## Inventory

- [ ] inventory-operations List the operations and features of the {{sdk}} SDK
  - Facts:
    - repo: {{repository}}
    - done:
      - A list in the design names every operation and feature of the current {{sdk}} SDK
  - Write down every operation and feature the current {{sdk}} SDK has.
- [ ] inventory-gaps Read the gap list and add a task for each gap
  - Facts:
    - repo: {{repository}}
    - done:
      - Each gap in the gap list has a task in this spec
    - after: inventory-operations

## Codegen

- [ ] codegen-client Generate the client from the models
  - Facts:
    - repo: {{repository}}
    - done:
      - The generated client builds
    - after: inventory-operations
- [ ] codegen-compare Compare the generated client with the old one
  - Facts:
    - repo: {{repository}}
    - done:
      - Every difference from the old client is listed and explained
    - after: codegen-client

## Runtime

- [ ] runtime-port Port transport, auth, retries and paging
  - Facts:
    - repo: {{repository}}
    - done:
      - Requests are sent, signed, retried and paged on the new runtime
    - after: codegen-client

## Protocol tests

- [ ] protocol-tests-run Run the protocol test suite until it passes
  - Facts:
    - repo: {{repository}}
    - done:
      - The protocol test suite runs against the new client
    - after: runtime-port, codegen-compare
  - Run the protocol test suite and fix what fails.
- [ ] protocol-tests-proof Proof: protocol tests pass
  - Facts:
    - repo: {{repository}}
    - done:
      - Every protocol test passes against the new client
    - after: protocol-tests-run

## Review

- [ ] team-review Review with team
  - Facts:
    - repo: {{repository}}
    - done:
      - The team agreed the runtime and protocol results are good enough to cut over
    - after: protocol-tests-proof
    - manual: true
  - The team reviews the runtime and protocol results before cutover.

## Cutover

- [ ] cutover-callers Switch callers to the new client
  - Facts:
    - repo: {{repository}}
    - done:
      - Every caller uses the new client
    - after: team-review
- [ ] cutover-dry-run Proof: cutover dry run
  - Facts:
    - repo: {{repository}}
    - done:
      - The callers' own tests pass against the new client with no change to their code
    - after: cutover-callers
- [ ] cutover-notes Write the release notes
  - Facts:
    - repo: {{repository}}
    - done:
      - The release notes list every change callers can see
    - after: team-review
