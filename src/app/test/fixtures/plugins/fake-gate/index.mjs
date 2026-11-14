// A test-only tracker gate plugin (RC23.6). It keeps the outside items in one
// JSON file named by `config.stateFile`, so a test plays the outside tracker
// by editing that file: set an item's `state` to open, done, failed or
// unknown, with `evidence` and `link`. The top-level `mode` makes the next
// status call misbehave:
//   throw   the call throws
//   invalid the reply has the wrong shape
//   hang    the call never answers
// Every call is appended to `calls`. The plugin has no call that writes to
// the outside tracker. No network, no real system.
import fs from "node:fs";

const read = (config) => JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
const write = (config, state) =>
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + "\n");

export const gate = {
  status({ ref }, { config }) {
    const state = read(config);
    state.calls = [...(state.calls || []), ["status", ref.item]];
    write(config, state);
    if (state.mode === "throw") throw new Error("the tracker is down");
    if (state.mode === "invalid") return { state: "sideways" };
    if (state.mode === "hang") return new Promise(() => {});
    const item = state.items?.[ref.item];
    if (!item) return { state: "unknown", evidence: `No item ${ref.item}.` };
    return {
      state: item.state,
      evidence: item.evidence,
      link: item.link,
    };
  },
};
