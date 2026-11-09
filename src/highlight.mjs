// Browser lexical highlighting follows docs/lexers/nupp.lua and
// src/nupp/tools/syntaxstyle.nupp. It needs no compiler process or network.
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const keywords = new Set(
  "and as break borrows cdef const constructor continue do else elseif end exclusive for from function global goto handle if in interface is keyof local matches metamethod module not or out preserves record releases repeat resumes retains return satisfies scoped sealed struct suspension takes then unpackof unsafe until where while writekeyof writeof yields".split(
    " ",
  ),
);
const types = new Set(
  "any boolean borrowed cdata cstring ctype float int8 int16 int32 int64 integer metatable never number owned pinned string table thread uint8 uint16 uint32 uint64 unknown userdata voidptr".split(
    " ",
  ),
);
const whitespace = /\s+/y,
  identifier = /[A-Za-z_][A-Za-z0-9_]*/y,
  annotation = /@!?[A-Za-z_][A-Za-z0-9_]*/y,
  longOpen = /\[(=*)\[/y;
const number =
  /(?:0_*[xX]_*[\da-fA-F][\da-fA-F_]*(?:\.(?!\.)[\da-fA-F_]*)?(?:[pP]_*[+-]?_*\d[\d_]*)?|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[eE]_*[+-]?_*\d[\d_]*)?)(?:(?:[uU]?_*[lL]_*[lL]|[iI])_*)?/y;
const operator =
  /~>>=|\.\.\.|<<=|>>=|\/\/=|\.\.=|\?\?=|~>>|<<|>>|==|~=|<=|>=|!=|&&|\|\||\?\?|\?\.|::|\/\/|\.\.|->|[+\-*/%&|]=|[+\-*/%^#&~|<>=?:@!;,.{}\[\]()]/y;
const match = (pattern, text, index) => {
  pattern.lastIndex = index;
  return pattern.exec(text);
};
function longEnd(text, start) {
  const open = match(longOpen, text, start);
  if (!open) return null;
  const end = text.indexOf("]" + open[1] + "]", start + open[0].length);
  return end < 0 ? text.length : end + open[1].length + 2;
}
export function highlightNupp(source) {
  let out = "",
    index = 0,
    previous = "";
  const emit = (end, style) => {
    const text = source.slice(index, end);
    out += style
      ? '<span class="syntax-' + style + '">' + escapeHTML(text) + "</span>"
      : escapeHTML(text);
    index = end;
  };
  while (index < source.length) {
    const space = match(whitespace, source, index);
    if (space) {
      emit(index + space[0].length);
      continue;
    }
    if (source.startsWith("--", index)) {
      emit(
        longEnd(source, index + 2) ??
          (source.indexOf("\n", index) < 0
            ? source.length
            : source.indexOf("\n", index)),
        "comment",
      );
      continue;
    }
    if (index === 0 && source.startsWith("#!")) {
      const end = source.indexOf("\n");
      emit(end < 0 ? source.length : end, "comment");
      continue;
    }
    const quote = source[index];
    if (['"', "'", "`"].includes(quote)) {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") {
          end = Math.min(source.length, end + 2);
          continue;
        }
        if (source[end++] === quote) break;
      }
      emit(end, "string");
      previous = "string";
      continue;
    }
    const long = longEnd(source, index);
    if (long !== null) {
      emit(long, "string");
      previous = "string";
      continue;
    }
    const meta = match(annotation, source, index);
    if (meta) {
      emit(index + meta[0].length, "meta");
      previous = meta[0];
      continue;
    }
    const numeric = match(number, source, index);
    if (numeric) {
      emit(index + numeric[0].length, "number");
      previous = "number";
      continue;
    }
    const name = match(identifier, source, index);
    if (name) {
      const word = name[0],
        following = source.slice(index + word.length),
        member = previous === "." || previous === ":";
      let style;
      if (["true", "false", "nil"].includes(word)) style = "literal";
      else if (member && !types.has(word) && !/^[A-Z]/.test(word))
        style = /^\s*\(/.test(following) ? "function" : "property";
      else if (word === "comptime") style = "meta";
      else if (
        keywords.has(word) ||
        (word === "type" && /^[ \t]+[A-Za-z_]/.test(following)) ||
        (word === "associated" && /^[ \t]+type\b/.test(following)) ||
        (word === "type" && previous === "associated")
      )
        style = "keyword";
      else if (
        types.has(word) ||
        /^[A-Z]/.test(word) ||
        ["record", "struct", "interface", "type"].includes(previous)
      )
        style = "type";
      else if (
        previous === "function" ||
        previous === "metamethod" ||
        /^\s*\(/.test(following)
      )
        style = "function";
      emit(index + word.length, style);
      previous = word;
      continue;
    }
    const op = match(operator, source, index);
    if (op) {
      const text = op[0];
      emit(
        index + text.length,
        /^[()[\]{},;:.]$/.test(text) ? "punctuation" : "operator",
      );
      previous = text;
      continue;
    }
    emit(index + 1);
    previous = quote;
  }
  return out;
}
const cache = new Map();
let cachedBytes = 0;
export function codeBlock(source, info = "") {
  const language = info.trim().split(/\s+/)[0].toLowerCase(),
    nupp = ["nupp", "nupp:fragment", "lua"].includes(language),
    key = language + "\0" + source;
  if (cache.has(key)) return cache.get(key);
  const result =
    '<pre class="source-block"' +
    (language ? ' data-language="' + escapeHTML(language) + '"' : "") +
    "><code" +
    (nupp ? ' class="language-nupp"' : "") +
    ">" +
    (nupp ? highlightNupp(source) : escapeHTML(source)) +
    "</code></pre>";
  if (result.length < 250000) {
    while (
      cache.size &&
      (cachedBytes + key.length + result.length > 1000000 || cache.size >= 100)
    ) {
      const [old, value] = cache.entries().next().value;
      cachedBytes -= old.length + value.length;
      cache.delete(old);
    }
    cache.set(key, result);
    cachedBytes += key.length + result.length;
  }
  return result;
}
