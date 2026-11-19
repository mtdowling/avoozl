// Builds the modal harness page (harness.tsx) into one classic script, so
// Chrome can load it from a file:// URL with no server. React and react-dom
// are bundled; the host SDK and lucide-react are small stand-ins.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../../src')

// Every icon the SDK types declare, as one stand-in glyph.
function lucide() {
  const types = fs.readFileSync(path.join(src, 'kirocrew-app-sdk.d.ts'), 'utf8')
  const names = [...types.matchAll(/export const (\w+): LucideIcon/g)].map((m) => m[1])
  return [`import { Icon } from ${JSON.stringify(path.join(here, 'stubs.tsx'))}`, ...names.map((name) => `export const ${name} = Icon`)].join('\n')
}

// The real icons: lucide-react as the host ships it (a dev dependency at the
// host's version), or the install AVOOZL_LUCIDE names. Without one, every
// icon is the stand-in glyph and the icon test skips.
const installed = path.resolve(here, '../../../../node_modules/lucide-react')
export const realLucide = process.env.AVOOZL_LUCIDE ? path.resolve(process.env.AVOOZL_LUCIDE) : fs.existsSync(path.join(installed, 'package.json')) ? installed : null

// `hostCss` is an optional stylesheet (the host's own) used instead of the
// harness's; screenshots use it to look like the real page.
// `scripts` maps file names to classic scripts that load before the page,
// such as the Demo mode replies (demo-replies.mjs).
export async function buildHarness({ hostCss, scripts = {}, entry = path.join(here, 'harness.tsx') } = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'avoozl-harness-'))
  await build({
    configFile: false,
    logLevel: 'warn',
    root: here,
    plugins: [
      react(),
      {
        name: 'avoozl-harness-stubs',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'lucide-react')
            return realLucide
              ? ['dist/esm/lucide-react.js', 'dist/esm/lucide-react.mjs'].map((file) => path.join(realLucide, file)).find((file) => fs.existsSync(file))
              : '\0lucide-react'
          if (id === '@kirocrew/app-sdk' || id === '@kirocrew/app-sdk/ui') return path.join(here, 'stubs.tsx')
          return null
        },
        load(id) {
          return id === '\0lucide-react' ? lucide() : null
        },
      },
    ],
    define: { 'process.env.NODE_ENV': '"production"', __AVOOZL_VERSION__: '"0.0.0-test"' },
    resolve: { preserveSymlinks: true },
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'AvoozlHarness', fileName: () => 'harness.js' },
    },
  })
  fs.copyFileSync(path.join(here, 'harness.css'), path.join(out, 'harness.css'))
  const css = hostCss ? new URL(`file://${path.resolve(hostCss)}`).href : 'harness.css'
  const links = [`<link rel="stylesheet" href="${css}">`]
  for (const [name, text] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(out, name), text)
    links.push(`<script src="${name}"></script>`)
  }
  fs.writeFileSync(
    path.join(out, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${links.join('')}</head><body><div id="root"></div><script src="harness.js"></script></body></html>`,
  )
  return { dir: out, url: (query) => `file://${path.join(out, 'index.html')}?${new URLSearchParams(query)}`, remove: () => fs.rmSync(out, { recursive: true, force: true }) }
}

// A screenshot script's start: the out folder from argv, Chrome, the
// harness (with the host's stylesheet when AVOOZL_HOST_CSS names one) and a
// browser. Exits with the usage line when no folder is named.
export async function startShots(script) {
  const { findChrome, launch } = await import('./chrome.mjs')
  const [out] = process.argv.slice(2)
  if (!out) {
    console.error(`Usage: ${script} <out dir>`)
    process.exit(2)
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error('No Chrome found; set AVOOZL_CHROME.')
    process.exit(1)
  }
  fs.mkdirSync(out, { recursive: true })
  const harness = await buildHarness({ hostCss: await shotCss() })
  return { out, harness, browser: await launch(chrome) }
}

// The stylesheet a screenshot is drawn on: AVOOZL_HOST_CSS when set, else
// Kiro Crew's own at the pinned release (kirocrew-css.json), fetched and
// cached like the class check's. harness.css has only the theme variables and
// a few utilities, so a shot on it has no gaps and plain buttons, which is
// not what Kiro Crew shows. Page tests keep harness.css.
export async function shotCss() {
  if (process.env.AVOOZL_HOST_CSS) return process.env.AVOOZL_HOST_CSS
  const { kirocrewStylesheet, pin } = await import('../kirocrew-css.mjs')
  await kirocrewStylesheet()
  return path.join(os.tmpdir(), 'avoozl-kirocrew-css', `${pin.sha256}.css`)
}
