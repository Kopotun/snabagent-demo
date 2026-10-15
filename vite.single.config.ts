import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Сборка в один HTML-файл: можно переслать в мессенджере и открыть без интернета
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { outDir: 'dist-file', emptyOutDir: true },
})
