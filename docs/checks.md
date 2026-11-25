# Repository checks and isolation

A repository's checks are the commands Avoozl runs on the exact commit of every
task before it lands. They are the only checks a repository holds: every task
runs them, and a task never names its own. Checks may also come from a plugin
this machine approved; see the [Checks part](plugins.md#checks-part).

```json [.avoozl.json]
{
  "repositories": {
    "code": {
      "checks": {
        "test": [
          "npm",
          "test"
        ],
        "diff": [
          "git",
          "diff",
          "--check"
        ],
        "ui": {
          "run": [
            "npm",
            "run",
            "test:ui"
          ],
          "paths": [
            "src/ui/**"
          ]
        }
      }
    }
  }
}
```

Each check has a name and its command arguments, and Avoozl runs it with no
shell. A check with `paths` runs only when a commit's diff touches one of them.
Merge batches run every check whose paths any member's change touches, plus
every check without paths. Records, reruns and bisect steps name a check by its
name. `flow.verify.checkTimeoutSeconds` (default 1200) bounds each check, and
`flow.verify.checkTimeouts` sets one check's own timeout by its name. See
[Verification](flow.md#verification) for both.

Each repository's queued runs execute in one detached check runner. A tick
starts the runner and returns without waiting for its commands. The runner
records each result in the workspace database, and a later tick judges it.

A worker can run the same checks in its own worktree first and record the
pass:

```sh
avoozl checks run --task TASK
```

## Code the repository owns

Some code Avoozl runs is owned by the repository, not by you. Read it before you
point Avoozl at a repository you do not trust, public ones included.

| Code                                 | When it runs                                  | What guards it                                                                                                                                         |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/worktree` in the repository | Every time Avoozl adds a worktree             | A person approves its SHA-256 hash first. The refusal prints the hash; set `worktreeHelper` on the repository to that hash. A changed file asks again. |
| The repository's `checks`            | On worker commits and on commits Avoozl lands | They are in the repository settings a person edits. Checks never see the gateway, push or GitHub credentials.                                          |
| A local-folder plugin                | When the tick uses it                         | A person approves its hash. Avoozl hashes it again just before it starts and refuses if it changed.                                                    |
| A plugin check                       | On the repositories and stage it names        | A person approves its plugin. It sees only its own `env` names, its network is off unless it says `network: true`, and it may not listen. |

## Check environment

A check sees only the basics a process needs to start (`PATH`, `HOME`, temp
folders) plus the names a repository lists in `checksEnv`:

```json [.avoozl.json]
{
  "repositories": {
    "code": {
      "checksEnv": [
        "NODE_OPTIONS"
      ]
    }
  }
}
```

Push and GitHub credentials (`GH_TOKEN`, `GITHUB_TOKEN`, `SSH_AUTH_SOCK` and the
like) never reach a check, even when listed. Neither do the variables of
Avoozl's git credential helper, `avoozl credential`.

### Task variables

A check run for a task also gets the task's identity, so a check can judge
the change against the task it belongs to. This check fails when the task
changed a file outside `src/`:

```sh
#!/bin/sh
[ -n "$AVOOZL_TASK" ] || exit 0
git diff --name-only "$AVOOZL_START" HEAD | grep -v '^src/' && exit 1
exit 0
```

Avoozl sets these variables itself, without `checksEnv`:

- `AVOOZL_TASK` holds the task's ID, such as `rw-4.1`.
- `AVOOZL_SPEC` holds the path of the task's spec in the repository that
  holds it, such as `specs/rw.md`, or a split spec's folder, such as
  `.kiro/specs/rw`. A task with no spec has none.
- `AVOOZL_START` holds the start commit the claim's newest lease names, so
  `AVOOZL_START..HEAD` is the task's work. With no lease it holds the merge
  base with the base branch, the commit the path check diffs from.

A run with no task gets none of them: the main-line check, phase and branch
checks, and the checks on a merge batch's candidate. A value of the same name
in Avoozl's own environment never reaches a check, even when `checksEnv`
lists it. Each task run is its own run, so no task's result stands for
another's.

## Isolation

Every check runs in the repository's `isolation`, set in **Settings ›
Repository setup** or with `repository.configure`.

```json [.avoozl.json]
{
  "repositories": {
    "code": {
      "isolation": {
        "run": "sandbox",
        "network": "off",
        "writable": [
          "/var/cache/code-build"
        ],
        "prepare": [
          "npm",
          "ci"
        ]
      }
    }
  }
}
```

`run` is one of two modes:

- `sandbox` is the default and uses the process sandbox. A check writes only its
  folder, its own temp folder, a per-repository cache folder and `writable`. It
  reads no credential or Avoozl state folder. `readable` lists absolute paths it
  may also read.
- `unconfined` applies no isolation. It needs this machine's opt-in,
  `"checks": true` in `harness-unconfined.json` in Avoozl's config folder. A
  machine with no sandbox runs a `sandbox` check unconfined too.

`network` is `off` unless set to `on`. `prepare` runs once per worktree and
commit before the checks, outside isolation, with the environment allowlist.
When it fails, no check runs. Each check record names its isolation, so a
check that ran unconfined is on record as unconfined. The isolation form shows
`unconfined` as **Not sandboxed**.

## Free disk space

Before Avoozl makes any worktree (a task's, a check run's, a landing candidate's
or a review session's), the volume that will hold it needs 2 GiB free. With
less, the work waits instead of failing halfway. A check run stays queued, the
landing queue holds, a session start is tried again, and **Needs you** shows
one row naming the folder and its free space. The row clears once there is room. The
2 GiB floor is fixed.

## See also

- [Checks part](plugins.md#checks-part) for checks a plugin ships, which every
  machine with the plugin runs on the repositories it names
- [Agent access](agent-access.md) for the sandbox around unattended
  sessions
- [Delivery](delivery.md) for registering a repository and its checks
