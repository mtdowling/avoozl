// A test-only bundle plugin (design §4.14, Requirement 55): one plugin that
// a team installs once. Its pack (avoozl-pack.json) is settings only; this
// module supplies the parts that run:
// - rules: the team's rule sets, read at run time from a terms file
//   outside any repository, so no term is stored in Git;
// - tracker: records in a state file, like fake-tracker;
// - intake: `poll` pages through an intake file ({items: [...]}), the fake
//   intake source a test edits. The cursor is the next index.
// The entry can be shared in `.avoozl.json`, so its config holds no machine
// path: `termsFileEnv`, `stateFileEnv` and `intakeFileEnv` name environment
// variables that hold each computer's own paths. No network, no real system.
import fs from "node:fs";

const json = (file, empty) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return empty;
    throw error;
  }
};
// `files(config).terms` is the path the variable `config.termsFileEnv` names.
const files = (config) =>
  Object.fromEntries(
    ["terms", "state", "intake"].map((name) => [
      name,
      process.env[config[`${name}FileEnv`]],
    ]),
  );
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const link = (id) => `https://tracker.example.test/records/${id}`;

export const rules = {
  ruleSets(_, { config }) {
    return json(files(config).terms, { sets: [] });
  },
};

export const tracker = {
  project({ desired, marker }, { config }) {
    const state = json(files(config).state, { records: {} });
    let record = Object.values(state.records).find(
      (r) =>
        r.marker?.namespace === marker.namespace &&
        r.marker?.taskId === marker.taskId,
    );
    if (!record) {
      const id = `rec-${Object.keys(state.records).length + 1}`;
      record = state.records[id] = { id, state: "open", fields: {} };
    }
    record.fields = { ...record.fields, ...desired };
    record.marker = marker;
    save(files(config).state, state);
    return { id: record.id, link: link(record.id), marker };
  },
  read({ ids }, { config }) {
    const { records } = json(files(config).state, { records: {} });
    return {
      records: ids
        .map((id) => records[id])
        .filter(Boolean)
        .map((r) => ({ ...r, link: link(r.id) })),
    };
  },
  list({ namespace }, { config }) {
    const { records } = json(files(config).state, { records: {} });
    return {
      records: Object.values(records)
        .filter((r) => r.marker?.namespace === namespace)
        .map((r) => ({ ...r, link: link(r.id) })),
    };
  },
  close({ id, reason }, { config }) {
    const state = json(files(config).state, { records: {} });
    const record = state.records[id];
    if (!record) return { closed: false };
    Object.assign(record, {
      state: "closed",
      closeReason: reason,
      closedBy: config.account ?? "avoozl",
    });
    save(files(config).state, state);
    return { closed: true };
  },
  poll({ cursor, limit }, { config }) {
    const { items } = json(files(config).intake, { items: [] });
    const start = Number(cursor ?? 0),
      page = items.slice(start, start + limit);
    return {
      items: page,
      cursor: String(start + page.length),
      more: start + page.length < items.length,
    };
  },
};
