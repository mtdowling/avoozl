#!/usr/bin/env node
// Screenshots of Settings › Delivery and Flow editing in place (harness
// &inline=1), as settings-tabs-shots.mjs takes them.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/delivery-settings-ux-shots.mjs <out dir> [names...]
import { shootSettings } from './settings-tabs-shots.mjs'

const [out, ...only] = process.argv.slice(2)
if (!out) {
  console.error('Usage: delivery-settings-ux-shots.mjs <out dir> [names...]')
  process.exit(2)
}
await shootSettings(out, only, [
  ['delivery', 'Delivery', null, { inline: '1' }],
  ['flow', 'Flow', null, { inline: '1' }],
])
