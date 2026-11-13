// The host's SegmentedControl shows a label only on the selected segment when
// `compact` is set, and animates the selected pill between every control that
// shares a `layoutId`. Avoozl's segments have text and no icons, so `compact`
// made nested Settings tabs blank, and the shared default id made the outer
// and inner pills fight. Each control must name its own id and skip compact.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const dir = new URL('../src/', import.meta.url)

function controls() {
  const found = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(new URL(name, dir), 'utf8')
    for (const match of source.matchAll(/<SegmentedControl\b([\s\S]*?)\/>/g)) found.push({ name, props: match[1] })
  }
  return found
}

test('every SegmentedControl shows all its labels and has its own layoutId', () => {
  const found = controls()
  assert.ok(found.length >= 4)
  const ids = new Set()
  for (const { name, props } of found) {
    assert.doesNotMatch(props, /\bcompact\b/, `${name} uses compact, which hides unselected labels`)
    const id = props.match(/layoutId="([^"]+)"/)?.[1]
    assert.ok(id, `${name} has a SegmentedControl without layoutId`)
    assert.ok(!ids.has(id), `${name} reuses layoutId ${id}`)
    ids.add(id)
  }
})
