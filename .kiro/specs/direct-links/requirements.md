# Requirements: Direct links to work and decisions

## Goal

From a task or an alert, open the exact place where you can act. A task
opens its worker attempt. An alert opens its decision in Needs you.

### Requirement DL1: Open the exact worker attempt

**User story:** As an owner looking at a task, I want to open its worker
chat or log, even when the worker runs on another machine.

1. In flight and the task detail SHALL show the worker machine and an
   action for the displayed attempt when a destination is available:
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

### Requirement DL2: Open the exact decision

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

### Requirement DL3: Opening a link is read-only

1. Opening a link SHALL use the destination's existing sign-in and access
   checks. Approvals and decisions use their existing actions in Avoozl.
2. Worker discovery SHALL be an owner-authorized read. GitHub journals
   SHALL retain their current IDs-only format. Chat IDs, hostnames,
   authentication data and private URLs stay out of those journals.
3. Dispatch, claims, reports, checks and landing SHALL keep their current
   rules. Opening a task or alert SHALL never start or replace a worker.
