# Large generated change: <what the generator changes>

Specs can be any size. A light spec with one task becomes one pull request. A large one becomes ordered tasks across repositories, each checked on its exact commit before it lands.

## Goal

Change the generator, then regenerate its output in reviewable steps.

## Requirements

1. The generator change has its own tests.
2. One sample is regenerated and its diff is reviewed before the rest.
3. Every regeneration task names the command it runs and the check that compares the output.
