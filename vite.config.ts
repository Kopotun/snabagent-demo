import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' — чтобы сборка работала на GitHub Pages по любому пути
export default defineConfig({
  plugins: [react()],
  base: './',
})
