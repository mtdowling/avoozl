"""Deterministically submit GitHub repository snapshots to Avoozl.

This script never launches an agent and never mutates GitHub. It reads open
issues and pull requests and submits a complete generation to one local,
ingest-only Avoozl callback. Public repositories run in observation-only mode,
which cannot submit ready-label authorization. For private authorization mode,
ready-label metadata is advisory: Avoozl re-reads GitHub before authorization.
Avoozl remains responsible for replay protection, leases, task creation, and
every later lifecycle transition.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CONFIG_PATH_ENV = "AUTOMATION_CONFIG_PATH"
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
LOGIN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
SECRET_NAME = re.compile(r"^[A-Z_][A-Z0-9_]{0,127}$")
CALLBACK_HOSTS = {"127.0.0.1", "::1", "localhost", "host.docker.internal"}
GITHUB_API = "https://api.github.com"
API_VERSION = "2022-11-28"


def load_config(path: str | None = None) -> dict:
    source = Path(path or os.environ.get(CONFIG_PATH_ENV, ""))
    if not source.is_file():
        raise ValueError(f"{CONFIG_PATH_ENV} must name a regular config file")
    config = json.loads(source.read_text())
    allowed = {
        "repositories",
        "mode",
        "repository_private",
        "assignee",
        "ready_label",
        "schedule",
        "timezone",
        "callback_url",
        "ingest_secret_name",
        "github_secret_name",
    }
    unknown = sorted(config.keys() - allowed)
    if unknown:
        raise ValueError("unknown configuration: " + ", ".join(unknown))
    required = {
        "repositories",
        "mode",
        "repository_private",
        "callback_url",
        "ingest_secret_name",
    }
    missing = sorted(required - config.keys())
    if missing:
        raise ValueError("missing configuration: " + ", ".join(missing))
    repositories = config["repositories"]
    if (
        not isinstance(repositories, list)
        or not repositories
        or not all(isinstance(value, str) and REPOSITORY.fullmatch(value) for value in repositories)
    ):
        raise ValueError("repositories must contain owner/name values")
    mode = config["mode"]
    if mode not in {"authorization", "observation-only"}:
        raise ValueError("mode must be authorization or observation-only")
    repository_private = config["repository_private"]
    if not isinstance(repository_private, bool):
        raise ValueError("repository_private must be boolean")
    if mode == "authorization" and not repository_private:
        raise ValueError("authorization mode requires a private repository")
    assignee = config.get("assignee", "")
    if not isinstance(assignee, str) or (assignee and not LOGIN.fullmatch(assignee)):
        raise ValueError("assignee must be empty or a GitHub login")
    config["assignee"] = assignee
    ready_label = config.get("ready_label", "avoozl:ready")
    if not isinstance(ready_label, str) or not 1 <= len(ready_label) <= 50:
        raise ValueError("ready_label must contain 1 to 50 characters")
    schedule = config.get("schedule", "*/5 * * * *")
    timezone_name = config.get("timezone", "UTC")
    if not isinstance(schedule, str) or not 9 <= len(schedule) <= 100:
        raise ValueError("schedule must contain 9 to 100 characters")
    if not isinstance(timezone_name, str) or not 1 <= len(timezone_name) <= 100:
        raise ValueError("timezone must contain 1 to 100 characters")
    for key, default in (
        ("ingest_secret_name", None),
        ("github_secret_name", "GITHUB_PERSONAL_ACCESS_TOKEN"),
    ):
        value = config.get(key, default)
        if not isinstance(value, str) or not SECRET_NAME.fullmatch(value):
            raise ValueError(f"{key} must be an uppercase saved-secret name")
        config[key] = value
    callback = urllib.parse.urlsplit(config["callback_url"])
    if (
        callback.scheme not in {"http", "https"}
        or (callback.hostname or "").lower() not in CALLBACK_HOSTS
        or callback.username
        or callback.password
        or callback.query
        or callback.fragment
        or not callback.path.startswith("/")
    ):
        raise ValueError(
            "callback_url must be a credential-free local HTTP URL without query or fragment"
        )
    config["ready_label"] = ready_label
    config["schedule"] = schedule
    config["timezone"] = timezone_name
    return config


def session_key() -> str:
    return os.environ.get("SESSION_API_KEY") or os.environ.get("OH_SESSION_API_KEYS_0") or ""


def saved_secret(name: str) -> str:
    base = os.environ.get("AGENT_SERVER_URL", "").rstrip("/")
    if not base or not session_key():
        raise RuntimeError("OpenHands Agent Server secret access is unavailable")
    request = urllib.request.Request(
        f"{base}/api/settings/secrets/{urllib.parse.quote(name, safe='')}",
        headers={"X-Session-API-Key": session_key()},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        value = response.read().decode().strip()
    if value.startswith("{"):
        body = json.loads(value)
        value = str(body.get("value") or "").strip()
    if not value:
        raise RuntimeError(f"saved secret {name} is empty")
    return value


def github_get(token: str, pathname: str, query: dict | None = None):
    url = GITHUB_API + pathname
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "avoozl-github-intake",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def github_pages(token: str, pathname: str, query: dict | None = None):
    page = 1
    while page <= 20:
        values = github_get(token, pathname, {**(query or {}), "per_page": 100, "page": page})
        if not isinstance(values, list):
            raise RuntimeError("GitHub returned a non-list paginated response")
        yield from values
        if len(values) < 100:
            return
        page += 1
    raise RuntimeError("GitHub intake exceeded the 2,000-item safety limit")


def latest_label_event(token: str, repository: str, number: int, label: str) -> dict | None:
    events = github_pages(
        token,
        f"/repos/{repository}/issues/{number}/timeline",
        {"per_page": 100},
    )
    matches = [
        event
        for event in events
        if event.get("event") == "labeled"
        and (event.get("label") or {}).get("name") == label
    ]
    return matches[-1] if matches else None


def sha256(value) -> str:
    return hashlib.sha256(
        json.dumps(value, separators=(",", ":")).encode()
    ).hexdigest()


def repository_snapshot(repository: dict, observed_at: str, mode: str) -> tuple[dict, dict]:
    repository_value = {
        "id": repository["full_name"],
        "nodeId": repository.get("node_id"),
        "private": repository.get("private") is True,
        "mode": mode,
    }
    generation = {
        "id": sha256([repository_value["nodeId"], observed_at]),
        "observedAt": observed_at,
    }
    return repository_value, generation


def boundary(kind: str, repository: dict, generation: dict, **values) -> dict:
    body = {
        "schemaVersion": "avoozl.github-intake.v2",
        "kind": kind,
        "repository": repository,
        "generation": generation,
        **values,
    }
    if kind == "repository-start":
        identity = [generation["id"], "start"]
    else:
        identity = [
            generation["id"],
            "complete",
            body["counts"]["issues"],
            body["counts"]["pullRequests"],
            body["itemDigest"],
        ]
    body["deliveryId"] = sha256(identity)
    return body


def item_value(kind: str, value: dict) -> dict:
    item = {
        "kind": kind,
        "id": value.get("id"),
        "nodeId": value.get("node_id"),
        "number": value["number"],
        "title": value.get("title") or "",
        "body": value.get("body") or "",
        "url": value.get("html_url"),
        "state": value.get("state"),
        "author": (value.get("user") or {}).get("login"),
        "assignees": [
            entry.get("login")
            for entry in value.get("assignees") or []
            if entry.get("login")
        ],
        "labels": [
            entry.get("name")
            for entry in value.get("labels") or []
            if entry.get("name")
        ],
        "createdAt": value.get("created_at"),
        "updatedAt": value.get("updated_at"),
    }
    if kind == "pull-request":
        item.update(
            {
                "draft": value.get("draft") is True,
                "headBranch": (value.get("head") or {}).get("ref"),
                "headSha": (value.get("head") or {}).get("sha"),
                "baseBranch": (value.get("base") or {}).get("ref"),
            }
        )
    return item


def item_snapshot(
    repository: dict,
    generation: dict,
    item: dict,
    authorization: dict | None = None,
) -> dict:
    body = {
        "schemaVersion": "avoozl.github-intake.v2",
        "kind": "item",
        "repository": repository,
        "generation": generation,
        "item": item,
        "authorization": authorization,
    }
    body["deliveryId"] = sha256(
        [generation["id"], item["kind"], item["nodeId"], item["updatedAt"]]
    )
    return body


def submit(callback_url: str, token: str, body: dict) -> dict:
    request = urllib.request.Request(
        callback_url,
        data=json.dumps(body, separators=(",", ":")).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Avoozl-Intake-Version": "2",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        result = response.read().decode().strip()
    return json.loads(result) if result else {}


def run(config: dict) -> list[dict]:
    github_token = saved_secret(config["github_secret_name"])
    ingest_token = saved_secret(config["ingest_secret_name"])
    observed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    receipts = []
    for repository_id in config["repositories"]:
        repository = github_get(github_token, f"/repos/{repository_id}")
        if (repository.get("private") is True) != config["repository_private"]:
            expected = "private" if config["repository_private"] else "public"
            raise RuntimeError(f"{repository_id} is not {expected}")
        repository_value, generation = repository_snapshot(
            repository,
            observed_at,
            config["mode"],
        )
        started = boundary(
            "repository-start",
            repository_value,
            generation,
        )
        submit(config["callback_url"], ingest_token, started)
        issues = [
            issue
            for issue in github_pages(
                github_token,
                f"/repos/{repository_id}/issues",
                {"state": "open", "sort": "updated", "direction": "asc"},
            )
            if not issue.get("pull_request")
        ]
        pulls = list(
            github_pages(
                github_token,
                f"/repos/{repository_id}/pulls",
                {"state": "open", "sort": "updated", "direction": "asc"},
            )
        )
        keys = []
        for issue in issues:
            labels = [
                value.get("name")
                for value in issue.get("labels") or []
                if value.get("name")
            ]
            assignees = [
                value.get("login")
                for value in issue.get("assignees") or []
                if value.get("login")
            ]
            event = (
                latest_label_event(
                    github_token,
                    repository_id,
                    issue["number"],
                    config["ready_label"],
                )
                if config["mode"] == "authorization"
                and config["ready_label"] in labels
                and (
                    not config["assignee"]
                    or config["assignee"] in assignees
                )
                else None
            )
            authorization = (
                {
                    "eventId": event.get("node_id") or event.get("id"),
                    "actor": (event.get("actor") or {}).get("login"),
                    "createdAt": event.get("created_at"),
                    "label": (event.get("label") or {}).get("name"),
                }
                if event
                else None
            )
            item = item_value("issue", issue)
            candidate = item_snapshot(
                repository_value,
                generation,
                item,
                authorization,
            )
            receipt = submit(config["callback_url"], ingest_token, candidate)
            keys.append(f"issue:{item['nodeId']}")
            receipts.append(
                {
                    "deliveryId": candidate["deliveryId"],
                    "repository": repository_id,
                    "kind": "issue",
                    "number": issue["number"],
                    "receipt": receipt,
                }
            )
        for pull in pulls:
            item = item_value("pull-request", pull)
            candidate = item_snapshot(repository_value, generation, item)
            receipt = submit(config["callback_url"], ingest_token, candidate)
            keys.append(f"pull-request:{item['nodeId']}")
            receipts.append(
                {
                    "deliveryId": candidate["deliveryId"],
                    "repository": repository_id,
                    "kind": "pull-request",
                    "number": pull["number"],
                    "receipt": receipt,
                }
            )
        completed = boundary(
            "repository-complete",
            repository_value,
            generation,
            counts={"issues": len(issues), "pullRequests": len(pulls)},
            itemDigest=sha256(sorted(keys)),
        )
        submit(config["callback_url"], ingest_token, completed)
    return receipts


def main() -> None:
    config = load_config()
    if "--check-config" in sys.argv:
        print(
            json.dumps(
                {
                    "valid": True,
                    "repositories": config["repositories"],
                    "mode": config["mode"],
                    "repositoryPrivate": config["repository_private"],
                    "assignee": config["assignee"],
                    "callbackHost": urllib.parse.urlsplit(config["callback_url"]).hostname,
                    "ingestSecretName": config["ingest_secret_name"],
                },
                sort_keys=True,
            )
        )
        return
    print(json.dumps({"receipts": run(config)}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"avoozl-github-intake: {error}", file=sys.stderr)
        raise SystemExit(1) from error
