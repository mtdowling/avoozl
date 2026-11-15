# Radar-coder Proof 7, live: Set up end to end

Receipt for task `rc-p7`. The fake-GitHub run is
`docs/evidence/radar-coder-proof-7-fake-github.md`.

This is the second live run. The first run (2026-11-15, scratch repository
`mtdowling/avoozl-scratch-6`) was a partial fail: the values re-read ticked 6
of 8 items and left model and prompt at "cannot verify".

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home
  `/tmp/avoozl-live-p7-10`, port 5697), Avoozl CLI from `main` at `e46cc5a`.
- GitHub: new private scratch repository `mtdowling/avoozl-scratch-7`
  (scratch-6 held issues and pull requests from other proofs).
- Verdict: **PASS.** All eight values tick against the real Issue Radar crew
  read.

## Cause of the first failure

`crewsOf` in `src/app/radar-handoff.mjs` dropped `model` and `extra_prompt`
from Radar's crew read, so `radar.values` could not tick them. Main already
keeps them (and the agent and claim limit) when Radar returns them. The first
run used a build from before that change. This run uses the fixed code, so
nothing in `radar.values` changed.

A second gap was real: `examples/sdk-team/` had only `avoozl-pack.json`, and
`plugins add` needs `avoozl-plugin.json`, so the shipped example could not be
added. This run's PR adds the manifest and a test
(`src/app/test/crews-pack.test.mjs`, "the shipped sdk-team example folder has
a manifest plugins add accepts").

## Commands

```
harness.sh start            # AVOOZL_HARNESS_DIR=/tmp/avoozl-live-p7-10 PORT=5697 REPO=scratch-7
avoozl plugins add sdk-team --path <sdk-team folder> --as-person
avoozl plugins approve sdk-team --hash ... --as-person
avoozl plugins pack-preview sdk-team --repo mtdowling/avoozl-scratch-7 --as-person
avoozl plugins pack-import sdk-team --preview ... --repo ... --confirm-public --as-person
avoozl radar.setup --json '{"repository":...,"confirm":true,"step":S,"previewHash":H}' --as-person
harness.sh crew-create avoozl-avoozl-scratch-7 '{"model":"model-a","labels":["ready"],"extra_prompt":<pack prompt>,"max_open":1}'
radar.values with the crew list read from the harness crews route
```

## Observation

| Step | Result |
| --- | --- |
| pack preview | 5 changes (plan label, conflict label, review rules, crew values; ready kept) |
| pack import | written to `.avoozl.json` after `--confirm-public`; no crew created |
| labels | done; `to plan`, `ready`, `merge conflict` and 4 `avoozl:` labels read back |
| auto-merge | done; `allow_auto_merge` true on GitHub |
| agents-pr | done; pull request #1 "Add review rules for crews to AGENTS.md" |
| branch-rule, project | input: need a CI check name and a Project; scratch has neither, none made |
| set up again | every changed step `ok` |
| values, before the crew | crew-name differs; agent, model, scope, prompt cannot verify (no crew) |
| values, after the crew | repository, crew name, agent, model, scope, needs-human, claim limit, prompt: **all 8 ok** |
| values, crew model set to `auto` | model `differs`; set back, 8 of 8 ok |

## Not done

Branch rule and Project steps need a CI check and a Project the scratch
repository does not have. The crew is created paused and never ran in this proof.
