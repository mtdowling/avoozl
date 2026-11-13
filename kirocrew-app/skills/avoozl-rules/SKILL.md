---
name: avoozl-rules
description: Plan an Avoozl content rule set with the user, suggest its rule and allow lines, and explain where they check. Never writes the terms file. Use when a user asks how to keep words out of what Avoozl writes, or opens Design a rule set in Settings > Content rules.
---

# Avoozl content rules

A rule set is a named list of words Avoozl must never write. `.avoozl.json`
only names the set and where it checks. The words live in a terms file on
the user's computer, or come from an approved rules plugin. The full text is
"Ban private terms" in `docs/policies.md`.

## Rules for this chat

- **Never write the terms file.** Do not create, edit, or copy any file
  under `.avoozl/local/content-rules/`, and do not save terms through any
  tool. Suggest lines; the user pastes them into Settings > Content rules
  (Rule builder or File view) and chooses **Save terms** there.
- **Terms typed here stay in this chat's transcript.** Say so before the
  user shares any. For truly private terms, ask for made-up stand-ins, or
  ask the user to type the real words straight into the editor.
- Never put a rule in `.avoozl.json`. Avoozl refuses `terms`, `patterns`
  and `rules` keys there.
- Rule names show in logs and notices; the matched words never do. Keep the
  words out of the name.
- Use made-up examples, such as `zebra falcon` or `staging.example.test`.

## Plan it with the user

1. Ask what must stay out: code names, hostnames, repositories, ticket IDs.
   Ask for the kind of thing, not the private words.
2. Decide word or pattern for each, and name each rule.
3. Pick where the set checks and whether it blocks or reports.
4. Draft the lines, with allow lines for known false matches.
5. Tell the user to paste them into the editor, check them with **Try it**,
   and save.

## The terms line format

One line per rule. Blank lines and lines starting with `#` are skipped.

```text
# Made-up examples
project-name: zebra falcon
staging-host: staging\.example\.test
ticket: \bacme-\d{4}\b
allow: zebra falcon app
allow ticket: \bacme-0000\b
```

- `rule: regex` is a name, a colon, then a regular expression. Each line
  Avoozl checks is matched on its own.
- Case is ignored: `Zebra` and `ZEBRA` both match `zebra`.
- `allow: regex` cancels any rule's match on the same line.
  `allow <rule>: regex` cancels only that rule's match, and the rule must be
  in the same file. An allow counts only when it matches the line the rule
  matched.
- A line with no name, nothing after the colon, or a pattern that does not
  compile is refused with its line number, and the file does not save.

## Word or pattern

- **Word or phrase** matches only itself. The Rule builder escapes dots,
  brackets and other symbols so they mean themselves. Suggest this for a
  plain name.
- **Pattern** is a regular expression, for a family of strings such as any
  ticket number. Use `\b` for word edges so `zebra` does not hit `zebras`
  unless it should.

## Where rules check

A set checks every boundary but `intake` unless `boundaries` narrows it.
`intake` runs only for a set that lists it:

| Boundary   | Checks                                                |
| ---------- | ----------------------------------------------------- |
| `plan`     | Spec files when a plan is saved or approved           |
| `github`   | Issue, comment and pull request text Avoozl writes    |
| `brief`    | The brief a worker session starts with                |
| `diff`     | Lines a worker adds, checked before a push            |
| `intake`   | Items that come in from a plugin source or MCP        |
| `activity` | Each activity log row; a match saves the row redacted |

`repositories` narrows a set to some registered repositories. Matching also
reads through percent and HTML escapes and hidden zero-width characters.

## Block or report

- `block` (the default) writes nothing and opens a decision in Conflicts.
  There a person changes the text, or chooses **Allow once** with a reason,
  which lets that exact content through one time. A session's own write is
  refused in its call instead, so it can fix the text.
- `report` lets the write through and lists the finding in Delivery, with
  one notice.
- A set whose terms file is missing on this computer blocks everything it
  covers until the file is there.

## Built-in sets

`builtin:planning-repository`, `builtin:reply-safety` and
`builtin:published-secrets` (shown as Plans repo name, Safe replies and
Secrets) always run where they apply. Settings cannot turn them off, they
ignore allow lines (use Allow once), and a user's set cannot use a name
starting `builtin:`.

## Rules plugins

A plugin that provides `rules` supplies whole sets, for words a team shares
without a file on each computer. The user adds and approves it in
Settings > Plugins, then picks it as the set's **Rules plugin**. Its rules
stay in memory and carry no `allow`; the exception goes in the pattern. See
the avoozl-plugin skill to build one.

## Test with Try it

The editor's **Try it** box takes sample text and lights up each match,
with allowed matches struck through, before anything is saved; nothing in
it is saved or sent. It does not read through escapes the way Avoozl does.
Ask the user to paste a line that must be caught and one that must pass,
and to adjust until both behave.
