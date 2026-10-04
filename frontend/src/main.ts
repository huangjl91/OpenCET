import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { probeBackend } from './api'
import './styles/main.css'

async function bootstrap() {
  // 先探测后端，后端不可用则自动进入本地模式（数据存 localStorage）
  await probeBackend()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap()
