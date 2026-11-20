---
repo: avoozl
completion: integrated
---
# Tasks: Direct links to work and decisions

- [x] dl-1 Open exact decisions from notices [DL2, DL3] (§D1, §D3)
  - $done: A notice opens its exact decision in the right workspace in both views. Sign-in and reload preserve the target. Filters cannot silently hide it. A closed decision or a new decision for the same task does not redirect the old link to the new decision.
  - Wire the Needs you route and the existing Avoozl app and standalone notification payloads to the same stable decision target.

- [x] dl-2 Open existing worker attempts [DL1, DL3] (§D1, §D2)
  - $done: In flight and task detail open the exact local or remote attempt when configured. Verify live output in a real Remote Crew chat and steer the same running turn on a supported harness. Cover starting and superseded attempts. Cover disconnected and missing destinations as well as process logs. Reads leave GitHub and both task and worker state untouched.
  - Add the private grant lookup and host-specific chat actions. Update WP6.1 for read-only links.

- [ ] dl-3 Verify clickable Kiro Crew DMs [DL2, DL3] (§D3)
  - $done: An enabled owner DM opens the exact decision after sign-in on a Kiro Crew build with bridge link support. Delivery and the dashboard notice still work with the current bridge or no HTTPS address.
  - $manual: true
  - $after: dl-1
  - This task needs the Kiro Crew bridge change in D3. The other tasks can ship while it is pending. Verify with a test decision and an owner-configured test channel.
