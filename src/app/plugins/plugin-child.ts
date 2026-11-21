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

const send = (message: unknown) =>
  process.stdout.write(JSON.stringify(message) + "\n");

if (process.env.AVOOZL_PLUGIN_GUARD !== "off") {
  const deny = (what: string) => (): never => {
    send({ violation: what });
    process.exit(70);
  };
  net.Server.prototype.listen = deny("listen");
  dgram.Socket.prototype.bind = deny("bind");
}
for (const name of ["log", "info", "debug", "warn"] as const)
  console[name] = (...args: unknown[]) => console.error(...args);

// A plugin's entry module: each kind maps its call names to functions.
type Plugin = Record<string, Record<string, unknown> | undefined>;
// One call in: the hello that loads the module, or a `kind.name` call.
interface Call {
  id?: unknown;
  method?: unknown;
  params?: {
    entry?: string;
    config?: unknown;
    kind?: string;
    [key: string]: unknown;
  };
}

let plugin: Plugin | null = null,
  config: unknown = {},
  // A credentials child serves that part alone (PC1.3).
  only: string | null = null;

async function handle({ method, params }: Call) {
  if (method === "hello") {
    const kind = String(params?.kind);
    const loaded = await import(pathToFileURL(String(params?.entry)).href);
    const entry: Plugin = loaded.default ?? loaded;
    plugin = entry;
    config = params?.config ?? {};
    if (!entry?.[kind] || typeof entry[kind] !== "object")
      throw Error(`The entry module exports no ${params?.kind}.`);
    if (kind === "credentials") only = "credentials";
    return {
      kinds: ["rules", "credentials"].filter(
        (each) => entry[each] && (!only || each === only),
      ),
    };
  }
  const [kind, name] = String(method).split(".");
  if (only && kind !== only) throw Error(`The plugin has no ${method}.`);
  const fn = plugin?.[kind]?.[name];
  if (typeof fn !== "function") throw Error(`The plugin has no ${method}.`);
  return (await fn.call(plugin?.[kind], params, { config })) ?? null;
}

readline
  .createInterface({ input: process.stdin, terminal: false })
  .on("line", async (line) => {
    let message: Call;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    try {
      send({ id: message.id, result: await handle(message) });
    } catch (error) {
      send({
        id: message.id,
        error: String((error as Error)?.message || error),
      });
    }
  })
  .on("close", () => process.exit(0));
