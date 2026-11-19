#!/usr/bin/env node
// Box exec (vm-harness D3): the program a contained session's harness names
// as its shell prefix ({box_exec}), such as Claude Code's
// CLAUDE_CODE_SHELL_PREFIX. It takes the CLI's command line as its one
// argument (or `-c COMMAND`) and its working folder from its own, sends both
// to the session's broker over the Unix socket in AVOOZL_BOX_SOCKET, relays
// standard input, output and error, passes on SIGTERM, SIGINT and SIGHUP,
// and exits with the command's code. It never runs the command itself: the
// broker runs it in the session's box.
import net from "node:net";
import { pathToFileURL } from "node:url";
import { SIGNALS, frame, frameReader } from "./box-frames.mjs";

export function boxExec(
  args,
  {
    env = process.env,
    cwd = process.cwd(),
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    exit = process.exit,
    signals = process,
  } = {},
) {
  const command =
    args.length === 1
      ? args[0]
      : args[0] === "-c" && args.length === 2
        ? args[1]
        : null;
  if (typeof command !== "string") {
    stderr.write("box exec takes one command line, or -c COMMAND.\n");
    return exit(2);
  }
  const socketPath = env.AVOOZL_BOX_SOCKET;
  if (!socketPath) {
    stderr.write(
      "box exec has no AVOOZL_BOX_SOCKET; it runs only in a contained session.\n",
    );
    return exit(126);
  }
  const socket = net.connect(socketPath);
  let ended = false;
  const finish = (code) => {
    if (ended) return;
    ended = true;
    socket.destroy();
    // Exit once what was written has reached the pipes.
    stdout.write("", () => stderr.write("", () => exit(code)));
  };
  socket.on("error", (error) => {
    stderr.write(`box exec cannot reach the session's box: ${error.message}\n`);
    finish(126);
  });
  socket.on("close", () => finish(126));
  socket.on(
    "data",
    frameReader(
      (type, payload) => {
        if (type === "O") stdout.write(payload);
        else if (type === "R") stderr.write(payload);
        else if (type === "F") {
          stderr.write(`${payload.toString("utf8")}\n`);
          finish(126);
        } else if (type === "X") {
          const { code } = JSON.parse(payload.toString("utf8"));
          finish(Number.isInteger(code) ? code : 1);
        }
      },
      () => finish(126),
    ),
  );
  socket.once("connect", () => {
    socket.write(frame("H", { command, cwd }));
    if (stdin && !stdin.isTTY) {
      stdin.on("data", (chunk) => socket.write(frame("I", chunk)));
      stdin.on("end", () => socket.write(frame("E")));
    } else socket.write(frame("E"));
  });
  for (const signal of SIGNALS)
    signals.on?.(signal, () => {
      if (!ended) socket.write(frame("S", signal));
    });
  return socket;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  boxExec(process.argv.slice(2));
