// `avoozl mcp`: a stdio MCP server that forwards every message to this
// machine's server over its control interface (machine-server MS10, design
// D8). It opens no workspace database. The claim it sends routes and
// attributes calls and never grants one: with `--kirocrew` it names the Kiro
// Crew gateway as the caller (whose caller blocks the server trusts, as today),
// otherwise only the workspace the front end's MCP entry names.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { connectControl, controlPaths } from "../executors/control-server.mjs";
import { buildId } from "../executors/machine-build.mjs";
import { startMachineServer, waitUntil } from "../executors/machine-server.mjs";
import { lockHolder, machineLockPaths } from "../executors/machine-lock.mjs";

const rpcError = (id, message) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code: -32603, message },
});

// The running server's record, starting one when none runs, for up to 20
// seconds. A server of another build is a refusal naming `avoozl start`.
export async function reachServer({
  stateDirectory,
  configDirectory,
  env = process.env,
  waitMs = 20_000,
}) {
  const paths = machineLockPaths(stateDirectory);
  let holder = lockHolder(paths);
  if (!holder)
    await startMachineServer({
      stateDirectory,
      configDirectory,
      starter: "shim",
      env,
    }).catch(() => {});
  holder = await waitUntil(() => {
    const found = lockHolder(paths);
    return found?.control ? found : null;
  }, waitMs);
  if (!holder)
    throw Error(
      "This machine's Avoozl server did not start within 20 seconds. Run avoozl start, then try again.",
    );
  if (holder.build && holder.build !== buildId())
    throw Error(
      `This machine's Avoozl server runs build ${holder.build}, and this avoozl is ${buildId()}. Run avoozl start to replace it.`,
    );
  return holder;
}

export function shimClaim({ kirocrew, workspace, env }) {
  return {
    kind: kirocrew ? "kirocrew" : "front-end",
    ...(workspace ? { workspace: path.resolve(workspace) } : {}),
    ...(kirocrew && env.KIROCREW_SESSION_KEY
      ? { sessionKey: env.KIROCREW_SESSION_KEY }
      : {}),
  };
}

// Pipe stdin to the server and its replies to stdout, one JSON message a line.
export async function runShim({
  stateDirectory,
  configDirectory,
  claim,
  env = process.env,
  input = process.stdin,
  output = process.stdout,
}) {
  const write = (value) => output.write(JSON.stringify(value) + "\n");
  let client = null,
    problem = null;
  try {
    const holder = await reachServer({ stateDirectory, configDirectory, env });
    const token = fs
      .readFileSync(controlPaths(stateDirectory).token, "utf8")
      .trim();
    client = await connectControl(holder.control, { token, claim });
  } catch (error) {
    problem = error.message;
  }
  const lines = readline.createInterface({ input });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      write({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      continue;
    }
    const notification = !message || !Object.hasOwn(message, "id");
    if (problem) {
      if (!notification) write(rpcError(message?.id, problem));
      continue;
    }
    if (notification) {
      client.send(message);
      continue;
    }
    try {
      write(await client.call(message));
    } catch (error) {
      problem = error.message;
      write(rpcError(message.id, problem));
    }
  }
  client?.close();
}
