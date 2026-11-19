# The content hook

`avoozl content hook` checks an agent's writes to GitHub before they run.
Any agent that writes with your GitHub login can use it, for example a
Kiro Crew agent or another coding agent with
pre-tool-use hooks. It uses your workspace's content rules (see
[Ban private terms](policies.md#ban-private-terms-from-everything-avoozl-writes)).
There is no new rule format.

## What it checks

The agent runs the hook before each shell call. The hook reads the call as
JSON on stdin and, for a write, runs content rules on it first:

- `gh issue` create, comment and edit;
- `gh pr` create, edit, comment, review and merge;
- `gh api` with a write method or body fields;
- `git commit`, `git tag` and `git push`.

It checks the text, the labels and the branch name. For `git push` and
`gh pr create` it also checks the commit messages and added lines the call
would publish. A body or message file named on the call is read.

A match, or a rule set the repository needs that is unavailable, refuses
the call with exit code 2. The message names the rule set, the rule id and
the place, never the matched text. Text the hook cannot read from the call,
because it comes from a shell expansion such as `$VAR` or `$(...)`, or from
a here-document, is refused with the reason. The agent can write the text
to a file and pass the file instead.

## Add it to an agent

For a Kiro agent, put the hook in the agent's file:

```json
{
  "hooks": {
    "preToolUse": [
      {
        "matcher": "*",
        "command": "avoozl content hook --workspace /path/to/workspace"
      }
    ]
  }
}
```

The matcher must be `*`, `execute_bash`, `shell` or `@builtin`, or absent,
so the hook sees shell calls. Other agents with a pre-tool-use command take
the same command.

## Limits

- The hook reads the call, not what runs. A write made inside a script,
  `python -c`, or a build tool is not seen, and nothing cleans it up
  afterward.
- It covers only the agents it is attached to.
- It checks calls only. The agent can still read every file its
  operating-system user can read.

Avoozl's own pushes go through a separate pre-push check, not this hook.

Built and tested with fake rules; not run live against a public repository.
