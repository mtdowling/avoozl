# Spec details: Links box (task 44.2, 2026-11-17)

The spec details panel gains a **Links** box after Repositories. It lists
the spec issue, the working branch, each open pull request with a check
dot, and the Radar issues the spec came from. A dot is green when checks
passed, amber while they run, red when they failed, and grey when the
stored checks are for an older commit; its tooltip says which and how old
the read is. Every link opens a new tab with `rel="noopener noreferrer"`.
A missing record shows as None.

The box reads `plan.get`'s new `links` field, built by
`src/app/scm-links.mjs` from stored records only, so it adds no GitHub
call.

- `before/spec-<width>-<theme>.png`: `origin/main`, the panel with no Links
  box.
- `after/links-<width>-<theme>.png`: a fixture link set (an issue, a
  working branch, three open pull requests: passed, running, older commit;
  one Radar issue).
- `after/none-<width>-<theme>.png`: the same spec with no stored records.

Shots are the full app in demo mode with Kiro Crew's own stylesheet, at
1280 and 390 px, light and dark. All names are made-up `example/*`
repositories. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/spec-links-shots.mjs <out>
