// Path and branch globs as GitHub writes them: `*` matches within one path
// part, `**` across parts, `?` one character. A leading `**/` also matches
// at the top level.
function globToRegExp(glob) {
  const lead = glob.startsWith("**/"),
    body = lead ? glob.slice(3) : glob,
    source = body
      .split(/(\*\*|\*|\?)/)
      .map((part) => {
        if (part === "**") return ".*";
        if (part === "*") return "[^/]*";
        if (part === "?") return "[^/]";
        return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
  return new RegExp(`^${lead ? "(?:.*/)?" : ""}${source}$`);
}

export const globMatch = (glob, name) => globToRegExp(glob).test(name);
