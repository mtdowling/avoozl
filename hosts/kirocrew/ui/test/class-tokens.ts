// Which classes a page source uses, and which a stylesheet lacks.
// Shared by host-classes.test.mjs and standalone-build.test.mjs.

// Static class tokens from className="..." and className={`...`}, without
// the ${...} parts.
export function classTokens(text: string) {
  const tokens = new Set<string>()
  for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const value = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, ' ')
    for (const token of value.split(/\s+/)) if (token) tokens.add(token)
  }
  return tokens
}

const escape = (token: string) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)

// Each class the sources use that the stylesheet lacks, with the files that use it.
// `sources` maps a file name to its text.
export function missingClasses(css: string, sources: Record<string, string>) {
  const users = new Map<string, string[]>()
  for (const [name, text] of Object.entries(sources))
    for (const token of classTokens(text)) if (!css.includes(`.${escape(token)}`)) users.set(token, [...(users.get(token) ?? []), name])
  return [...users].map(([token, names]) => `${token}: ${names.join(', ')}`).sort()
}
