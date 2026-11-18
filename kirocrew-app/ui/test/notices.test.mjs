// Browser notices for Needs you (SW8) and the standalone page's Needs Kiro Crew
// states (SW10.1): the pure parts. The page itself is in standalone-page.test.mjs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { harnessOptions } from '../src/models-api.ts'
import { NOTICE_INTERVAL_MS, noticeText, noticesOn, setNotices, takeNew } from '../src/notices.ts'

const memory = () => {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)) }
}
const items = (...ids) => ids.map((id) => ({ id, title: `Item ${id}` }))
const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('notices are off by default and only a stored choice turns them on', () => {
  const storage = memory()
  assert.equal(noticesOn(storage), false)
  setNotices(storage, true)
  assert.equal(noticesOn(storage), true)
  setNotices(storage, false)
  assert.equal(noticesOn(storage), false)
  assert.equal(noticesOn(null), false)
})

test('the first read only records what waits; new items are noticed once per browser', () => {
  const storage = memory()
  assert.deepEqual(takeNew(storage, items('a')), [], 'the backlog is not shown')
  assert.deepEqual(takeNew(storage, items('a', 'b', 'c')).map((i) => i.id), ['b', 'c'], 'two new items, two notices')
  assert.deepEqual(takeNew(storage, items('a', 'b', 'c')), [], 'a reload shows none')
  assert.deepEqual(takeNew(storage, items('a', 'b', 'c', 'd')).map((i) => i.id), ['d'])
})

test('a notice holds the title and no path', () => {
  // Built from parts so the test file names no machine path.
  const posix = ['', 'home', 'mira', 'repo', 'a.mjs'].join('/')
  const windows = ['C:', 'Users', 'mira', 'repo'].join('\\')
  assert.equal(noticeText(`Fix ${posix} first`), 'Fix first')
  assert.equal(noticeText(`Check ${windows} now`), 'Check now')
  assert.equal(noticeText('Task 1.2 needs you'), 'Task 1.2 needs you')
})

test('notices read no more often than the page reads Needs you, and only while it is open', () => {
  assert.equal(NOTICE_INTERVAL_MS, 60000)
  assert.match(source('App.tsx'), /setInterval\(read, 60000\)/)
  const poller = source('standalone/Notices.tsx')
  assert.doesNotMatch(poller, /serviceWorker|PushManager|sync\.register/)
})

test('only a click asks the browser for permission', () => {
  const box = source('NoticesSettings.tsx')
  assert.equal([...box.matchAll(/requestPermission\(/g)].length, 1)
  assert.match(box, /const turnOn = async/)
  assert.doesNotMatch(box, /useEffect\([^)]*requestPermission/s)
})

test('the standalone page says Needs Kiro Crew on the Kiro Crew chat harness, and the Kiro Crew page does not', () => {
<<<<<<< HEAD
  const label = (host) => harnessOptions([], '', host).find((o) => o.value === 'kirocrew').label
=======
  const label = (host) => harnessOptions([], '', 'write', host).find((o) => o.value === 'kirocrew').label
>>>>>>> origin/main
  assert.equal(label('standalone'), 'Kiro Crew chat (Needs Kiro Crew)')
  assert.equal(label('kirocrew'), 'Kiro Crew chat')
  assert.equal(label(undefined), 'Kiro Crew chat')
})

test('autoSend never starts a session: Start is a click (SW7.6)', () => {
  const dialog = source('standalone/StartSession.tsx')
  assert.doesNotMatch(dialog, /autoSend/)
  assert.equal([...dialog.matchAll(/'session\.open', \{ message/g)].length, 1)
})
