# Task facts

A spec's `tasks.md` holds a small set of task facts. Lint refuses every
other fact and front-matter key, naming it and saying what to do.

## Requirement CF1: The facts

1. A task may hold `$done`, `$after`, `$repo`, `$manual`, `$paths`,
   `$investigate` and `$type`. An epic row holds only `$plan` and `$step`.
2. `$after` names task IDs only.
3. A leaf with no `$done` takes each plain bullet under it as one result,
   and has no summary. With `$done`, plain bullets are its summary.
4. Avoozl's own writers (planner prompt, steering file, templates, skills)
   always write `$done`.

## Requirement CF2: Read from the layout

1. An item with sub-items is a package; every other item is a leaf.
2. A task's phase is the `##` heading above it, and the heading text is the
   phase title.

## Requirement CF3: Front matter

1. `tasks.md` front matter holds `repo`, `integrationBranch`,
   `integrationSync` and `kind`. `requirements.md` holds `category` and
   `epic`.

## Requirement CF4: Lint

1. Any other fact or front-matter key is a lint error at its line that
   names it and says what to do.

## Requirement CF5: Docs match the code

1. `docs/specs.md` has one row per fact and front-matter key the reader
   takes. A test checks the rows against the reader.
