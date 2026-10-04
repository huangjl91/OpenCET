import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  // 相对路径引用静态资源：网页部署（Nginx / vite preview）与 Electron 的 file:// 加载都能用。
  // 默认的 '/' 是绝对路径，打包成桌面应用后 assets 会 404。
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    // 接上 Spring Boot 后端后，/api 请求自动转发到 8080
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  // 生产预览（npm run preview 托管 dist）同样需要 /api 代理，
  // vite preview 默认不继承 server.proxy，必须单独配
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
