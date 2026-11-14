// The page says spec, not plan (R62, design §8.7). This reads every page
// source file, collects its JSX text and its string literals that read as
// words (a space, or a capital first letter), and fails on any `plan` or
// `plans` word not in ALLOWED. Keys, operation names and other identifiers
// (`plan.table`, `plans_view`, `discuss-plan`) have neither, so they pass.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src).filter((name) => /\.(tsx?|ts)$/.test(name) && !name.endsWith('.d.ts'))

// Each entry is one exact phrase that keeps the word, with why (R62.3).
export const ALLOWED = new Map([
  // Plan as a verb.
  ['Plan a goal', 'verb: the header button and the skill step it names'],
  ['Plan work as a graph', 'verb: the page subtitle'],
  ['Plan this', 'verb: an Intake action (R50.15)'],
  ['Plan ?', 'verb: the Plan this confirm title, `Plan ${name}?`'],
  ['plan or deliver', 'verb: what Intake offers'],
  ['plan a plugin', 'verb: Design a plugin'],
  ['plan an Avoozl content rule set', 'verb: Design a rule set'],
  // A backend key in a type literal, read as text by the guard.
  ['| null plan:', 'the quick goal reply carries the spec plan under the key `plan`'],
  // Compatibility names (R62.2).
  ['Plans repository mode', 'the Plans repo mode names a repository'],
  ['plans repository mode', 'the Plans repo mode names a repository'],
  ['Plans repository', 'the Plans repo mode names a repository'],
  ['the plans repository', 'the Plans repo mode names a repository'],
  ['plans-repo', 'the mode key'],
  ['Plans repo name', 'a built-in content rule set named for the mode'],
  ['Some of plan, github, brief, diff, intake', 'content-rule boundary ids'],
  ['secret-plans', 'an example repository name'],
  // The GitHub issue level a spec's plan projects to (R59.8, R66).
  ['Plan issue', 'the GitHub plan issue that names the driver'],
  ['plan issue', 'the GitHub plan issue that names the driver'],
])

// Drop `${...}` (nesting included): those are code, not words.
function dropInterpolations(value) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '$' && value[i + 1] === '{') {
      let depth = 1
      i += 2
      while (i < value.length && depth) {
        if (value[i] === '{') depth++
        else if (value[i] === '}') depth--
        i++
      }
      i--
      out += ' '
    } else out += value[i]
  }
  return out
}

const CODE = /=>|===|&&|\|\||\bconst |\bexport |\bfunction |\breturn\b|\?\./

function strip(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '')
    .replace(/^import .*$/gm, '')
}

// String literals and JSX text that read as words.
export function phrases(text) {
  const body = strip(text)
  const found = []
  const jsx = []
  for (const match of body.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) found.push(match[1] ?? match[2] ?? match[3])
  // JSX text next to an expression: `{n} plans<` or `>Plan: {name}`.
  for (const match of body.matchAll(/[>}]([^<>{}]+)(?=[<{])/g))
    if (!/[=('`"[\]]|\)\s*$|^\s*[,.)]/.test(match[1]) || /^\s*[.·]\s/.test(match[1])) jsx.push(match[1])
  return found
    .map((value) => dropInterpolations(value).replace(/\s+/g, ' ').trim())
    .filter((value) => value && !CODE.test(value) && (/\s/.test(value) || /^[A-Z]/.test(value)))
    // A lowercase `name:` is a type's field, not text.
    .concat(jsx.map((value) => dropInterpolations(value).replace(/\s+/g, ' ').trim()).filter((value) => value && !/^[a-z]\w*\??:$/.test(value)))
}

export const offending = (value) => {
  let rest = value
  for (const phrase of ALLOWED.keys()) rest = rest.split(phrase).join(' ')
  return /\bplans?\b/i.test(rest)
}

test('the page shows no plan or plans word for a spec', () => {
  const found = []
  for (const name of files)
    for (const value of phrases(readFileSync(new URL(name, src), 'utf8'))) if (offending(value)) found.push(`${name}: ${value}`)
  assert.deepEqual(found, [])
  // A count's word is a one-word string, so check the plural pair by name.
  for (const name of files) assert.doesNotMatch(readFileSync(new URL(name, src), 'utf8'), /'plan' : 'plans'/, name)
})

test('the guard catches a plan word and passes keys and allowed verbs', () => {
  assert.deepEqual(phrases("const a = 'New plan'; const b = 'plan.table'; <b>All plans</b> 'Plan details'").filter(offending), ['New plan', 'Plan details', 'All plans'])
  assert.deepEqual(phrases("'plans_view' 'discuss-plan' 'Plan this' 'planId' `${row.plan.id} done`").filter(offending), [])
})

test('the compatibility names stay as they were', () => {
  const plans = readFileSync(new URL('plans-api.ts', src), 'utf8')
  for (const operation of ['plan.table', 'plan.get', 'plan.approve']) assert.match(plans, new RegExp(`'${operation.replace('.', '\\.')}'`), operation)
  const app = readFileSync(new URL('App.tsx', src), 'utf8')
  // The tab key is a stored name; only its label changed.
  assert.match(app, /\{ key: 'plans', label: 'Specs' \}/)
})
