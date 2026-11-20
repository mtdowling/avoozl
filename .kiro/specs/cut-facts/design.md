# Design

## 1. Reader

`src/app/specs/spec-facts.mjs` holds the table of facts the reader takes
(`KEYS`) and the table of refused facts and front-matter keys, each with
the message lint shows. `readFacts` fills `kind` from nesting and the repo
default on each leaf. `parseSpec` takes a leaf's plain bullets as its
results when it has no `$done`, and its phase from `headingPhases`.

## 2. Delivery

Avoozl hands each ready leaf to its own session and worktree. The role's
harness in Settings › Models picks how it runs. A repository with no checks
gets a verifier chat. The repository's landing setting says how work ships.
