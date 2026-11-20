import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        app: resolve(process.cwd(), 'app.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) return 'vendor-react'
          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase'
          if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons'
        },
      },
    },
  },
})
