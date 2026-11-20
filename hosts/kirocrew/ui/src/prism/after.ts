// Runs after the grammars load: the page keeps its own Prism (see
// highlight.ts) and the global goes back to what it was.
const scope = globalThis as { Prism?: unknown; __avoozlPrismPrevious?: unknown }
export const prism = scope.Prism as PrismApi
if (scope.__avoozlPrismPrevious === undefined) delete scope.Prism
else scope.Prism = scope.__avoozlPrismPrevious
delete scope.__avoozlPrismPrevious

export type Grammar = Record<string, unknown>
export interface PrismToken {
  type: string
  content: string | PrismToken | (string | PrismToken)[]
  alias?: string | string[]
}
export interface PrismApi {
  languages: Record<string, Grammar>
  tokenize(text: string, grammar: Grammar): (string | PrismToken)[]
}
