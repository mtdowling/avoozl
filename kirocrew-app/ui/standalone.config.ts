// The standalone page's build (`vite build --mode standalone`): the Avoozl page
// plus Kiro Crew's own parts, read unmodified from the source at the pin
// (kirocrew-pin.json, fetched by scripts/fetch-kirocrew-ui.mjs). What the page
// does not need is left out here, by configuration alone, never by editing a
// fetched file (SW12.3).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin, UserConfig } from 'vite'

const ui = path.dirname(fileURLToPath(import.meta.url))

// The script may grow to this many bytes and no further (SW2.6). Set from the
// first real build; raise it only in a change that says why.
export const SCRIPT_BUDGET_BYTES = 4_000_000

// Kiro Crew modules the page never reaches, answered with an empty module.
// Each is matched by the importing file and the specifier it writes.
export const LEFT_OUT: { importer: RegExp; specifier: RegExp; reason: string }[] = [
  {
    importer: /app-sdk\/index\.ts$/,
    specifier: /^\.\/(useChatSession|ChatPanel|ChatEmbed|ChatMessageList|messageRenderers)$/,
    reason: "The SDK entry re-exports its chat panel, which reaches the whole dashboard (27.7 MB). The page uses none of it; Open chat is a process session (SW7).",
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
export { Card, CardTitle, Btn, Input, Badge, EmptyState, PageHeader } from '${path.join(site, 'components', 'ui')}'
export { default as SegmentedControl } from '${path.join(site, 'components', 'SegmentedControl')}'
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
      if (!importer || !importer.startsWith(source) || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('\0')) return
      return this.resolve(specifier, path.join(ui, 'src', 'standalone', 'main.tsx'), { ...options, skipSelf: true })
    },
  }
}

export function standaloneConfig(source: string): UserConfig {
  const site = path.join(source, 'website', 'src')
  const nodeModules = path.resolve(ui, '..', '..', 'node_modules')
  return {
    root: path.join(ui, 'src', 'standalone'),
    base: '/apps/avoozl/',
    plugins: [leaveOut(site), resolveFromUi(source), react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify('standalone') },
    resolve: {
      preserveSymlinks: true,
      alias: [
        { find: /^@kirocrew\/app-sdk$/, replacement: path.join(site, 'app-sdk', 'index.ts') },
        { find: /^@\//, replacement: `${site}/` },
        // One React for the page and Kiro Crew's parts: the pin's own version.
        { find: /^react$/, replacement: path.join(nodeModules, 'react18') },
        { find: /^react\/(.*)$/, replacement: `${path.join(nodeModules, 'react18')}/$1` },
        { find: /^react-dom$/, replacement: path.join(nodeModules, 'react-dom18') },
        { find: /^react-dom\/(.*)$/, replacement: `${path.join(nodeModules, 'react-dom18')}/$1` },
      ],
    },
    // The stylesheet names its fonts as /fonts/...; they are copied with their licenses.
    publicDir: path.join(source, 'website', 'public'),
    build: {
      outDir: path.join(ui, 'dist', 'standalone'),
      emptyOutDir: true,
      modulePreload: false,
      // font-src allows 'self' only (SW4.8), so no font is inlined as a data: URL.
      assetsInlineLimit: 0,
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  }
}
