# {{sdk}} SDK rewrite design

## Overview

The new {{sdk}} SDK is generated from the service models and runs on the new
runtime. Work moves in six phases: inventory, codegen, runtime, protocol
tests, a team review, and cutover.

## Phases

- Inventory: the old SDK's operations and features, and the gap list.
- Codegen: the client generated from the models, compared with the old one.
- Runtime: transport, auth, retries and paging on the new runtime.
- Protocol tests: the protocol test suite, run until it passes.
- Review: the team reviews the results. A person does this step.
- Cutover: callers switch, after a dry run, with release notes.
