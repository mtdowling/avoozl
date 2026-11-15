# Radar-coder Proof 7, live: Set up end to end

Receipt for task `rc-p7`. The fake-GitHub run is
`docs/evidence/radar-coder-proof-7-fake-github.md`.

- Recorded: 2026-11-15, Linux, Kiro Crew 0.12.2.4 harness (own home, port
  5692), Avoozl CLI from `main` at `30f9cbd` plus PR #220.
- GitHub: private scratch repository `mtdowling/avoozl-scratch-6`, created
  empty for this run.
- Verdict: **FAIL (partial).** Every `gh` step wrote once and read back. The
  Radar values re-read ticked 6 of 8 items; model and prompt stayed "cannot
  verify", and the pack's models were not shown.

## Commands

```
avoozl radar.setup --json '{"repository":"mtdowling/avoozl-scratch-6"}' --as-person
avoozl radar.setup --json '{"repository":"...","confirm":true,"step":"labels","previewHash":"..."}' --as-person
# same for auto-merge and agents-pr
avoozl plugins add sdk-team --path <folder with examples/sdk-team/avoozl-pack.json and a pack-only manifest> --as-person
avoozl plugins approve sdk-team --hash ... --as-person
avoozl plugins pack-preview sdk-team --repo mtdowling/avoozl-scratch-6 --as-person
avoozl plugins pack-import sdk-team --preview ... --repo ... --confirm-public --as-person
# Radar steps done with harness.sh crew-create / crew-edit / radar-settings
radar.values, with Radar's crew list read from the harness crews route
```

## Observation

| Step | Result |
| --- | --- |
| labels | done; read back the six labels; after the pack, `to plan` and `merge conflict` created and read back |
| auto-merge | done; read back "allows auto-merge" (`allow_auto_merge` true on GitHub) |
| agents-pr | done; PR #7 "Add review rules for crews to AGENTS.md" |
| merge-method | ok, nothing to do |
| branch-rule | input: needs a CI check name; the scratch repository has no CI |
| project | input: needs a Project; not created, so no Project was made on the account |
| pack | preview listed 5 changes; import wrote them to `.avoozl.json` only after `--confirm-public`; no crew was created |
| re-read | repository, crew name, agent, scope, needs-human, claim limit: ok. model: cannot verify (shows `auto`, the pack says `model-a`, `model-b`). prompt: cannot verify |

## Findings

- Radar's crew read carries `model` and `extra_prompt` for each crew, but
  `radar.values` treats both as unreadable. It could tick or fail them.
- With the pack applied, the model value still shows `auto`, so the shown
  value does not match the pack. That is the failure the proof names.
- `examples/sdk-team/` has only `avoozl-pack.json`. `plugins add` needs an
  `avoozl-plugin.json`, so the example cannot be added as shipped.
- The app backend answers only gateway-signed page requests, so the re-read
  used a script that calls the same Radar route with the harness token.

Not fixed here.
