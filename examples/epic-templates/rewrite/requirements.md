# Rewrite: <what is being rewritten>

Status: Draft

Specs can be any size. A light spec with one task becomes one pull request. A large one becomes ordered tasks across repositories, each checked on its exact commit before it lands.

## Goal

Replace <old part> with <new part> without half-landing a change in the default branch.

## Requirements

1. The new part passes every check the old part passes.
2. Each task lands as a small pull request into the integration branch.
3. The branch lands in the default branch in one step that a person approves.
