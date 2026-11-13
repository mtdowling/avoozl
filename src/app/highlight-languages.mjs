// highlight.languages: the extra code-fence grammars a workspace names in
// `.avoozl.json` `highlight.languages` ({ "<fence name>": "<file>" }). Each
// file is JSON data (an ordered token list, see kirocrew-app/ui/src/
// highlight.ts), read from inside the workspace only; it is never code.
// Reads only. A bad entry is reported and skipped, never fatal.
import fs from "node:fs";
import path from "node:path";

const NAME = /^[A-Za-z0-9_+#.-]{1,40}$/;
const MAX_FILE = 64 * 1024,
  MAX_TOKENS = 200,
  MAX_PATTERN = 1000;

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function grammar(text) {
  const value = JSON.parse(text);
  if (!value || !Array.isArray(value.tokens) || value.tokens.length > MAX_TOKENS)
    throw Error(`needs a "tokens" list of at most ${MAX_TOKENS} entries`);
  return {
    tokens: value.tokens.map((token, i) => {
      if (
        !token ||
        typeof token.type !== "string" ||
        typeof token.pattern !== "string" ||
        token.pattern.length > MAX_PATTERN ||
        (token.flags !== undefined && !/^[imsu]{0,4}$/.test(token.flags))
      )
        throw Error(`token ${i + 1} needs a type, a pattern of at most ${MAX_PATTERN} characters and flags from imsu`);
      new RegExp(token.pattern, token.flags || "");
      return { type: token.type, pattern: token.pattern, ...(token.flags ? { flags: token.flags } : {}) };
    }),
  };
}

export function highlightLanguages(workspaceRoot) {
  const languages = {},
    problems = [];
  if (!workspaceRoot) return { languages, problems };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8"));
  } catch {
    return { languages, problems };
  }
  const entries = config?.highlight?.languages;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return { languages, problems };
  let root;
  try {
    root = fs.realpathSync(workspaceRoot);
  } catch {
    return { languages, problems };
  }
  for (const [name, file] of Object.entries(entries)) {
    try {
      if (!NAME.test(name)) throw Error("is not a fence name");
      if (typeof file !== "string" || !file || path.isAbsolute(file))
        throw Error("must name a file inside the workspace");
      const target = fs.realpathSync(path.resolve(root, file));
      if (!inside(root, target)) throw Error("must name a file inside the workspace");
      if (fs.statSync(target).size > MAX_FILE) throw Error(`is larger than ${MAX_FILE} bytes`);
      languages[name] = grammar(fs.readFileSync(target, "utf8"));
    } catch (error) {
      problems.push(`highlight.languages.${name} ${error.code === "ENOENT" ? "names a missing file" : error.message}.`);
    }
  }
  return { languages, problems };
}
