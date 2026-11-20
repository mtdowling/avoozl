"""The avoozl-tick script cron (machine-server MS12, design D5).

Kiro Crew lets only the cron that opened a chat control it, so after the
tick this cron does the three things only it can: open and bind each chat the
tick released, send each released message, and set trust mode again on the
chats it owns. ``plans_maintain tick`` with ``cron: true`` runs this machine's
one tick pass (the tick, the drain and the notifications, as ``avoozl tick``
does), records the session statuses it read, and returns the released
intents. With nothing to do it raises Skip, so it stays silent.

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


def plans(ctx, tool, action, args=None):
    return _json(ctx.call_tool(AVOOZL, tool, {"action": action, "input": args or {}}))


# The provider adapter is app-local; no system Python package is required.
_spec = importlib.util.spec_from_file_location(
    "avoozl_kirocrew_executor",
    Path(__file__).resolve().parents[1] / "executors" / "kirocrew.py",
)
_executor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_executor)


def run(ctx):
    executor = _executor.KiroCrewExecutor(
        ctx, lambda binding: plans(ctx, "plans_session", "bind", binding)
    )
    args = {"cron": True, **executor.observations()}
    intents = plans(ctx, "plans_maintain", "tick", args)
    if not isinstance(intents, dict) or intents.get("skipped"):
        raise Skip()

    # A gateway restart drops a chat's trust mode, so every live worker chat
    # gets it again before anything new is sent (Requirement 88.1).
    executor.keep_trust(intents.get("observe"))

    opened = 0
    for d in intents.get("dispatch") or []:
        if not executor.owns(d):
            continue
        try:
            arguments = executor.arguments(d)
            if arguments is None:
                continue
            executor.start(*arguments)
        except _executor.StartRefused as refusal:
            executor.release(d, refusal)
            continue
        opened += 1

    # One refused message must not end the run: the rest still go, and a run
    # that failed every tick would get the cron auto-paused (five in a row).
    # Kiro Crew refuses a session another cron job opened (not_creator), as
    # after an app reinstall gives the tick a new job.
    # Complete each claimed message once, including a refused send.
    messages = [
        message for message in intents.get("messages") or []
        if executor.owns(message)
    ]
    refused = []
    for original in messages:
        m = executor.message(original)
        if m is None:
            continue
        try:
            if executor.send(m["slot"], m["text"]) == "refused":
                raise RuntimeError("The session message was refused.")
        except Exception as error:  # the gateway refused this one session
            executor.complete_message(m, "refused")
            refused.append("%s: %s" % (m["slot"], str(error)[:200]))
        else:
            executor.complete_message(m, "sent")

    if not (opened or messages):
        raise Skip()
    # The run's summary (cron history) names what did not get through.
    if refused:
        return "%d message(s) refused: %s" % (len(refused), "; ".join(refused))
