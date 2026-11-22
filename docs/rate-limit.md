# GitHub rate limit

Avoozl's tick and every chat on a machine share one GitHub login, which GitHub
limits to 5,000 REST calls an hour (GraphQL has its own count). Avoozl keeps
under the limit with a cache, paced writes, conditional reads and a backoff.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-desktop-dark.png">
  <img alt="Settings, GitHub tab, GitHub calls: who signs Avoozl in" src="https://github.com/mtdowling/avoozl/releases/download/docs-screenshots/settings-github-calls-desktop-light.png" width="800">
</picture>

```json [.avoozl.json]
{
  "github": {
    "cacheSeconds": 60,
    "writesPerMinute": 60,
    "writesPerHour": 400
  }
}
```

## Cache

Every view, command and MCP tool reads GitHub through one client. A response it
holds is reused with no call for `github.cacheSeconds` seconds (default 60, 0
turns it off). It is one value for the workspace, set on the **Sync pace** tab
of **Settings › GitHub** or in `.avoozl.json`.

A write (a comment, a label, a merge) makes the responses for its repository
stale, not gone, so the next read asks with the `ETag` and a 304 is free. While
the rate limit holds, a stored response is served at any age. GraphQL queries
are kept the same way, by their text and variables, but mutations and responses
with errors are not. A read can be up to that many seconds old, including
pull-request checks.

## Paced writes

GitHub allows about 80 content-creating requests a minute and 500 an hour, and
repeat hits can get a login banned. Every write goes through one serial pacer in
the client. It allows at most `github.writesPerMinute` (default 60, up to 80)
and `github.writesPerHour` (default 400, up to 500), counted in a journal in the
workspace database, and none while under 10% of the primary limit is left. Each
mutation counts as one write, and Avoozl does not batch mutations into one
request.

## Conditional reads

Every REST GET stores GitHub's `ETag`, `Last-Modified` and the body in the
workspace database, and sends them back next time. A 304 response costs nothing
against the limit, and Avoozl reuses the stored body. The cache holds 400
responses, or four per GitHub-backed task when that is more, of at most 1 MB
each, and drops responses unused for a week.

GraphQL cannot use ETags. GraphQL reads in a tick (discussions, only when turned
on, and pull-request reads) go through the cache above, so they repeat at most
once per `github.cacheSeconds`.

## Backoff

On a 403 or 429 that says no calls are left, names a `Retry-After`, or says
secondary rate limit, Avoozl makes no GitHub call until `x-ratelimit-reset` (or
`Retry-After`, or one minute when GitHub names no time). A secondary limit holds
every resource. The tick skips its GitHub steps, so the pending writes run once
on the first tick after the wait. When fewer than 200 calls are left, GitHub
steps run at most every 5 minutes (every 20 under 50 calls left), and never past
the reset.

While limited, **Needs you** has one row, "GitHub rate limit reached", with the
time calls resume, the calls left and the resource. It clears itself at the
reset, and there is one notification per limit window.

## Refresh button

Each view's **Refresh** icon reads again every `github.cacheSeconds` seconds
(every 20 seconds with the cache off), and its color shows how old the read is.
It stops counting while the page is hidden, and while limited it waits for the
reset. Its tooltip gives the time left and the calls left this hour. The
**GitHub calls** tab of **Settings › GitHub** shows the last numbers GitHub
sent and the last hour's calls by source, with the share GitHub answered with
304.

## Chats that wait on CI

The `avoozl` skill tells chats to read `gh pr checks <number>` every 2 to 3
minutes, not `gh pr checks --watch`. Avoozl cannot enforce that for chats it
does not start.
