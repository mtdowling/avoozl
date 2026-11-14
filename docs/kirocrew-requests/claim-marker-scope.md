# Request: put the skip scope in the claim marker

Status: draft. Not filed anywhere. A person files it.

## What we ask

When a crew skips an issue, write the skip scope as a key in the claim
comment's machine marker, on the same marker line:

```
<!-- kirocrew-crew v=1 id=<crew-id> phase=skipped scope=needs-decision pr= updated=<ISO8601 Z> -->
```

The key is `scope`. Its value is one of the skip scopes the crew brief already
names (`architecture`, `new-feature`, `needs-design`, `needs-decision`,
`needs-investigation`, `duplicate`, `wrong-root-cause`, `breaking-change`,
`gate-config`, `other`). Write it only on a `skipped` marker. Readers that do
not know the key can ignore it, so `v=1` may stay.

## Why

A tool that reads a crew's skip today has to parse the visible second line of
the comment (`skipped · duplicate · updated 05:04 UTC`). That line is prose for
people. It can change wording, order or language, and a reader that guesses
wrong reports the wrong reason. The marker is the part of the comment meant for
machines, and it is the only part with a version. Avoozl reads skip scopes to
show why a task was skipped and to decide what needs a person.

## What was checked

Release checked: Kiro Crew 0.12.2.4. The claim comment format in the crew brief
and the ledger spec lists `v`, `id`, `phase`, `pr` and `updated`, in that
order, and says not to invent fields. The scope appears only in the visible
second line. No `scope` key exists in that release.

## Re-check

On each new Kiro Crew release, read a skip comment's marker and record whether
`scope=` is there. Record the release and the answer here:

| Release | `scope=` in the marker |
| --- | --- |
| 0.12.2.4 | no |
