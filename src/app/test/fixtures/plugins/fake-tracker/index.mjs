// A test-only tracker plugin (design §4.8 Tracker kind, Requirement 35). Its
// records live in one JSON file named by `config.stateFile`: {records: {id:
// record}}. A test plays a person by editing that file: change a record's
// `fields`, or close it with `state: "closed"`, a `closeReason` and a
// `closedBy`. The tracker has no native links (no `edges` capability) and
// reports who closed a record (`actor`). `config.dropMarker` makes it forget
// the marker, as a tracker that cannot store one would. Avoozl's own closes
// are recorded as `config.account`. No network, no real system.
//
// As an intake source (design §4.12) it also answers `poll`: the items in
// the JSON file `config.intakeFile` ({items: [...]}) changed since the
// cursor. A test edits that file to add, change or close an item (with a
// newer `updatedAt`); `{fail: "reason"}` in it makes the next poll fail.
import fs from "node:fs";

const read = (config) => {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { records: {} };
    throw error;
  }
};
const write = (config, state) =>
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2) + "\n");
const link = (id) => `https://tracker.example.test/records/${id}`;
const view = (record) => ({ ...record, link: link(record.id) });

export const tracker = {
  // Idempotent by namespace and task ID.
  project({ task, desired, marker }, { config }) {
    const state = read(config);
    state.records ||= {};
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
    record.marker = config.dropMarker ? null : marker;
    write(config, state);
    return { id: record.id, link: link(record.id), marker: record.marker };
  },
  read({ ids }, { config }) {
    const state = read(config);
    return {
      records: ids
        .map((id) => state.records?.[id])
        .filter(Boolean)
        .map(view),
    };
  },
  list({ namespace }, { config }) {
    return {
      records: Object.values(read(config).records || {})
        .filter((record) => record.marker?.namespace === namespace)
        .map(view),
    };
  },
  close({ id, reason }, { config }) {
    const state = read(config),
      record = state.records?.[id];
    if (record)
      Object.assign(record, {
        state: "closed",
        closeReason: reason,
        closedBy: config.account || "avoozl",
        closedAt: new Date().toISOString(),
      });
    write(config, state);
    return { closed: Boolean(record) };
  },
  // Items changed since the cursor, oldest change first: the cursor is the
  // last item's `updatedAt` and id, as a real tracker's "changed since".
  poll({ cursor, limit }, { config }) {
    let intake = { items: [] };
    try {
      intake = JSON.parse(fs.readFileSync(config.intakeFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (intake.fail) throw new Error(intake.fail);
    const mark = (item) => `${item.updatedAt}|${item.id}`,
      changed = intake.items
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
