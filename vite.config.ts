/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative Pfade: läuft so auch unter einem Unterpfad (z. B. GitHub Pages /schach-trainer/)
  base: './',
  test: {
    // Arbeitskopien paralleler Agents (git worktrees) nicht mittesten
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
