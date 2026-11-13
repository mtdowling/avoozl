import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // A task worktree links node_modules from another checkout; keep module
  // paths in-tree so no machine path reaches the bundle's comments.
  resolve: { preserveSymlinks: true },
  build: {
    lib: {
      entry: 'src/App.tsx',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@kirocrew/app-sdk',
        '@kirocrew/app-sdk/ui',
        'lucide-react',
      ],
    },
  },
})
