import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { standaloneConfig } from './standalone.config.ts'
import { fetchKiroCrewUi } from '../../scripts/fetch-kirocrew-ui.mjs'

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string

// One build per bundle, so each file is self-contained with no shared chunk.
// `vite build --mode panel` adds the side-panel tab to dist (panel.mjs); the
// default mode builds the page (index.mjs) and clears dist first.
const entries: Record<string, [string, string]> = {
  page: ['src/App.tsx', 'index.mjs'],
  panel: ['src/Panel.tsx', 'panel.mjs'],
}

export default defineConfig(({ mode }) => {
  if (mode === 'standalone' || mode === 'standalone-css') return standaloneConfig(fetchKiroCrewUi(), mode)
  const entry = entries[mode] ?? entries.page
  return {
    plugins: [react()],
    define: { __AVOOZL_VERSION__: JSON.stringify(version) },
    // A task worktree links node_modules from another checkout; keep module
    // paths in-tree so no machine path reaches the bundle's comments.
    resolve: { preserveSymlinks: true },
    build: {
      lib: {
        entry: entry[0],
        formats: ['es'],
        fileName: () => entry[1],
      },
      outDir: 'dist',
      emptyOutDir: entry === entries.page,
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', '@kirocrew/app-sdk', '@kirocrew/app-sdk/ui', 'lucide-react'],
      },
    },
  }
})
