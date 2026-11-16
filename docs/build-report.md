# Build report, version 1

A build report says where one build's time went. A repository writes it
with its own tooling. Avoozl reads it, stores it, shows it in Flow and
the retrospective, and compares it only with reports that did the same
work. Avoozl adds no budget, limit or profiler. Keep those in the
repository and write their results into the report as parts or counters.

The parser is `parseBuildReport` in `src/app/build-report.mjs`.

## Fields

| Field                             | Type                                            | Required |
| --------------------------------- | ----------------------------------------------- | -------- |
| `format`                          | `"avoozl.build-report"`                         | yes      |
| `v`                               | `1`                                             | yes      |
| `workload`                        | string, at most 80                              | yes      |
| `engine`                          | string, at most 80                              | yes      |
| `target`                          | string, at most 80                              | yes      |
| `toolchain`                       | string, at most 120 (a toolchain or seed ID)    | yes      |
| `cache`                           | string, at most 32 (the cache mode)             | yes      |
| `costs`                           | `build`, `provisioning`, `cache`, `test`: ms    | yes      |
| `parts`                           | at most 32 of `{name, kind, ms}`, `kind` a cost | no       |
| `counters`                        | at most 16 names (at most 64) to numbers        | no       |
| `task`, `attempt`, `commit`, `at` | as in a build receipt line                      | no       |

Every cost and part `ms` is a number of milliseconds, 0 or more. A part
`name` is a string of at most 80.

Example:

```json
{
  "format": "avoozl.build-report",
  "v": 1,
  "workload": "widget-suite",
  "engine": "engine-a",
  "target": "target-x",
  "toolchain": "seed-0001",
  "cache": "warm",
  "costs": { "build": 1200, "provisioning": 300, "cache": 50, "test": 4000 },
  "parts": [{ "name": "compile-gadget", "kind": "build", "ms": 900 }],
  "counters": { "units": 42 }
}
```

## Skipped reports

A report is skipped and counted, never guessed, when:

- `format` is not `avoozl.build-report` or `v` is not `1` (`version`);
- a required field is missing (`missing:<field>`);
- a field has the wrong type or is too long (`invalid:<field>`);
- the value is not an object (`not-object`), or an artifact line is not
  JSON (`json`).

## Comparison key

Two reports are compared only when `workload`, `engine`, `target`,
`toolchain` and `cache` are all present and all equal. `comparisonKey`
returns those five joined, or null when any is missing. A report with a
null key is compared with nothing.

## Where reports are

Name the place in `receipts.report` of the repository's `.avoozl.json`.
With no `report`, Avoozl reads none.

Field form. Each build receipt line may carry a report object at the named
field. A line without the field has no report. The line's `task`,
`attempt`, `commit` and `at` fill those the report leaves out. The field
cannot be one of the receipt line's own fields.

```json
{ "receipts": { "report": { "field": "breakdown" } } }
```

Artifact form. Every artifact whose name starts with the prefix holds one
report per line. The prefix cannot start with `build-receipt`, which names
receipts.

```json
{ "receipts": { "report": { "artifact": "build-report-" } } }
```

Avoozl refuses any other shape when it loads the configuration.
