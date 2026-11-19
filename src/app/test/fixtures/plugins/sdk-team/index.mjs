// A test-only bundle plugin (design §4.14, Requirement 55): one plugin that
// a team installs once. Its pack (avoozl-pack.json) is settings only; this
// module supplies the parts that run:
// - rules: the team's rule sets, read at run time from a terms file
//   outside any repository, so no term is stored in Git;
// - intake: `poll` pages through an intake file ({items: [...]}), the fake
//   intake source a test edits. The cursor is the next index.
// The entry can be shared in `.avoozl.json`, so its config holds no machine
// path: `termsFileEnv` and `intakeFileEnv` name environment
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
    ["terms", "intake"].map((name) => [
      name,
      process.env[config[`${name}FileEnv`]],
    ]),
  );

export const rules = {
  ruleSets(_, { config }) {
    return json(files(config).terms, { sets: [] });
  },
};

export const intake = {
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
