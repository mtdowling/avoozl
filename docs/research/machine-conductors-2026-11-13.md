# One conductor per machine, with a shared queue (2026-11-13)

Question: can Avoozl give remote machines work with nobody sending turns, without
any chat call crossing machines?

Short answer: yes for the part that was run, with three conditions (below). The
run used one machine: one isolated Kiro Crew 0.12.2.4 home, its own port and
workspace. A second machine would be the same set-up repeated. Two machines
against one queue were not run, so that part is Inferred.

Each result is marked:

- **Verified**: run in the isolated gateway; the observation is quoted.
- **Inferred**: read in Kiro Crew's source; the cite is `kiro_crew/<file>:<line>`
  in the 0.12.2.4 package.

## The wall, and the idea that avoids it

A chat can start or message a chat on another crew only in a turn the owner sent
(`kiro_crew/dashboard/handlers/remote_dispatch_routes.py:292-299`, Inferred; see
`kirocrew-hooks-and-wake-paths-2026-11-13.md`). A timer or a worker's report is
never such a turn.

So nothing crosses machines by chat. Each machine runs:

- a **bell**: a person-owned script cron. It makes no model calls. It opens one
  conductor chat for the machine, keeps its approval mode set, and sends it a
  fixed message only when the queue changed.
- a **conductor**: a `kirocrew-conductor` chat that claims tasks, dispatches
  local `kirocrew-worker` chats, accepts results, and goes idle.

The machines share a private queue, not GitHub (see "Private queue" below). The
result is a pushed branch plus a status write to the queue. Avoozl only writes
queue entries.

## What was built (all local)

| Part | Stand-in |
|---|---|
| Queue | one JSON file per task, in a folder |
| Claim lock | a claim file created with `O_EXCL`; the same call can win only once |
| Result | a branch pushed to a local bare git repo, then merged to its trunk, then a done file |
| Bell | a script cron, every 60 s, hashing the task and done files |
| Driver | a shell script that adds tasks on a timer and does nothing else |

Queue text is a task id (`^[a-z0-9][a-z0-9-]{0,31}$`), a list of ids, and one
integer. The bell's message and the worker's seed carry the id and fixed commands.
Nothing from outside the queue reaches a prompt. This held for the whole run
(Verified: the message texts are fixed templates; only the id and a counter are
filled in).

## Safety of the test

- The gateway had its own home, Kiro home, port, and workspace. The inherited
  `KIROCREW_BOUND_PORT` (the parent crew's port) was removed at start. The
  gateway and every child process showed the test port in their environment, and
  a watcher recorded zero connections from the test home to the parent port
  (Verified: 0 hits over 34 minutes). Source of the leak:
  `kiro_crew/acp/launch.py:987-1006`.
- No GitHub repo, issue, or pull request was created. Pushes went to a local bare
  repo.

## Results

Timeline of the run: 34 minutes, four tasks, one gateway restart. The driver added
task `a1` and `c1` (depends on `a1`) at 0 min, `b1` (takes 5 min) at 12 min, and
`d1` at 24 min.

### 1. Bell opens the conductor; tasks run with nobody present

Verified for all four tasks. Claims: 4, all different, 0 lost races. A separate
self-test with 20 processes claiming one task at once gave 1 winner.

Latency for `a1`, from the queue write:

| Step | Seconds |
|---|---|
| bell ring (this run landed 1.6 s after the write; worst case is the 60 s interval) | 1.6 |
| claimed (conductor ran the claim command) | 4.4 |
| local worker chat started | 20.6 |
| pushed to a branch and landed on trunk | 38.7 |
| worker reported done | 45.2 |
| conductor woken by the report | 55.3 |
| conductor accepted | 67.1 |

`d1` (no dependency, no hold): claimed at 4 s, landed at 22.6 s. The ring cadence
is bounded below by 60 s: the cron interval floor is 60 s
(`kiro_crew/cron_service/fields.py:42`, Inferred), so worst-case start is about
61 s.

The conductor is woken on a worker's done report by Kiro Crew itself, with no bell
(Verified: ledger-wake turns for `a1` and `d1`). The bell is only needed for new
queue work and for restarts.

Not fully hands-off: `b1` needed one fix to the conductor's orders and one manual
ring (see 3). `a1`, `c1`, `d1` needed nothing.

### 2. Dependent task

Verified. `c1` waited for `a1`: it was claimed 47 s after `a1` landed, and its
checkout already held `a1`'s file. Each task is claimed only when all its
dependencies have a done file. In real use the driver should release a task (set
the entry as `queued`) only after its blockers close; Avoozl already does this. Keep the
machine-side check as a second guard.

### 3. Gateway restart in the middle of a task

Verified, with one break.

| Question | Result |
|---|---|
| Does the running worker keep going? | No. The restart killed its shell command (failed 0.8 s later) and ended its turn. It is not resumed. |
| Does the bell rewake the conductor? | Yes. The bell noticed a new gateway process and rang 18 s after the gateway was up. The conductor's chat resumed (same chat, `resumed: true`). |
| Anything claimed twice? | No. The next claim run printed `new: []`, `open: [b1]`. The claim file persisted. |
| Was a worker replaced just for being quiet? | No. The conductor first sent "resume" to the same worker. |
| What broke | Trust is held in memory and is lost on restart. The restored worker came back asking for approval on its first shell command. Nobody answered; after the 600 s approval timeout it was rejected, reported `blocked` (reason `approval`), which woke the conductor, which resumed it again, which prompted again. Two cycles seen. |

Why it cannot be fixed from the bell: a cron may set the mode only of chats it
opened (`kiro_crew/cron_script_context.py:245-263`), and a mode change reaches
descendants only when the caller may raise (`kiro_crew/dashboard/approval_inheritance.py:106-107`),
which a cron may not. Trust is in memory by design
(`kiro_crew/dashboard/session_control_parts/session_create.py:1185-1187`).

What worked: a new worker chat created by the trusted conductor inherits its
trust (`session_create.py:1198-1207`). The orders now say: if the worker is idle,
stopped, or blocked on approval, create a fresh child, bind it to the same ledger
item, and send the same seed. The fresh worker ran `b1` to the end (landed 305 s
after it started, of which 300 s was the task's hold). The queue commands are safe to re-run. The
"never replace a worker only because it went quiet" rule still holds: the trigger
is a stopped or approval-blocked worker, found with `session_status`.

### 4. Model-turn cost

Verified, by the crew log of the conductor chat.

| Item | Result |
|---|---|
| Conductor turns, whole run | 16: 12 from the bell, 4 from Kiro Crew's ledger wake |
| Of those, set-up and tests | 1 first ring, 2 for the reset test, 1 for the restart, 1 for the repair |
| Steady turns per task | about 2: one ring that claims and dispatches, one ledger wake that accepts. A third, no-op ring follows each landing because the done file changes the hash (about 10 s). |
| Cost per turn | 0.3 to 2.0 credits as reported in the crew log; mean 0.62 for bell turns, 0.89 for ledger wakes |
| Worker turns | 7 for 5 worker chats (one extra for each failed resume) |
| Idle | 0 conductor turns over a 9-minute and a 5-minute idle stretch. The bell ran every minute and cost no model call. |

The hash covers task files and done files, not claim files, so the conductor's own
claim does not ring it again. The alternative, ringing every minute, would be one
turn a minute: about 60 turns an hour, around 37 credits (arithmetic from the mean
above, not measured).

### 5. Approvals

| Mode | Result |
|---|---|
| Default for a cron-opened chat (the `agent.approval_mode` default is `auto`, `kiro_crew/config/sections_agent.py:83`, left unset) | Verified: the conductor's first shell call asked for approval. The slot opens in normal mode. Nobody answered. |
| `trust_reads` | Verified: the pending shell prompt stayed pending. Inferred why: it unlocks only read-only first-party tools (`kiro_crew/hook_runtime/gate_tiers.py:1649-1700`). |
| `trust` | Verified: the bell set it, the pending prompt was approved on the next bell run (about 6 min after it appeared), and nothing prompted afterward, in the conductor or in the workers it created. |

The bell must therefore set `trust`, on every run, because a restart drops it.
The conductor's `work_dispatch` and `execute_bash` are not on its allow list, so
they need trust. This is a standing grant on an unattended machine: it is safe
only because the queue holds ids and the orders are fixed. In the revised design the conductor reads only fixed, pattern-checked fields; the
free-text brief is read by the worker, and the queue must be writable only by the
driver (see "Private queue").

### 6. Can the person type into the bell-opened conductor?

Inferred; not run (it needs a dashboard token, which was not used). The fence
that limits a chat to its creator applies to cron callers only
(`kiro_crew/dashboard/handlers/_shared_route_guards.py:123-151`,
`kiro_crew/dashboard/chat_api/chat_send.py:728`). A person's send goes through the
ordinary path and is queued behind a running turn. Queuing behind a busy turn was
seen for the bell's own send (`queued: true`). The person's message cannot start
a turn on another crew; that is the wall and it is not needed here.

### 7. Context growth and reset

Verified. Context grew from 7.8k to 11.1k tokens over five turns. A bell ring that
asked the conductor to call `reset_conversation` worked: the chat reopened as a
new session on the next ring, context fell to 7.6k, and the conductor read the
ledger back and reported both finished tasks as already done.

This works because a script cron's send is counted as a person send for this check
(`kiro_crew/dashboard/chat_api/chat_send.py:506`, `:1810`;
`kiro_crew/dashboard/session_directive_apply.py:239`). Kiro Crew's own refusal text
says headless callers such as cron jobs are refused
(`session_directive_apply.py:117-121`), so this is likely an accident, not a
promise. Treat it as fragile (see requests).

## Verdict

Does this give remote work with nobody present? Yes for one machine, on the local
stand-in, once the three conditions hold:

1. The bell sets `trust` on every run.
2. The orders replace a stopped or approval-blocked worker with a fresh child.
3. The queue carries only ids.

It never needs a cross-machine chat call. Not shown: a real private queue (the one run used a first-draft file queue, replaced below), two
machines at once, a Windows or macOS host, and a person typing into the conductor.

## What breaks

- A restart ends running worker turns and drops trust. Only a fresh child is
  trusted again.
- A bell-only wake gives up to 60 s delay.
- Unattended trust is a real grant. A bad queue entry could be an instruction.
- Reset from a cron turn works by accident.

## Private queue (revised design)

The queue is pluggable and private. Two backends fit one interface:

- **DynamoDB-style table**, with conditional writes.
- **Files over SSH**: the driver writes one JSON file per task to the machine
  with a temp-name write and an atomic `mv`; the machine's own host does the
  claim.

No AWS resource was created. The DynamoDB mapping was written and its
semantics were run against a local stand-in; it was not run against DynamoDB.

### Entry

| Field | Read by | Rule |
|---|---|---|
| `task_id`, `machine`, `branch` | conductor | checked against a fixed pattern; branch must start `task/` |
| `repo`, `base_commit`, `agent`, `model` | conductor | checked against a fixed pattern |
| `brief` | worker only | free text; the conductor never reads it |
| `status` | both | `queued`, `claimed`, `done`, `failed` |
| `version` | both | +1 on every write |
| `lease_owner`, `lease_expires` | machine writes, driver reads | see leases |
| `result_commit`, `result_note` | machine writes, driver reads | the branch tip and a short note |

Dependencies stay in Avoozl: the driver writes an entry only when its blockers
are done.

### Claims are compare-and-set

| Step | DynamoDB form | Condition |
|---|---|---|
| Driver adds a task | `PutItem` | `attribute_not_exists(task_id)` |
| Machine claims | `UpdateItem` | `status = queued AND machine = me`; sets `claimed`, `lease_owner`, `lease_expires` |
| Heartbeat or re-claim after a restart | `UpdateItem` | `lease_owner = me AND status = claimed`; extends the lease |
| Machine finishes | `UpdateItem` | `lease_owner = me AND status = claimed`; sets `done` or `failed`, `result_commit` |

A false condition is a refusal, not an error to retry blindly. The target machine
is in the entry, so two machines never compete for one task; the condition is a
second guard and the guard that stops a double claim on one machine.

### Leases: the driver reads, never acts alone

The lease says "this machine is working on it until time T". If T passes, the
driver shows the task as stale to a person. It has no write that releases a
lease or reassigns the task. Only the owning machine can take back its own lease
after a restart, which is what the conductor does on its first ring. This keeps
Avoozl's rule that a worker is never replaced because it went quiet.

### Verified on the stand-in (local, no gateway)

Seven tests, all passing (`CasTests`, run from the stand-in folder):

- A second put of the same id is refused.
- A field that fails its pattern (a branch of `main; rm -rf x`) is refused.
- 24 claims from 8 processes at once: exactly one winner, version 2.
- Another machine cannot claim, and cannot finish another machine's task.
- An expired lease is flagged stale and is not taken by anyone else.
- The owning machine can take its own lease back; another machine cannot.
- A finish is refused unless the task is claimed by the caller, and a second
  finish is refused.

The conductor and bell layers (results 1 to 7 above) were measured with the
first-draft file queue and were not re-run against this one. The changes they
need are small: the claim command becomes the compare-and-set above, and the
worker's commands become the three below.

### Results come back as a branch plus a status write

The worker runs three fixed commands, each safe to re-run:

1. `prepare <id>`: reads the entry, clones `repo`, checks out `base_commit`, makes
   `branch`, and prints the brief.
2. The worker does the work and commits on `branch`.
3. `finish <id>`: pushes `branch` (never a force push), then writes `done` with
   `result_commit`. If the push fails, it writes `failed` with a short note.

Nothing is posted to GitHub. A person or Avoozl reads the status and the branch.

### Safety of the brief

The queue is the trust boundary, because the worker runs with inherited trust. So:

- Only the driver may write entries. For DynamoDB, give the driver's role
  `PutItem` and the machine's role `UpdateItem` on its own items only (a leading-key
  or attribute condition in IAM). For SSH, the driver's key may write only to the
  machine's queue folder, and the machine's account cannot write there.
- The conductor's message and its orders never contain the brief or `result_note`.
- A brief is as trusted as the driver. This design does not stop a driver that
  has been given a hostile brief. It limits the damage to the machine's worker
  chat, which runs on a branch, not on the base.

## Smallest Avoozl design

What Avoozl writes: one queue entry per ready task, nothing else.

The bell (script cron, 60 s, no model):

1. Open the machine's conductor once; reopen it if its chat is gone.
2. Set its mode to `trust`, every run.
3. Read this machine's `queued` and `claimed` entries (one query, or a folder
   listing). Hash their ids, status, and version.
4. If the hash, or the gateway process, changed, send the fixed message; else
   exit. Every N rings, send the reset message.

Conductor steering (fixed text, same every ring):

1. Run the claim command for this machine. It claims every `queued` entry with
   compare-and-set and prints only fixed fields: id, branch, agent, model.
2. For each claimed id with no ledger item: `work_dispatch` the entry's agent and
   model with a seed that names the id and the three fixed commands.
3. Accept a done item when its status in the queue is `done` and the branch tip
   equals `result_commit`.
4. For a claimed id whose worker is stopped or blocked on approval: re-claim the
   lease, create a fresh child, bind it to the same item, send the same seed.
   Never open a second worker while the first is alive and working.
5. Reply in one line and end the turn.

## Kiro Crew requests still needed

1. Let a cron's trust grant cover chats it did not open, and survive a gateway
   restart, for a tree it started. Today a restart forces a fresh child.
2. Support `reset_conversation` from a cron turn on purpose, or add a cron call
   for it. The current behavior contradicts the refusal text.
3. Drop an inherited `KIROCREW_BOUND_PORT` when a gateway starts, or fail loudly.
4. Optional: a wake kind that watches a queue query, so the bell script is not
   needed. Today only the work ledger and pull-request watch kinds exist.
