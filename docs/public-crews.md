# Crews on public repositories

Requirement 85, design §6.14. Facts were read from Kiro Crew 0.12.2.4 and
tried on a scratch repository.

An Issue Radar crew can work a public repository. The machine it runs on
may also hold private material: internal names, company hosts, links and
notes. Avoozl puts four layers between that material and GitHub, plus a
kill switch. No layer depends on prompt text. Each one has limits, listed
below, and the last section drafts what Kiro Crew would need to close them.
Nothing in that section has been filed.

## Which repositories count as public

A repository counts as public when GitHub says it is public. A repository
whose visibility Avoozl could not read also counts as public. Every layer
below applies to each of them.

## Where a crew writes

The crew brief tells the crew to post and edit its claim comment, add its
labels, commit, push, open the pull request and put `Fixes #n` in its body.
It does all of this with `gh` and `git` in its own shell, with the owner's
GitHub login. Issue Radar's backend writes to GitHub only when a person
clicks in the dashboard, and it refuses a crew's session on those routes.
The crew's two Kiro Crew tools touch only its local ledger. Crews run with
approvals granted, so no person sees a prompt before a write.

A crew's agent is the `agent` field of its crew record. A hook on that agent
runs before each of the crew's tool calls.

## Layer 1: a clean crew home

Give public crews their own Kiro home: a folder reached through its own
`KIRO_HOME` that holds the crew's agent and nothing of yours. Today that
means a second Kiro Crew with its own `KIROCREW_HOME` and `KIRO_HOME`,
because a crew has no home setting of its own (request 2 below).

The folder must not hold any of these: `steering/`, `memory/`,
`crew/memory/`, `crew/workspace/memory/`, `notes/` or `AGENTS.md`. It holds
`agents/<agent>.json`, the crew's agent with the content hook (layer 2).
The sign-off checks both, and refuses your own Kiro home.

Limit. A clean home removes injected context only. The crew can still read
every file its operating-system user can read, and use that user's
credentials and git settings. A crew that must not read them runs as
another user, in a container, or on another machine.

## Layer 2: scan before send

`avoozl content hook` is a `preToolUse` command for the crew's agent. It
reads the tool call as JSON on stdin and, for a write to GitHub, runs the
repository's content rules on the call before it runs:

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
a here-document, is refused with the reason, so the crew can write the text
to a file and pass the file.

The hook goes in the crew agent's file:

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
so the hook sees shell calls.

Limits.

- The hook reads the call, not what runs. A write made inside a script,
  `python -c`, or a build tool is not seen.
- It covers only the agent it is attached to. A crew on another agent has
  no hook.
- A write that Kiro Crew's own backend makes, instead of the crew's shell,
  is not seen either.

Layer 3 exists for these gaps.

## Layer 3: audit on the tick

On each tick, Avoozl reads what changed on each public repository since its
last pass: issue comments, issues, pull requests and branches. It keeps
what a crew wrote, found by the crew claim marker, the `crew/` branch
prefix and the crew labels, and checks each with content rules. It keeps a
cursor per repository and runs at the tick's own pace.

On a match Avoozl:

- deletes the comment, and never edits it, because GitHub keeps edit
  history;
- closes a matching pull request or issue the crew opened, and deletes its
  branch;
- pulls the cord for the repository, so Avoozl starts no new work there;
- tells you in a Kiro Crew notification and in Needs you, naming the rule
  set, rule id, place and link.

It records who, what and when, and a hash in place of the text.

Limits.

- The tick runs about once a minute, so a hit can be public for up to a
  minute plus one read.
- A pull request body, a commit or an edit history can stay reachable on
  GitHub by its address after deletion. Removing it for good needs a
  request to GitHub.
- Review comments on pull requests are not read, and only the 100 most
  recently updated pull requests are.

## Layer 4: sign-off

Avoozl sends no issue of a public repository to Issue Radar, releases
nothing and arms nothing there, until a person signs off its checklist.
The checklist is on the **Public crews** card in Needs you › Planning and
intake:

1. the crew home (layer 1);
2. the content hook on the crew's agent, by its hash (layer 2);
3. the content rule sets that cover the repository's GitHub writes and
   diffs, each available;
4. the audit being on: the tick audited the repository in the last 10
   minutes (layer 3).

The sign-off records who and when, and a hash of the four items. An agent,
a plugin or an app token cannot sign off. A change to any item lapses the
sign-off, and the card shows it as lapsed until a person signs off again.
A stopped tick lapses it too.

A public repository with no covering rule set shows a banner, and sign-off
stays closed. Every rule set content rules supports can cover it.

## Kill switch

`avoozl public-crews stop` pulls the cord for every public repository and
lists the crews to pause in Issue Radar, with a link for each.

Limit. Pulling the cord stops Avoozl's own work. It does not stop a running
crew, because Avoozl cannot pause a crew: the pause route is for the
dashboard owner only. Pause each listed crew in Issue Radar. Only a person
resumes the stop.

## Requests to Kiro Crew

Drafted only. None has been filed with anyone. A person decides whether to
file each one.

### 1. Crew writes through one Issue Radar tool

What we ask. Give crews one Issue Radar tool for their GitHub writes: the
claim comment, labels, the pull request and its body, and the push. Let an
app check the content before the tool writes.

Why. Today a crew writes with `gh` and `git` in its own shell. A hook can
read the shell line but not what a script does when run. One tool would
give one place where every crew write can be checked, and the audit would
become a backstop instead of a layer.

### 2. A per-crew home and agent with no global context

What we ask. A crew setting that runs the crew with its own Kiro home and
agent, with no global steering, memory or notes, on the same Kiro Crew.

Why. Today a clean home needs a second Kiro Crew with its own homes and
port. A per-crew setting would let one install run public and private
crews side by side.

### 3. A pause an app may call

What we ask. An Issue Radar route that pauses one crew, which an installed
app may call, with the same effect as the dashboard's pause.

Why. Stop public crews can stop Avoozl's own work but not a running crew.
With this route it could pause the crews too, so one action stops every
public write.

### 4. A crew setting that attaches a named hook to its agent

What we ask. A crew setting that names a hook, for example
`avoozl content hook`, and attaches it to the crew's agent, whatever agent
the crew uses.

Why. Today the hook lives in the agent's own file, so a crew on another
agent has no hook, and a changed agent file can drop it. The sign-off
catches that change, but only after it happened.
