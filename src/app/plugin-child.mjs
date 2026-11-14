// The one process a plugin runs in (design §4.8 Running, R34.5). Avoozl
// starts it with `node plugin-child.mjs`, gives it no port, and talks to it
// in JSON lines over stdio: `{id, method, params}` in, `{id, result}` or
// `{id, error}` out. The first call is `hello`, which loads the plugin's
// entry module. A plugin may call its own system over the network but may
// not listen: the guard below stops the process on the first listen or
// bind, and Avoozl also checks the process's open sockets after each call.
// Plugin output on stdout would corrupt the protocol, so console output goes
// to stderr, which Avoozl discards.
import dgram from "node:dgram";
import net from "node:net";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

if (process.env.AVOOZL_PLUGIN_GUARD !== "off") {
  const deny = (what) => () => {
    send({ violation: what });
    process.exit(70);
  };
  net.Server.prototype.listen = deny("listen");
  dgram.Socket.prototype.bind = deny("bind");
}
for (const name of ["log", "info", "debug", "warn"])
  console[name] = (...args) => console.error(...args);

let plugin = null,
  config = {};

async function handle({ id, method, params }) {
  if (method === "hello") {
    const loaded = await import(pathToFileURL(params.entry).href);
    plugin = loaded.default ?? loaded;
    config = params.config ?? {};
    if (!plugin?.[params.kind] || typeof plugin[params.kind] !== "object")
      throw Error(`The entry module exports no ${params.kind}.`);
    return {
      kinds: ["route", "tracker", "rules", "gate"].filter(
        (kind) => plugin[kind],
      ),
    };
  }
  const [kind, name] = String(method).split(".");
  const fn = plugin?.[kind]?.[name];
  if (typeof fn !== "function") throw Error(`The plugin has no ${method}.`);
  return (await fn.call(plugin[kind], params, { config })) ?? null;
}

readline
  .createInterface({ input: process.stdin, terminal: false })
  .on("line", async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    try {
      send({ id: message.id, result: await handle(message) });
    } catch (error) {
      send({ id: message.id, error: String(error?.message || error) });
    }
  })
  .on("close", () => process.exit(0));
