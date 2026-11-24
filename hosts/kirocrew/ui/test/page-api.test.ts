// The Browser page box's words and operation (standalone-web SW9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { fakeApi } from './fake-api.ts'
import { pageClient, pageWords } from '../src/page-api.ts'

test('each page state has its own words; a running page names avoozl link', () => {
  const running = pageWords({ enabled: true, running: true, origin: 'http://127.0.0.1:4100', open: 'avoozl link' })
  assert.match(running, /^On at http:\/\/127\.0\.0\.1:4100\. .*avoozl link/)
  assert.match(pageWords({ enabled: false, running: false }), /^Off\. serve\.enabled is false/)
  assert.match(pageWords({ enabled: true, running: false, problem: 'The standalone page cannot start: port 4100 is in use' }), /port 4100 is in use\. The next tick tries again\./)
  assert.equal(pageWords({ enabled: true, running: false }), 'On. It starts with the next tick.')
})

test('the box reads page.status', async () => {
  const { api, calls } = fakeApi(() => ({ enabled: true, running: false }))
  assert.deepEqual(await pageClient(api).status('w'), { enabled: true, running: false })
  assert.deepEqual(
    calls.map((call) => [call.body.operation, call.body.input]),
    [['page.status', {}]],
  )
})
