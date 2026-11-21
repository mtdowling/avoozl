"""Kiro Crew implementation of the portable executor contract.

Folder/project inheritance and ScriptContext session calls stay private here.
The installed app and a source checkout read the same contract data.
"""

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

_APP = Path(__file__).resolve().parents[1]
_CONTRACT_PATH = next(
    (
        path
        for path in (
            _APP / "bin" / "lib" / "src" / "executor-contract.json",
            _APP.parent / "src" / "executor-contract.json",
        )
        if path.is_file()
    ),
    None,
)
if _CONTRACT_PATH is None:
    raise RuntimeError("The executor contract is missing from the app package.")
CONTRACT = json.loads(_CONTRACT_PATH.read_text())


class StartRefused(Exception):
    """A refusal is releasable only before an open call was attempted."""

    def __init__(self, message, before_open=False):
        super().__init__(message)
        self.before_open = before_open


class ObservationUnavailable(Exception):
    """No authoritative reading; preserve the last observed state."""


def _not_creator(error):
    return "not_creator" in str(error).lower()


def _recovery_title(title, claim):
    """A stable, non-secret title for a claim colliding with an old cron."""
    suffix = " retry-" + hashlib.sha256(claim.encode()).hexdigest()[:8]
    return title[: 200 - len(suffix)].rstrip() + suffix


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


def read_sessions(ctx, strict=False):
    """The status of every session this job opened, or None when unreadable.

    One read per tick through Kiro Crew's ScriptContext.session_status (MC-2),
    closed and lost sessions included. A stock Kiro Crew has no such method;
    the Avoozl app backend then reads each session itself after this tick's
    receipt lands (src/app/executors/kirocrew/session-observer.ts), and None tells the tick so.
    """
    if not callable(getattr(ctx, "session_status", None)):
        return None
    try:
        result = ctx.session_status()
    except Exception:  # the roster route refused
        return None
    if not isinstance(result, dict) or result.get("ok") is False:
        return None
    if strict and not isinstance(result.get("sessions"), list):
        return None
    rows = result.get("sessions") or []
    if not isinstance(rows, list):
        return None
    if strict and any(
        not isinstance(row, dict)
        or not isinstance(row.get("target"), str)
        or not isinstance(row.get("status"), str)
        for row in rows
    ):
        return None
    return [
        session_row(row)
        for row in rows
        if isinstance(row, dict)
        and isinstance(row.get("target"), str)
        and isinstance(row.get("status"), str)
    ]


# The model fields a newer Kiro Crew adds to each row (§5.2): the model asked
# for, the one the newest completed turn ran on, and whether Kiro Crew withheld
# the asked model or changed it mid-session. An older Kiro Crew sends none, and
# the tick then trusts the requested model.
MODEL_FIELDS = ("model_requested", "served_model", "model_withheld", "model_changed")
WORKSPACE_FIELD = "_avoozlWorkspaceId"


def session_row(row):
    out = {"target": row["target"], "status": row["status"]}
    if "served_model" in row:
        for key in MODEL_FIELDS:
            if key in row:
                out[key] = row[key]
    return out


def folder_projects(ctx):
    """{slash path: has a project directory} for every session folder.

    A folder inherits the nearest project directory up its chain. None when
    the folders cannot be read; the tick then plans as before.
    """
    try:
        folders = ctx.list_session_folders()
    except Exception:
        return None
    by_id = {f.get("id"): f for f in folders if isinstance(f, dict)}
    out = {}
    for f in by_id.values():
        names, project, cur, seen = [], "", f, set()
        while cur is not None and cur.get("id") not in seen:
            seen.add(cur.get("id"))
            names.append(cur.get("name") or "")
            project = project or cur.get("project_dir") or ""
            cur = by_id.get(cur.get("parent_id") or "")
        out["/".join(reversed(names))] = bool(project)
    return out


# Requirement 88.1: an unattended worker chat stalls on tool approval unless
# the chat is trusted, and a gateway restart drops the mode. Avoozl sets it
# when the chat opens and again on every tick. A runner-mode worker (remote)
# keeps its own opt-in mode, as before.
WORKER_MODE = "trust"
MODES = ("trust", "trust_reads")


def _mode(request):
    if request.get("mode") in MODES:
        return request["mode"]
    if request.get("lane"):
        # A lane chat, worker or reviewer (simplify D22.1): the reviewer runs
        # git and the checks, and trust_reads allows no shell.
        return WORKER_MODE
    if (request.get("role") or "worker") == "worker" and not request.get("remote"):
        return WORKER_MODE
    return None


def reset_conversation(ctx, slot):
    """Clear a lane chat's conversation for its next task (simplify D22.1).

    Kiro Crew lets a cron reset a chat it opened, with
    POST /api/chat/slots/<slot>/reset-conversation; replay false keeps the
    old transcript out of the new context. Returns "reset", "busy" (a turn
    is running), or "gone" (no such chat, or not this cron's).
    shortcut: ScriptContext has no method for this route, so this calls its
    _post, which the context documents for routes it does not wrap; use a
    public method once Kiro Crew adds one.
    """
    own = getattr(ctx, "reset_session", None)
    path = "/api/chat/slots/%s/reset-conversation" % quote(slot, safe="")
    result = own(slot) if callable(own) else ctx._post(path, {"replay": False})
    if isinstance(result, dict) and result.get("reset") is True:
        return "reset"
    if isinstance(result, dict) and result.get("status_code") == 409:
        return "busy"
    return "gone"


def keep_title(ctx, slot, header):
    """Set a lane chat's title back to its header when it reads another
    (simplify D22.1). Best effort: a gateway that refuses either call keeps
    the title it has, and the next run tries again.
    shortcut: ScriptContext wraps neither the slot read nor the rename, so
    this builds both on its own credential, as _post does.
    """
    import urllib.request

    try:
        base = "http://127.0.0.1:%s/api/chat/slots/%s" % (ctx._port, quote(slot, safe=""))
        current = ctx._exchange(
            urllib.request.Request(base + "?limit=1", headers=ctx._headers(), method="GET")
        )
        if not isinstance(current, dict) or "error" in current:
            return
        if current.get("title") == header:
            return
        ctx._exchange(
            urllib.request.Request(
                base + "/title",
                data=json.dumps({"title": header}).encode(),
                headers={**ctx._headers(), "Content-Type": "application/json"},
                method="PATCH",
            )
        )
    except Exception:  # an older gateway, or a chat that just went away
        pass


def _text(value, name, nullable=False, empty=False):
    if nullable and value is None:
        return
    if not isinstance(value, str) or (not empty and not value.strip()):
        raise ValueError(name + " must be a string")


class KiroCrewExecutor:
    def __init__(self, ctx, bind):
        self._ctx = ctx
        self._bind = bind
        self._requests = {}
        self._active_claims = {}
        self._trusted = set()  # Chats whose mode this run already set.

    def _set_mode(self, slot, mode):
        self._trusted.add(slot)
        try:
            self._ctx.set_session_mode(slot, mode)
        except Exception:  # an older gateway, or a chat that just went away
            pass

    def _open(self, d, title, **arguments):
        try:
            return self._ctx.open_session(title, **arguments), title
        except Exception as error:
            claim = d.get("_claim")
            if not claim or not _not_creator(error):
                raise
            recovered = _recovery_title(title, claim)
            return self._ctx.open_session(recovered, **arguments), recovered

    def keep_trust(self, observed):
        """Set each observed worker chat's trust mode again, once per chat,
        and a lane chat's fixed header when its title changed."""
        for row in observed or []:
            if not isinstance(row, dict):
                continue
            slot = row.get("slot")
            if isinstance(slot, str) and slot and row.get("header"):
                keep_title(self._ctx, slot, row["header"])
            slot = row.get("slot")
            if (
                isinstance(slot, str)
                and slot
                and slot not in self._trusted
                and ((row.get("role") or "worker") == "worker" or row.get("lane"))
            ):
                self._set_mode(slot, WORKER_MODE)

    def observations(self):
        out = {}
        sessions = read_sessions(self._ctx)
        if sessions is not None:
            out["sessions"] = sessions
        projects = folder_projects(self._ctx)
        if projects is not None:
            out["folders"] = projects
        return out

    def owns(self, request):
        return request.get("executor", "kirocrew") == "kirocrew"

    def _transport(self, action, payload, workspace=None):
        if workspace:
            payload = {**payload, WORKSPACE_FIELD: workspace}
        result = self._ctx.call_tool("avoozl:avoozl", "plans_executor", {"action": action, "input": payload})
        return json.loads(result) if isinstance(result, str) else result

    def _take(self, request):
        if not self.owns(request):
            return None
        if not request.get("id") or not request.get("version"):
            return request  # Compatibility with a previous app's dispatch.
        workspace = request.get(WORKSPACE_FIELD)
        taken = self._transport(
            "take",
            {"id": request["id"], "version": request["version"]},
            workspace,
        )
        if not isinstance(taken, dict) or not isinstance(taken.get("request"), dict):
            return None
        self._active_claims[(workspace, request["id"])] = taken["claimToken"]
        routed = {
            **taken.get("configuration", {}),
            **taken["request"],
            "_claim": taken["claimToken"],
        }
        if workspace:
            routed[WORKSPACE_FIELD] = workspace
        return routed

    def arguments(self, request):
        request = self._take(request)
        if request is None:
            return None
        role = request.get("role", "worker")
        self._requests[(role, request["task"])] = dict(request)
        values = {
            "role": role,
            "task": request["task"],
            "worktree": request.get("worktree") or request.get("checkout"),
            "brief": request["brief"],
            "model": request.get("model") or None,
            "permissionClass": request.get("permissionClass") or ("write" if role in ("worker", "planner", "plan-answer") else "read"),
        }
        return tuple(values[field] for field in CONTRACT["start"])

    def start(self, role, task, worktree, brief, model, permissionClass):
        _text(role, "role")
        _text(task, "task")
        _text(worktree, "worktree", nullable=True)
        _text(brief, "brief", empty=True)
        _text(model, "model", nullable=True)
        if permissionClass not in CONTRACT["permissionClasses"]:
            raise ValueError("permissionClass must be read or write")
        d = self._requests.pop((role, task), None) or {
            "task": task,
            "role": role,
            "title": "avoozl:" + task,
        }
        lane = d.get("lane") if isinstance(d.get("lane"), dict) else None
        if lane and lane.get("slot") and lane.get("resume"):
            # A review round on the same task continues in the same chat.
            return self._brief(lane["slot"], d, task, role, brief, permissionClass)
        if lane and lane.get("slot"):
            # The lane's chat takes its next task with a clear context.
            cleared = reset_conversation(self._ctx, lane["slot"])
            if cleared == "busy":
                raise StartRefused("The lane chat has a turn running.", before_open=True)
            if cleared == "reset":
                return self._brief(lane["slot"], d, task, role, brief, permissionClass)
        folder, project_dir = find_or_create(self._ctx, d.get("folder", ""))
        if not project_dir and d.get("project", True):
            raise StartRefused("The chat folder has no project directory.", before_open=True)
        extra = {"model": model} if model else {}
        if lane:
            # A lane chat opens once, named by its fixed header, which Kiro
            # Crew pins so its own titles never replace it.
            slot, _opened_title = self._open(
                d,
                lane["header"],
                folder_id=folder,
                agent=d.get("agent", ""),
                **extra,
            )
            _text(slot, "sessionId")
            # A header Kiro Crew already holds hands back that chat, which may
            # keep an old context; opening by name again is harmless, so a
            # busy chat releases the request for the next tick.
            if reset_conversation(self._ctx, slot) == "busy":
                raise StartRefused("The lane chat has a turn running.", before_open=True)
            return self._brief(slot, d, task, role, brief, permissionClass)
        if d.get("crew"):
            try:
                slot, opened_title = self._open(
                    d,
                    d["title"],
                    agent=d.get("agent", ""),
                    crew=d["crew"],
                    **extra,
                )
            except TypeError as error:
                raise StartRefused("This gateway cannot open a remote session.") from error
        else:
            slot, opened_title = self._open(
                d,
                d["title"],
                folder_id=folder,
                agent=d.get("agent", ""),
                **extra,
            )
        _text(slot, "sessionId")
        if opened_title != d["title"]:
            d["title"] = opened_title
        return self._brief(slot, d, task, role, brief, permissionClass)

    def _brief(self, slot, d, task, role, brief, permissionClass):
        """Bind the opened chat, set its mode, and send its first brief."""
        lane = d.get("lane") if isinstance(d.get("lane"), dict) else None
        binding = {
            "taskId": task,
            "slot": slot,
            "title": lane["header"] if lane else d["title"],
            "source": "tick",
        }
        if lane:
            binding["lane"] = lane["id"]
        for key in (
            "role", "attempt", "model", "commit", "batch", "crew",
            "sessionReason", "investigate",
        ):
            if d.get(key):
                binding[key] = d[key]
        if d.get("sessionReason") and d.get("agent"):
            binding["agent"] = d["agent"]
        # Binding must land before the first message, including on a crash.
        if d.get("_claim"):
            binding.update({"permissionClass": permissionClass, "executor": "kirocrew", "requestId": d["id"], "claimToken": d["_claim"]})
            for key in ("worktree", "context"):
                if d.get(key): binding[key] = d[key]
        if d.get(WORKSPACE_FIELD):
            binding[WORKSPACE_FIELD] = d[WORKSPACE_FIELD]
        self._bind(binding)
        mode = _mode({**d, "role": role})
        if mode:
            self._set_mode(slot, mode)
        if self.send(slot, brief) == "refused":
            raise RuntimeError("The first session message was refused.")
        return slot

    def send(self, sessionId, text):
        _text(sessionId, "sessionId")
        _text(text, "text", empty=True)
        receipt = self._ctx.send_to_session(sessionId, text)
        if isinstance(receipt, dict) and receipt.get("ok") is False:
            return "refused"
        return "accepted"

    def status(self, sessionId):
        _text(sessionId, "sessionId")
        sessions = read_sessions(self._ctx, strict=True)
        if sessions is None:
            raise ObservationUnavailable("The gateway has no readable session roster.")
        row = next((row for row in sessions if row["target"] == sessionId), None)
        if row is None:
            return "gone"
        status = row["status"]
        if status in CONTRACT["statusValues"]:
            return status
        if (
            re.fullmatch(CONTRACT["exitStatusPattern"], status)
            and abs(int(status.split(" ")[1])) <= 9007199254740991
        ):
            return status
        if status == "queued":
            return "working"
        if status in ("closed", "lost"):
            return "gone"
        raise ObservationUnavailable("The gateway returned an unknown session status.")

    def release(self, request, refusal):
        if not refusal.before_open or not request.get("id"):
            return
        workspace = request.get(WORKSPACE_FIELD)
        saved = self._active_claims.pop((workspace, request["id"]), None)
        if saved:
            self._transport(
                "release",
                {"id": request["id"], "claimToken": saved, "reason": "before-open"},
                workspace,
            )

    def message(self, request):
        return self._take(request)

    def complete_message(self, request, outcome):
        if request.get("_claim"):
            self._transport(
                "complete",
                {"id": request["id"], "claimToken": request["_claim"], "outcome": outcome},
                request.get(WORKSPACE_FIELD),
            )
