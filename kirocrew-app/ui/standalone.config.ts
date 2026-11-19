// The standalone page's build (`vite build --mode standalone`): the Avoozl page
// plus Kiro Crew's own parts, read unmodified from the source at the pin
// (kirocrew-pin.json, fetched by scripts/fetch-kirocrew-ui.mjs). What the page
// does not need is left out here, by configuration alone, never by editing a
// fetched file (SW12.3).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin, UserConfig } from 'vite'
import { listStyleTexts } from '../../scripts/standalone-styles.mjs'

// Vite names modules with forward slashes on every platform.
const posix = (file: string) => file.split(path.sep).join('/')
const ui = posix(path.dirname(fileURLToPath(import.meta.url)))

// The script may grow to this many bytes and no further (SW2.6). Set from the
// first real build; raise it only in a change that says why.
export const SCRIPT_BUDGET_BYTES = 4_000_000

// Kiro Crew modules the page never reaches, answered with an empty module.
// Each is matched by the importing file and the specifier it writes.
export const LEFT_OUT: {
  importer: RegExp
  specifier: RegExp
  reason: string
}[] = [
  {
    importer: /app-sdk\/index\.ts$/,
    specifier: /^\.\/(useChatSession|ChatPanel|ChatEmbed|ChatMessageList|messageRenderers)$/,
    reason: 'The SDK entry re-exports its chat panel, which reaches the whole dashboard (27.7 MB). The page uses none of it; Open chat is a process session (SW7).',
  },
]

// The names the empty module must still export so the SDK's re-export lines
// resolve. Each is undefined.
const EMPTY_NAMES = ['useChatSession', 'defaultMessageRenderers', 'GROUPED_ROLES', 'mergeRenderers', 'resolveRenderer', 'ToolCallPill']
const EMPTY_ID = '\0avoozl-left-out'

// `@kirocrew/app-sdk/ui` is Kiro Crew's kirocrew-ui/index.ts, whose Modal,
// Markdown and settings exports reach the whole dashboard. The parts the page
// uses come from the files that define them. A part a later change needs is
// added to this list, after checking the build stays within its budget.
const UI_ID = '\0avoozl-kirocrew-ui'
const UI_PARTS = (site: string) => `
export { Card, CardTitle, Btn, Input, Badge, EmptyState, PageHeader, Toggle } from ${JSON.stringify(posix(path.join(site, 'components', 'ui')))}
export { default as SegmentedControl } from ${JSON.stringify(posix(path.join(site, 'components', 'SegmentedControl')))}
`

function leaveOut(site: string): Plugin {
  return {
    name: 'avoozl-left-out',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === EMPTY_ID || source === UI_ID) return source
      if (source === '@kirocrew/app-sdk/ui') return UI_ID
      if (importer && LEFT_OUT.some((rule) => rule.importer.test(importer) && rule.specifier.test(source))) return EMPTY_ID
    },
    load(id) {
      if (id === UI_ID) return UI_PARTS(site)
      if (id !== EMPTY_ID) return
      return `export default undefined\n${EMPTY_NAMES.map((name) => `export const ${name} = undefined`).join('\n')}\n`
    },
  }
}

// Kiro Crew's files import packages by bare name, but they sit in a cache
// outside this repository. Resolve those names from the ui folder's own
// installed packages, so the versions are the ones this repository pins.
function resolveFromUi(source: string): Plugin {
  return {
    name: 'avoozl-resolve-from-ui',
    enforce: 'pre',
    async resolveId(specifier, importer, options) {
      if (!importer || !importer.startsWith(posix(source)) || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('\0')) return
      return this.resolve(specifier, path.join(ui, 'src', 'standalone', 'main.tsx'), { ...options, skipSelf: true })
    },
  }
}

// Kiro Crew modules that mean the dashboard came along (SW2.6). The build
// fails when one is in the script.
const DASHBOARD = /\/website\/src\/(pages|pierre|chat-core|shell|store|apps)\//

// Writes dist/standalone-build.json beside the bundle: the packages and their
// versions it holds (for the notices and the version test), the style texts the
// server allows by hash, and the script's size. Fails the build over budget, or
// when a dashboard module is in it.
function report(source: string): Plugin {
  const modules = new Set<string>()
  return {
    name: 'avoozl-report',
    moduleParsed: (info) => void modules.add(info.id),
    writeBundle(options, bundle) {
      const dashboard = [...modules].filter((id) => DASHBOARD.test(id))
      if (dashboard.length) throw new Error(`The standalone script holds Kiro Crew's dashboard: ${dashboard[0]}`)
      const script = Object.values(bundle).find((chunk) => chunk.type === 'chunk')
      const bytes = Buffer.byteLength(script && script.type === 'chunk' ? script.code : '')
      if (bytes > SCRIPT_BUDGET_BYTES)
        throw new Error(
          `The standalone script is ${bytes} bytes, over its budget of ${SCRIPT_BUDGET_BYTES}. Raise the budget in standalone.config.ts only in a change that says why.`,
        )
      const packages: Record<string, string> = {}
      for (const id of modules) {
        const found = id.replace(/\\/g, '/').match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)
        if (!found) continue
        const root = id.replace(/\\/g, '/').slice(0, id.replace(/\\/g, '/').indexOf(found[0]) + found[0].length)
        packages[found[1]] = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
      }
      const site = path.join(source, 'website')
      const kirocrewModules = [...modules]
        .filter((id) => id.startsWith(posix(site) + '/'))
        .map((id) => id.slice(posix(source).length + 1))
        .sort()
      const styles = listStyleTexts(path.join(ui, 'src')).map((entry) => entry.text)
      // Kiro Crew's own notices travel with the bundle (SW12.6); its fonts'
      // licenses were copied with the fonts.
      for (const name of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES']) fs.copyFileSync(path.join(source, name), path.join(options.dir ?? '', name))
      fs.copyFileSync(path.join(ui, '..', '..', 'THIRD_PARTY_NOTICES.md'), path.join(options.dir ?? '', 'THIRD_PARTY_NOTICES.md'))
      const out = path.join(options.dir ?? '', '..', 'standalone-build.json')
      fs.writeFileSync(
        out,
        JSON.stringify(
          {
            pin: path.basename(source),
            scriptBytes: bytes,
            kirocrewModules,
            packages: Object.fromEntries(Object.entries(packages).sort()),
            styles: [...new Set(styles)],
          },
          null,
          2,
        ) + '\n',
      )
    },
  }
}

export function standaloneConfig(source: string, mode: 'standalone' | 'standalone-css' = 'standalone'): UserConfig {
  const site = path.join(source, 'website', 'src')
  const nodeModules = path.resolve(ui, '..', '..', 'node_modules')
  const config: UserConfig = {
    root: path.join(ui, 'src', 'standalone'),
    base: '/apps/avoozl/',
    plugins: [leaveOut(site), resolveFromUi(source), react(), tailwindcss(), report(source)],
    define: { __APP_VERSION__: JSON.stringify('standalone') },
    resolve: {
      preserveSymlinks: true,
      alias: [
        {
          find: /^@kirocrew\/app-sdk$/,
          replacement: path.join(site, 'app-sdk', 'index.ts'),
        },
        { find: /^@\//, replacement: `${site}/` },
        // One React for the page and Kiro Crew's parts: the pin's own version.
        { find: /^react$/, replacement: path.join(nodeModules, 'react18') },
        {
          find: /^react\/(.*)$/,
          replacement: `${path.join(nodeModules, 'react18')}/$1`,
        },
        {
          find: /^react-dom$/,
          replacement: path.join(nodeModules, 'react-dom18'),
        },
        {
          find: /^react-dom\/(.*)$/,
          replacement: `${path.join(nodeModules, 'react-dom18')}/$1`,
        },
      ],
    },
    // The stylesheet names its fonts as /fonts/...; they are copied with their licenses.
    publicDir: path.join(source, 'website', 'public'),
    build: {
      outDir: path.join(ui, 'dist', 'standalone'),
      emptyOutDir: true,
      modulePreload: false,
      chunkSizeWarningLimit: SCRIPT_BUDGET_BYTES / 1000,
      // font-src allows 'self' only (SW4.8), so no font is inlined as a data: URL.
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      rollupOptions: { output: { codeSplitting: false } },
    },
  }
  if (mode === 'standalone') return config
  // Kiro Crew's stylesheet alone (SW12.9): no page sources, no script.
  return {
    ...config,
    plugins: [resolveFromUi(source), tailwindcss()],
    build: {
      ...config.build,
      outDir: path.join(ui, 'dist', 'kirocrew-only'),
      rollupOptions: {
        input: path.join(ui, 'src', 'standalone', 'kirocrew-only.ts'),
        output: { codeSplitting: false },
      },
    },
  }
}
