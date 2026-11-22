# Intake sources

An intake source brings items from a script into Avoozl, next to the issues
and pull requests it reads from GitHub. Items are listed with their source and
never start work by themselves.

```sh
avoozl intake list
avoozl intake deliver script Q-17
```

A source is anything you script through MCP. `avoozl intake list` and the
`plans_intake` tool, action `items`, list every item with its source.
`avoozl intake view SOURCE ID` shows one item, its route and history.
`avoozl intake deliver SOURCE ID` and `avoozl intake plan SOURCE ID` turn an
item into work, and only a person runs them.

## Script sources

Declare a script's source with `via: mcp` under `intake.sources`, in
`.avoozl.json` or in this machine's `plugins.json`. Use `plugins.json` to keep
the name off a public repository:

```json [plugins.json]
{
  "intake": {
    "sources": {
      "script": {
        "via": "mcp",
        "repository": "example/app"
      }
    }
  }
}
```

A Kiro Crew cron job that reads a system no plugin covers then sends what it
found with the `plans_intake` tool and the `submit_items` action:

```json [plans_intake call]
{
  "action": "submit_items",
  "input": {
    "source": "script",
    "items": [
      {
        "id": "Q-17",
        "kind": "ticket",
        "link": "https://tickets.example.test/Q-17",
        "title": "Export fails on an empty sheet",
        "body": "Steps to reproduce ...",
        "labels": [
          "hold"
        ],
        "state": "open",
        "updatedAt": "2026-11-12T20:01:00Z"
      }
    ]
  }
}
```

The reply has one result per item: `created`, `updated`, `unchanged`, `stale`
(older than the stored one) or `refused` with the field it broke. The command
line sends the same items:

```sh
avoozl intake submit --source script --file items.json
```

A source takes two optional keys besides `via` and `repository`.
`labelFields` lists item fields that become `<field>:<value>` labels, and
`assigneeField` names the field that holds the item's assignee. Any other key
is refused. The source IDs `github`, `local` and `retro` are built in and
cannot be declared.

An `intake.sources` entry with `via: github` is a GitHub repository whose
issues may start work. Its items come in as source `github`.

## Trust

An MCP caller is you, on this computer, but Avoozl cannot tell who wrote an item
at its source, and a chat may be passing on text it read. So the items are
listed and never start work by themselves. MCP submits only to a declared
`via: mcp` source, and a close it reports holds the item's dependents for you
to decide.

Avoozl writes nothing back to these sources. It deletes a closed item that no
task holds 30 days after it closed.
