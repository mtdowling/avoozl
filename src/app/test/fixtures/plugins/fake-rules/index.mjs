// A test-only rules plugin (design §4.9 Rules plugins, Requirement 40.9).
// It supplies one fake rule set, `fake-plugin-set`. A test makes it crash by
// writing anything to the file named by `config.crashFile`. No network, no
// real terms.
import fs from "node:fs";

export const rules = {
  ruleSets(_params, { config }) {
    if (config.crashFile && fs.existsSync(config.crashFile)) process.exit(3);
    return {
      sets: [
        {
          id: "fake-plugin-set",
          version: "1.0.0",
          rules: [{ id: "project", pattern: "\\bproject[- ]?x\\b" }],
        },
      ],
    };
  },
};
