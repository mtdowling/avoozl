// The real Claude Code binary, for the live proofs that run it under the
// supervisor's sandbox. The toolbox keeps it at
// ~/.toolbox/tools/claude-code/<version>/claude (about 340 MB). Its bin/claude
// is a wrapper that fails inside the sandbox ("could not find wrapper
// binary"), and ~/.toolbox/bin/claude is a shim; neither is the real one.
import fs from "node:fs";
import path from "node:path";

// A file this big is the real binary, not a launcher.
export const REAL_CLAUDE_BYTES = 50_000_000;
const isReal = (file) => {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size > REAL_CLAUDE_BYTES;
  } catch {
    return false;
  }
};

// For a path the person named or `claude` found on PATH: the file itself when
// it is the real binary, the one a wrapper's bin/ folder sits beside, else the
// newest installed version under `home`. Null when none is found.
export function realClaude(candidate, home) {
  const found = [];
  if (candidate) {
    let file = candidate;
    try {
      file = fs.realpathSync(candidate);
    } catch {
      // A name that does not resolve is not a binary.
    }
    found.push(file, path.join(path.dirname(file), "..", "claude"));
  }
  const tools = path.join(home, ".toolbox", "tools", "claude-code");
  if (fs.existsSync(tools))
    found.push(
      ...fs
        .readdirSync(tools)
        .filter((version) => /^\d/.test(version))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((version) => path.join(tools, version, "claude")),
    );
  const real = found.map((file) => path.resolve(file)).find(isReal);
  return real ? fs.realpathSync(real) : null;
}

// The two Claude Code binaries a live proof needs (as P59 to P61 and nk-p1):
// `exportWith` runs `default-credential-export` under the person's real HOME,
// where its Bedrock login lives, so it is the command the person runs, the
// toolbox shim on PATH; `child` is the real binary the sandboxed child runs
// under the isolated HOME, where the shim and the wrapper both fail. `named` is
// what SWP1_CLAUDE names, `onPath` what `command -v claude` finds.
export function claudeBinaries({ named, onPath, home }) {
  return {
    exportWith: named || onPath || null,
    child: realClaude(named || onPath || null, home),
  };
}
