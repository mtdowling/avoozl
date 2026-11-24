// JSON text as Biome formats the files Avoozl saves (2-space indent, line
// width 80): every non-empty object one key per line, and an array of
// plain values on one line when that line fits, else one item per line.
// shortcut: an object is always expanded, as every object in a file Avoozl
// writes is; Biome would keep a short object on one line if its source was.
const WIDTH = 80;

const flat = (value: unknown) =>
  value === null ||
  typeof value !== "object" ||
  Object.keys(value as object).length === 0;

function format(
  value: unknown,
  indent: string,
  prefix: string,
  tail: string,
): string {
  if (flat(value)) return indent + prefix + JSON.stringify(value) + tail;
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    if (value.every(flat)) {
      const line = `${indent}${prefix}[${value.map((item) => JSON.stringify(item)).join(", ")}]${tail}`;
      if (line.length <= WIDTH) return line;
    }
    const items = value.map((item, index) =>
      format(item, inner, "", index < value.length - 1 ? "," : ""),
    );
    return [`${indent}${prefix}[`, ...items, `${indent}]${tail}`].join("\n");
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined,
    ),
    lines = entries.map(([key, item], index) =>
      format(
        item,
        inner,
        `${JSON.stringify(key)}: `,
        index < entries.length - 1 ? "," : "",
      ),
    );
  return [`${indent}${prefix}{`, ...lines, `${indent}}${tail}`].join("\n");
}

export const formatJson = (value: unknown) => format(value, "", "", "") + "\n";
