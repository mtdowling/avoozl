"""The avoozl-tick script cron (design §4.6).

It holds no planning logic. It reads the status of the sessions this cron
opened, hands them to the Avoozl MCP server's tick, and carries out the
intents it returns: open and bind sessions before their first brief and send
messages. Notifications are not sent from here: the tick queues them and the
app backend pushes them to the app's channels. Statuses go in first, so after a restart
nothing new is dispatched before every bound session has been observed. A
tick with nothing to do raises Skip, so it stays silent.

Every ``plans_*`` tool takes its arguments wrapped as ``{"input": {...}}``.
"""

import json
import importlib.util
from pathlib import Path

try:
    from kiro_crew.cron_script import Skip
except ImportError:  # Outside Kiro Crew (tests): the same flow-control contract.

    class Skip(Exception):
        """Abort this tick silently."""


# Kiro Crew registers an app's MCP servers as ``<app>:<server>``.
AVOOZL = "avoozl:avoozl"


def _json(text):
    """Parse a tool's text result, or return the text when it is not JSON."""
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return text


def plans(ctx, tool, args=None):
    return _json(ctx.call_tool(AVOOZL, tool, {"input": args or {}}))


# The provider adapter is app-local; no system Python package is required.
_spec = importlib.util.spec_from_file_location(
    "avoozl_kirocrew_executor",
    Path(__file__).resolve().parents[1] / "executors" / "kirocrew.py",
)
_executor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_executor)


def run(ctx):
    executor = _executor.KiroCrewExecutor(
        ctx, lambda binding: plans(ctx, "plans_bind_session", binding)
    )
    args = {"cron": True, **executor.observations()}
    intents = plans(ctx, "plans_tick", args)
    if not isinstance(intents, dict) or intents.get("skipped"):
        raise Skip()

    opened = 0
    for d in intents.get("dispatch") or []:
        try:
            executor.start(*executor.arguments(d))
        except _executor.StartRefused:
            continue
        opened += 1

    # One refused message must not end the run: the rest still go, and a run
    # that failed every tick would get the cron auto-paused (five in a row).
    # Kiro Crew refuses a session another cron job opened (not_creator), as
    # after an app reinstall gives the tick a new job.
    # shortcut: Avoozl marks a message sent when it plans it, so a refused one
    # is not retried; report refusals to the tick once it can take them.
    messages = intents.get("messages") or []
    refused = []
    for m in messages:
        try:
            if executor.send(m["slot"], m["text"]) == "refused":
                raise RuntimeError("The session message was refused.")
        except Exception as error:  # the gateway refused this one session
            refused.append("%s: %s" % (m["slot"], str(error)[:200]))

    # Notices reach the person on the app's own notification channels, with a
    # link to the session: the tick queued them, and the app backend pushes
    # them when this tick's health receipt lands (src/app/notifications.mjs).
    notify = intents.get("notify") or []

    if not (opened or messages or notify):
        raise Skip()
    # The run's summary (cron history) names what did not get through.
    if refused:
        return "%d message(s) refused: %s" % (len(refused), "; ".join(refused))
