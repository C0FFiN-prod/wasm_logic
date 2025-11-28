import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: '.',
  build: {
    manifest: true,
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    host: true
  }
})