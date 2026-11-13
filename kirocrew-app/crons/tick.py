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


def find_or_create(ctx, folder):
    """Return (id, project_dir) of a session folder named by a slash path.

    Missing parts are created. project_dir is the nearest one declared on the
    path, since a session inherits its project from its folder's chain.
    """
    if not folder:
        return "", ""
    folders = ctx.list_session_folders()
    parent, project_dir = "", ""
    for name in [part for part in folder.split("/") if part]:
        match = next(
            (
                f
                for f in folders
                if f.get("name") == name and (f.get("parent_id") or "") == parent
            ),
            None,
        )
        if match is None:
            match = ctx.create_session_folder(name, parent_id=parent)
            folders.append(match)
        parent = match["id"]
        project_dir = match.get("project_dir") or project_dir
    return parent, project_dir


def read_sessions(ctx):
    """The status of every session this job opened, or None when unreadable.

    One read per tick through Kiro Crew's ScriptContext.session_status (MC-2),
    closed and lost sessions included. A stock Kiro Crew has no such method;
    the Avoozl app backend then reads each session itself after this tick's
    receipt lands (src/app/session-observer.mjs), and None tells the tick so.
    """
    if not callable(getattr(ctx, "session_status", None)):
        return None
    try:
        result = ctx.session_status()
    except Exception:  # the roster route refused
        return None
    if not isinstance(result, dict) or result.get("ok") is False:
        return None
    rows = result.get("sessions") or []
    return [
        session_row(row)
        for row in rows
        if isinstance(row, dict) and isinstance(row.get("target"), str) and isinstance(row.get("status"), str)
    ]


# The model fields a newer Kiro Crew adds to each row (§5.2): the model asked
# for, the one the newest completed turn ran on, and whether Kiro Crew withheld
# the asked model or changed it mid-session. An older Kiro Crew sends none, and
# the tick then trusts the requested model.
MODEL_FIELDS = ("model_requested", "served_model", "model_withheld", "model_changed")


def session_row(row):
    out = {"target": row["target"], "status": row["status"]}
    if "served_model" in row:
        for key in MODEL_FIELDS:
            if key in row:
                out[key] = row[key]
    return out


def run(ctx):
    sessions = read_sessions(ctx)
    # cron marks the caller as the script that carries out intents, roster or not.
    args = {"cron": True}
    if sessions is not None:
        args["sessions"] = sessions
    intents = plans(ctx, "plans_tick", args)
    if not isinstance(intents, dict) or intents.get("skipped"):
        raise Skip()

    opened = 0
    for d in intents.get("dispatch") or []:
        folder, project_dir = find_or_create(ctx, d.get("folder", ""))
        # MC-1: a session takes its project from its folder, which only a
        # person can set. Without one the worker would run outside the checkout.
        # shortcut: a folder with no project directory waits silently; the
        # Workspace view should say "Set project directory" once it reads folders.
        # A code review chat needs no checkout and says so with project False.
        if not project_dir and d.get("project", True):
            continue
        # A named model is the one review roles are kept distinct from (§5.2);
        # without one the session runs on the agent's own model.
        extra = {"model": d["model"]} if d.get("model") else {}
        slot = ctx.open_session(d["title"], folder_id=folder, agent=d.get("agent", ""), **extra)
        # Bound before the brief, so a crash between open and send leaves a
        # bound, empty session the next tick messages (§4.6). The binding
        # records the model it was opened on and the commit it judges.
        binding = {"taskId": d["task"], "slot": slot, "title": d["title"], "source": "tick"}
        for key in ("role", "attempt", "model", "commit", "batch"):
            if d.get(key):
                binding[key] = d[key]
        plans(ctx, "plans_bind_session", binding)
        ctx.send_to_session(slot, d["brief"])
        opened += 1

    messages = intents.get("messages") or []
    for m in messages:
        ctx.send_to_session(m["slot"], m["text"])

    # Notices reach the person on the app's own notification channels, with a
    # link to the session: the tick queued them, and the app backend pushes
    # them when this tick's health receipt lands (src/app/notifications.mjs).
    notify = intents.get("notify") or []

    if not (opened or messages or notify):
        raise Skip()
