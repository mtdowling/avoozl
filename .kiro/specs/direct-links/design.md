# Design: Direct links to work and decisions

## D1. Resolve the exact destination

A link carries a workspace and a reference to one worker attempt or
one decision. Avoozl resolves the reference against current records.
The host determines how to open that destination. The reference grants
no access. Reads check the workspace and destination before disclosing
details. Opening a link leaves the source task available when you return.

## D2. Worker chat or log

For local work, use the existing session binding or process log. For
worker-pull work, use the driver's grant for the claim to find the exact
attempt on the worker. Keep the grant-to-attempt mapping on the worker
and consult it through an owner-authorized, read-only lookup on the
configured worker host. Match the exact grant before returning machine
and target information. The worker's existing status read already has
the local slot once the session binds. Avoozl's worker protocol still
carries the same claims, grants and results.

On Kiro Crew 0.13, use the existing local chat route or the Remote Crew
route with the configured Crew ID and slot. In standalone Avoozl, use an
owner-configured web dashboard address when available. A configured
desktop target can use Kiro Crew's registered chat link. Construct links
from validated IDs and trusted host settings. Keep credentials out of URLs.
Kiro Crew streams the open chat and handles steering under its existing
permissions. Avoozl only opens the destination.
If no supported destination is known, show the worker name and last
known state. For process workers use the existing log view where available.

Amend WP6.1 of the worker-paths spec to allow read-only links to an
existing chat on another Crew. WP5's worker-pull protocol and WP6's
local-only session creation still apply.

## D3. Decision alerts

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
conversion. Until it supports links, keep the native alert and its
dashboard link. Keep the existing standalone command and webhook sinks
and give them the same exact target when a reachable standalone address
is configured. DMs carry a short summary. Private details stay behind
sign-in in Avoozl.
