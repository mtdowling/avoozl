// A plan's category and epic, read from YAML front-matter at the top of its
// prose (Requirements 30.9 and 59.2):
//
//   ---
//   category: Runtime
//   epic: rewrite
//   ---
//
// Avoozl reads these and never writes them, and never guesses one: a plan
// without them is uncategorized and in no epic. shortcut: this reads only
// top-level scalar `category:` and `epic:` lines and finds the block's end;
// it is not a YAML parser. Use a real one if plans need more keys.
const OPEN = /^\uFEFF?---[ \t]*\r?$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*\r?$/;
const MAX_CATEGORY = 160;
// An epic is named by its spec folder (spec-plans.mjs NAME).
const EPIC_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const KEYS = {
  category: {
    valid: (value) => value.length <= MAX_CATEGORY,
    hint: `Write category as one line of text up to ${MAX_CATEGORY} characters, such as "category: Runtime".`,
  },
  epic: {
    valid: (value) => EPIC_NAME.test(value),
    hint: 'Write epic as the epic\'s spec folder name, such as "epic: rewrite".',
  },
};

// { lines, category, epic, epicLine, problem }. `lines` is how many lines
// the block takes, fences included (0 when the text has none). `problem` is
// { line, key, message } for a block a person must fix; the key it names
// reads as null (the whole block when its end is missing).
export function frontMatter(text) {
  const none = {
    lines: 0,
    category: null,
    epic: null,
    epicLine: null,
    problem: null,
  };
  if (typeof text !== "string") return none;
  const rows = text.split("\n");
  if (!OPEN.test(rows[0])) return none;
  const end = rows.findIndex((row, index) => index > 0 && CLOSE.test(row));
  if (end < 0)
    return {
      ...none,
      problem: {
        line: 1,
        key: null,
        message:
          "Front-matter starts with --- on line 1 but has no closing --- line. Close it, or remove the opening ---.",
      },
    };
  const block = { ...none, lines: end + 1 },
    found = {};
  for (let index = 1; index < end; index++) {
    const match = /^(category|epic)[ \t]*:(.*)$/.exec(
      rows[index].replace(/\r$/, ""),
    );
    if (!match) continue;
    const [, key, raw] = match,
      line = index + 1;
    if (found[key]) {
      block[key] = null;
      block.problem ??= {
        line,
        key,
        message: `Front-matter names ${key} twice (lines ${found[key]} and ${line}). Keep one.`,
      };
      continue;
    }
    found[key] = line;
    const value = scalar(raw);
    if (value === null || !KEYS[key].valid(value)) {
      block.problem ??= { line, key, message: KEYS[key].hint };
      continue;
    }
    block[key] = value;
    if (key === "epic") block.epicLine = line;
  }
  if (block.problem?.key === "epic") block.epicLine = null;
  return block;
}

// One YAML scalar on one line: plain, "double" or 'single' quoted. Lists,
// maps, block scalars, anchors and tags are refused, not interpreted.
function scalar(raw) {
  const value = raw.trim();
  if (!value || /^[[{|>&*!]/.test(value)) return null;
  const quoted = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(value);
  if (quoted) {
    const inner = quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
    return inner.trim() || null;
  }
  if (/^["']/.test(value)) return null;
  return value.replace(/\s+#.*$/, "").trim() || null;
}

export const frontMatterCategory = (text) => frontMatter(text).category;

// The text with its front-matter lines blanked, so line numbers still match
// the file and a YAML `# comment` is never read as a Markdown heading.
export function withoutFrontMatter(text) {
  const { lines } = frontMatter(text);
  if (!lines) return text;
  const rows = text.split("\n");
  return rows.map((row, index) => (index < lines ? "" : row)).join("\n");
}
