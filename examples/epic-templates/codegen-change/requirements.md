# Large generated change: <what the generator changes>

Status: Draft

Avoozl is for epics: approved goals that need many changes in a set order. Maintenance, triage and one-off pull request handling belong to Issue Radar crews or to your team's coder. Avoozl can hand each task of an epic to any coder.

## Goal

Change the generator, then regenerate its output in reviewable steps.

## Requirements

1. The generator change has its own tests.
2. One sample is regenerated and its diff is reviewed before the rest.
3. Every regeneration task names the command it runs and the check that compares the output.
