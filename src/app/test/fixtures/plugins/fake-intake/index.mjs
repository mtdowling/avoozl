// A test-only intake plugin (design §4.12, Requirement 50). It answers
// `poll` with the items in the JSON file `config.intakeFile` ({items: [...]})
// changed since the cursor. A test edits that file to add, change or close
// an item (with a newer `updatedAt`); `{fail: "reason"}` in it makes the next
// poll fail.
//
// With `config.stateFile`, each poll is recorded there as `calls`, and the
// file's top-level `mode` makes the next poll misbehave:
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

export const intake = {
  async poll({ cursor, limit }, { config }) {
    if (config.stateFile) {
      const state = json(config.stateFile, {});
      state.calls = [...(state.calls || []), ["poll", cursor ?? null]];
      fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + "\n");
      if (state.mode === "crash") process.exit(3);
      if (state.mode === "listen")
        await new Promise((resolve) =>
          net.createServer().listen(0, "127.0.0.1", resolve),
        );
      if (state.mode === "invalid") return { items: "sideways" };
      if (state.mode === "hang") return new Promise(() => {});
    }
    const found = config.intakeFile
      ? json(config.intakeFile, { items: [] })
      : { items: [] };
    if (found.fail) throw new Error(found.fail);
    const mark = (item) => `${item.updatedAt}|${item.id}`,
      changed = found.items
        .filter((item) => !cursor || mark(item) > cursor)
        .sort((a, b) => mark(a).localeCompare(mark(b))),
      page = changed.slice(0, limit);
    return {
      items: page,
      cursor: page.length ? mark(page.at(-1)) : cursor,
      more: changed.length > page.length,
    };
  },
};
