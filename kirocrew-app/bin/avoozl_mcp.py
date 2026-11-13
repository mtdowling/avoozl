"""Start the Avoozl stdio MCP server from the installed app package.

Kiro Crew starts app MCP servers in the session's working directory and
anchors only a relative ``.py`` launcher to the app's install root, so a
relative ``bin/avoozl.mjs`` argument to ``node`` would not be found. This file
is that anchor: it replaces itself with ``node <app>/bin/avoozl.mjs mcp``.
"""

import os
import shutil
import sys
from pathlib import Path

# The Mac app does not inherit the login shell's PATH.
FALLBACKS = ("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node")


def node() -> str:
    found = shutil.which("node") or next((p for p in FALLBACKS if os.access(p, os.X_OK)), None)
    if not found:
        sys.exit("avoozl: node was not found on PATH.")
    return found


def main() -> None:
    entry = Path(__file__).resolve().with_name("avoozl.mjs")
    executable = node()
    # --kirocrew: each request picks its workspace from the gateway's caller
    # block, so one process may serve many sessions (src/app/app-mcp.mjs).
    os.execv(executable, [executable, str(entry), "mcp", "--kirocrew", *sys.argv[1:]])


if __name__ == "__main__":
    main()
