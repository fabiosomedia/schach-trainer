import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative Pfade: läuft so auch unter einem Unterpfad (z. B. GitHub Pages /schach-trainer/)
  base: './',
})
