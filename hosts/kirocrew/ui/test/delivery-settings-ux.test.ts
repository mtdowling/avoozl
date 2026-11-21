// @ts-nocheck: typing debt
// Settings > Autopilot: who merges is landing.pr.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Who merges is landing.pr: one choice on the repository's Landing tab, which
// may use the workspace's, and a note for a value Avoozl does not accept.
test('an unknown landing.pr says so, and autoMerge is gone', () => {
  const page = readFileSync(new URL('../src/LandingFields.tsx', import.meta.url), 'utf8')
  assert.match(page, /landing\.pr "\{repository\.prMode\}", which Avoozl does not accept/)
  assert.match(page, /uses the workspace's landing\.pr/)
  for (const name of ['LandingFields.tsx', 'SettingsView.tsx', 'settings-api.ts', 'DeliverySettings.tsx'])
    assert.doesNotMatch(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'), /autoMerge|AutoMergeFields/, name)
})
