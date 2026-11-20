// A test-only rules plugin for the plugin host's tests (design §4.8). Its
// `ruleSets` answers with no sets.
//
// With `config.stateFile`, each call is recorded there as `calls`, and the
// file's top-level `mode` makes the next call misbehave:
//   crash   the process exits mid-call
//   listen  the plugin opens a network listener, then answers
//   invalid the reply has the wrong shape
//   hang    the call never answers
// No network, no real system.
import fs from "node:fs";
import net from "node:net";

const json = (file, empty) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return empty;
    throw error;
  }
};

export const rules = {
  async ruleSets(_params, { config }) {
    if (config.stateFile) {
      const state = json(config.stateFile, {});
      state.calls = [...(state.calls || []), ["ruleSets"]];
      fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + "\n");
      if (state.mode === "crash") process.exit(3);
      if (state.mode === "listen")
        await new Promise((resolve) =>
          net.createServer().listen(0, "127.0.0.1", resolve),
        );
      if (state.mode === "invalid") return { sets: "sideways" };
      if (state.mode === "hang") return new Promise(() => {});
    }
    return { sets: [] };
  },
};
