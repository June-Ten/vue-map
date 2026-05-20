import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 项目站：https://<user>.github.io/vue-map/
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  plugins: [vue()],
  base,
})
