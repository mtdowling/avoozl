# Content rules

Content rules keep private names, hostnames, repositories and paths out of spec
files, issues, pull request text, comments, session briefs and worker diffs.
`.avoozl.json` names the rule sets, and the rules live outside Git, so the list
itself never lands in a repository.

```json [.avoozl.json]
{
  "contentRules": {
    "sets": [
      {
        "id": "company-terms"
      },
      {
        "id": "trial-hostnames",
        "action": "report",
        "boundaries": [
          "github",
          "diff"
        ]
      }
    ]
  }
}
```

## Rule sets

Each set reads `.avoozl/local/content-rules/<id>.txt`, or the path this
machine's `~/.config/avoozl/config.json` gives in `contentRules.terms.<id>`. The
file holds one `rule: regex` per line, with `#` comments, matched per line
ignoring case. Avoozl refuses a terms file that Git tracks or does not ignore.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-desktop-dark.png">
  <img alt="Settings, Content rules tab: the built-in rule sets" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-content-desktop-light.png" width="800">
</picture>

- `action` is `block` (the default) or `report`. A block writes nothing and
  opens a decision in **Needs you**, where **Allow once** lets that exact
  content through one time with a reason
  (`avoozl content allow DECISION_ID --reason TEXT` from a terminal). A
  session's own write is refused in its call instead, so it can fix the text.
- `boundaries` narrows a set to some of `plan`, `github`, `brief`, `diff`,
  `intake`, `proposal` and `activity`. A set without `boundaries` covers all
  of them except `intake`, which a set must name. At `activity` a matching
  row is saved redacted and opens no decision.
- `repositories` narrows a set to some registered repositories.
- A set this machine does not have blocks everything it covers until you add its
  terms file. A findings message names the set, rule and line, never the matched
  text.
- `.avoozl.json` never holds a rule. It refuses `terms`, `patterns`, `rules`,
  `pattern` and `regex` keys anywhere under `contentRules`.

A plugin can supply a set instead of a terms file. See
[Writing a plugin](plugins.md#rules-kind).

## Allow lines

An allow line lets a false match through every time. Add it to the same terms
file. `allow: regex` cancels any rule's match on that line, and
`allow <rule>: regex` cancels only that rule's. It counts only when it matches
the same line the rule matched.

```text [company-terms.txt]
codename: \bzebra\b
allow: \bzebra-ui\b
```

With these lines, "the zebra-ui package" goes through and "zebra ships Friday"
is still blocked. Built-in sets ignore allow lines, so use **Allow once** for
those. The release scan reads the same lines for its own terms file.

## Pushes and merges

Avoozl installs a `pre-push` hook in each task worktree it prepares, so a
matching added line, commit message or branch name stops the push. The hook
runs `avoozl content check --push` on this machine only, so it does not stop
a merge made on GitHub.

## Posted text

Every comment, review, review line comment and pull request body goes through
the same write path. When an agent or Avoozl's own automation (the tick) writes
it, the path breaks each `@login` mention with a zero-width space after the `@`.
Code spans, fences and HTML comments stay as written. The path also adds a
hidden `<!-- avoozl:posted -->` marker. Such a post notifies nobody, and a
comment that carries the marker never starts or resumes work, because comment
steering and pull request feedback skip it.

A write you start yourself, from the Avoozl page or with a CLI command outside
an agent session, goes out as written. Its mentions notify, and it has no
marker. Content rules check every write either way, and a write whose caller
Avoozl cannot tell is marked.

## See also

- [Content hook](content-hook.md) for the same rules on an agent's own GitHub
  writes
