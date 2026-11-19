# Migration: <what changes in every repository>

Specs can be any size. A light spec with one task becomes one pull request. A large one becomes ordered tasks across repositories, each checked on its exact commit before it lands.

## Goal

Move every repository from <old way> to <new way>, with one check per repository.

## Requirements

1. A tool or compatibility layer exists before any repository changes.
2. Each repository change passes its own check.
3. The old way is removed only after every repository has moved.
