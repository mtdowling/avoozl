---
repo: avoozl
---

# Direct links to work and decisions

## Requirements

### Goal

From a task or an alert, open the exact place where you can act. A task
opens its worker attempt. An alert opens its decision in Needs you.

#### Requirement DL1: Open the exact worker attempt

**User story:** As an owner looking at a task, I want to open its worker
chat or log.

1. In flight and the task detail SHALL show an action for the displayed
   attempt when a destination is available:
   **Open worker chat** or **View worker log**.
2. In Kiro Crew, the chat action SHALL open the existing local chat or,
   for a connected Remote Crew, the exact chat on that Crew. In standalone
   Avoozl it SHALL open an available Kiro Crew web dashboard or offer
   **Open in Kiro Crew** for a configured desktop destination. In either
   view, the link SHALL open the live transcript and existing steering
   controls when the harness and permissions support them.
3. While the chat is starting, show **Waiting for worker chat**. When
   a configured Crew is disconnected, offer to connect or say where to
   connect. If the attempt or its destination is unavailable, show its
   known status and worker. An old link SHALL never open a newer attempt.

#### Requirement DL2: Open the exact decision

**User story:** As an owner who receives an alert, I want to open the
decision it refers to so I can answer it in Needs you.

1. A decision alert SHALL link to the workspace and the exact decision
   it refers to. The link SHALL survive page reloads and sign-in.
2. An open decision SHALL be shown with its usual actions. A resolved or
   unavailable decision SHALL show that state and a link to Needs you.
   A later decision for the same task SHALL have a distinct link.
3. A DM on an enabled Kiro Crew notification source SHALL offer
   **Open decision** when the bridge supports links and the owner has set
   a reachable HTTPS dashboard address. Without that support or address,
   the existing notification SHALL still arrive under the user's settings.

#### Requirement DL3: Opening a link is read-only

1. Opening a link SHALL use the destination's existing sign-in and access
   checks. Approvals and decisions use their existing actions in Avoozl.
2. Chat IDs, hostnames, authentication data and private URLs SHALL stay
   out of every GitHub write.
3. Dispatch, claims, reports, checks and landing SHALL keep their current
   rules. Opening a task or alert SHALL never start or replace a worker.

## Design

### D1. Resolve the exact destination

A link carries a workspace and a reference to one worker attempt or
one decision. Avoozl resolves the reference against current records.
The host determines how to open that destination. The reference grants
no access. Reads check the workspace and destination before disclosing
details. Opening a link leaves the source task available when you return.

### D2. Worker chat or log

Use the existing session binding or process log.

On Kiro Crew 0.13, use the existing local chat route or the Remote Crew
route with the configured Crew ID and slot. In standalone Avoozl, use an
owner-configured web dashboard address when available. A configured
desktop target can use Kiro Crew's registered chat link. Construct links
from validated IDs and trusted host settings. Keep credentials out of URLs.
Kiro Crew streams the open chat and handles steering under its existing
permissions. Avoozl only opens the destination.
If no supported destination is known, show the worker name and last
known state. For process workers use the existing log view where available.

WP6.1 of the worker-paths spec allows read-only links to an existing chat
on another Crew. Avoozl creates sessions only on this machine.

### D3. Decision alerts

Keep the existing decision and notification sources. Reuse a stable
decision record ID where one exists. For rows without one, record an
opaque ID for that occurrence when the alert is created, including the
workspace and the row it represents. Use that ID on both the dashboard
notice and the DM. After sign-in, open the right workspace and select the
exact row even if the user's current filters hide it. If it was resolved,
send the user to a resolved state with a link back to Needs you.

On Kiro Crew 0.13 the app notification URL is a dashboard-relative path.
The DM bridge prints that path as text. Clickable native DMs need a Kiro
Crew bridge change to turn validated dashboard paths into links using the
owner's configured HTTPS dashboard address. The gateway owns that
conversion. Without link support, the native alert and its dashboard
link still arrive. Keep the existing standalone command and webhook sinks
and give them the same exact target when a reachable standalone address
is configured. DMs carry a short summary. Private details stay behind
sign-in in Avoozl.

## Tasks

- [x] `dl-1` Open exact decisions from notices [DL2, DL3] (§D1, §D3)
  - A notice opens its exact decision in the right workspace in both views. Sign-in and reload preserve the target. Filters cannot silently hide it. A closed decision or a new decision for the same task does not redirect the old link to the new decision.
  - Wire the Needs you route and the existing Avoozl app and standalone notification payloads to the same stable decision target.

- [x] `dl-2` Open existing worker attempts [DL1, DL3] (§D1, §D2)
  - In flight and task detail open the exact local or remote attempt when configured. Verify live output in a real Remote Crew chat and steer the same running turn on a supported harness. Cover starting and superseded attempts. Cover disconnected and missing destinations as well as process logs. Reads leave GitHub and both task and worker state untouched.
  - Add the host-specific chat actions.

- [ ] `dl-3` Verify clickable Kiro Crew DMs [DL2, DL3] (§D3) (**MANUAL**)
  - An enabled owner DM opens the exact decision after sign-in on a Kiro Crew build with bridge link support. Delivery and the dashboard notice still work with the current bridge or no HTTPS address.
  - This task needs the Kiro Crew bridge change in D3. The other tasks can ship while it is pending. Verify with a test decision and an owner-configured test channel.
