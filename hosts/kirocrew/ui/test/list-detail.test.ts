// A phone shows one pane of a list-and-detail page; a desktop shows both.
import assert from 'node:assert/strict'
import test from 'node:test'
import { panes } from '../src/list-detail.ts'

test('a desktop shows both panes whether or not the detail is open', () => {
  assert.deepEqual(panes(false, false), { showList: true, showDetail: true })
  assert.deepEqual(panes(false, true), { showList: true, showDetail: true })
})

test('a phone shows the list, or the detail once it is open, never both', () => {
  assert.deepEqual(panes(true, false), { showList: true, showDetail: false })
  assert.deepEqual(panes(true, true), { showList: false, showDetail: true })
})
