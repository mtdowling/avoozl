// A plan's category, read from YAML front-matter at the top of its prose:
//
//   ---
//   category: Runtime
//   ---
//
// Avoozl reads this and never writes it, and never guesses one: a plan
// without it is uncategorized. shortcut: this reads only a top-level scalar
// `category:` and finds the block's end; it is not a YAML parser. Use a real
// one if plans ever need more front-matter keys.
const OPEN = /^\uFEFF?---[ \t]*\r?$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*\r?$/;
const MAX_CATEGORY = 160;

// { lines, category, problem }. `lines` is how many lines the block takes,
// fences included (0 when the text has none). `problem` is
// { line, message } for a block a person must fix; its category is null.
export function frontMatter(text) {
  const none = { lines: 0, category: null, problem: null };
  if (typeof text !== "string") return none;
  const rows = text.split("\n");
  if (!OPEN.test(rows[0])) return none;
  const end = rows.findIndex((row, index) => index > 0 && CLOSE.test(row));
  if (end < 0)
    return {
      ...none,
      problem: {
        line: 1,
        message:
          "Front-matter starts with --- on line 1 but has no closing --- line. Close it, or remove the opening ---.",
      },
    };
  const block = { lines: end + 1, category: null, problem: null };
  let found = 0;
  for (let index = 1; index < end; index++) {
    const match = /^category[ \t]*:(.*)$/.exec(rows[index].replace(/\r$/, ""));
    if (!match) continue;
    const line = index + 1;
    if (found)
      return {
        ...block,
        problem: {
          line,
          message: `Front-matter names category twice (lines ${found} and ${line}). Keep one.`,
        },
      };
    found = line;
    const value = scalar(match[1]);
    if (value === null || value.length > MAX_CATEGORY)
      return {
        ...block,
        problem: {
          line,
          message: `Write category as one line of text up to ${MAX_CATEGORY} characters, such as "category: Runtime".`,
        },
      };
    block.category = value;
  }
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
