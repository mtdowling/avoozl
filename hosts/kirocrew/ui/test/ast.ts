// Walks an oxc-parser tree for the source checks. A node is read loosely:
// the checks look at a few fields of a few node types only.
export type AstNode = {
  type?: string
  name?: { type?: string; name?: string }
  value?: unknown
  attributes?: { type?: string; name?: { name?: string }; value?: { type?: string; value?: unknown } | null }[]
  source?: { type?: string; value: string } | null
  [key: string]: unknown
}

// Calls `visit` on every node under `root`, parents first.
export function walkAst(root: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(root)) {
    for (const child of root) walkAst(child, visit)
    return
  }
  if (!root || typeof root !== 'object') return
  const node = root as AstNode
  visit(node)
  for (const key of Object.keys(node)) if (key !== 'type') walkAst(node[key], visit)
}
