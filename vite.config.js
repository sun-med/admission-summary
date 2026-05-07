import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change 'admission-summary' to your actual GitHub repository name
const REPO_NAME = 'admission-summary'

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
})
