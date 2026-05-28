import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/opticut-2d/' // <--- Assurez-vous que c'est écrit exactement comme ça
})