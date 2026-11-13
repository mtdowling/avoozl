// A test-only delivery route plugin (design §4.8, Requirement 22). It keeps
// its remote work in one JSON file named by `config.stateFile`, so a test
// plays the remote system by editing that file: set a submission's `state`
// to queued, running, needs-person, failed or done, give it a `result`, or
// set the top-level `mode` to make the next status call misbehave:
//   crash   the process exits mid-call
//   listen  the plugin opens a network listener, then answers
//   invalid the reply has the wrong shape
//   hang    the call never answers
// No network, no real system.
import fs from "node:fs";
import net from "node:net";

const read = (config) => JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
const write = (config, state) =>
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + "\n");

const link = (id) =>
  `https://route.example.test/work/${encodeURIComponent(id)}`;

export const route = {
  submit({ task, brief }, { config }) {
    const state = read(config),
      id = `remote-${task.id}`;
    state.submissions ||= {};
    // Idempotent by task: a repeat submit returns the same remote work, and
    // a cancelled or failed one starts again.
    if (
      ["cancelled", "failed", undefined].includes(state.submissions[id]?.state)
    )
      state.submissions[id] = { task, brief, state: "queued", link: link(id) };
    state.calls = [...(state.calls || []), ["submit", task.id]];
    write(config, state);
    return { id, link: link(id) };
  },
  async status({ id }, { config }) {
    const state = read(config),
      record = state.submissions?.[id];
    state.calls = [...(state.calls || []), ["status", id]];
    write(config, state);
    if (state.mode === "crash") process.exit(3);
    if (state.mode === "listen")
      await new Promise((resolve) =>
        net.createServer().listen(0, "127.0.0.1", resolve),
      );
    if (state.mode === "invalid") return { state: "sideways" };
    if (state.mode === "hang") return new Promise(() => {});
    if (!record) return { state: "failed", reason: `No work ${id}.` };
    return {
      state: record.state,
      link:
        record.state === "needs-person" ? `${record.link}#answer` : record.link,
      ...(record.reason ? { reason: record.reason } : {}),
    };
  },
  completion({ id }, { config }) {
    const record = read(config).submissions?.[id];
    return record?.result ?? {};
  },
  cancel({ id }, { config }) {
    const state = read(config);
    if (state.submissions?.[id]) state.submissions[id].state = "cancelled";
    write(config, state);
    return { cancelled: true };
  },
};
