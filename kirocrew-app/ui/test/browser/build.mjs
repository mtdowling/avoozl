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

// `hostCss` is an optional stylesheet (the host's own) used instead of the
// harness's; screenshots use it to look like the real page.
// `scripts` maps file names to classic scripts that load before the page,
// such as the Demo mode replies (demo-replies.mjs).
export async function buildHarness({ hostCss, scripts = {} } = {}) {
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
          if (id === 'lucide-react') return '\0lucide-react'
          if (id === '@kirocrew/app-sdk' || id === '@kirocrew/app-sdk/ui') return path.join(here, 'stubs.tsx')
          return null
        },
        load(id) {
          return id === '\0lucide-react' ? lucide() : null
        },
      },
    ],
    define: { 'process.env.NODE_ENV': '"production"' },
    resolve: { preserveSymlinks: true },
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      lib: { entry: path.join(here, 'harness.tsx'), formats: ['iife'], name: 'AvoozlHarness', fileName: () => 'harness.js' },
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
