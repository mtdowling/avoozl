# Trace into task details (2026-11-17)

Trace is removed. Task details' Timeline box now lists the task's own steps
from stored records: spec approved, ready, started (each attempt), failed
attempts, checks, landed (commit), builds by phase, integrated. Each step shows
its time and the wait since the step before. It makes no GitHub call.

Shots are inside the full app (harness `?page=app`), the drawer scrolled to the
Timeline box, with Kiro Crew's stylesheet. To make them again:

    AVOOZL_HOST_CSS=<host css> node kirocrew-app/ui/test/browser/task-timeline-shots.mjs <out>
