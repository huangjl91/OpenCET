<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_ITEMS } from '@/router'
import { useUserStore, LEVEL_SHORT } from '@/stores/user'
import { useUiStore } from '@/stores/ui'
import { isLocalMode } from '@/api'
import AiPanel from '@/components/AiPanel.vue'
import CollectButton from '@/components/CollectButton.vue'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const ui = useUiStore()

const localMode = isLocalMode()

const activePath = computed(() => {
  const p = route.path
  if (p.startsWith('/papers')) return '/papers'
  return p
})

function go(path: string) {
  router.push(path)
}

/** Esc 关闭 AI 抽屉 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.aiOpen) ui.closeAi()
}

onMounted(() => {
  store.init()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app-shell">
    <header class="app-nav">
      <div class="app-nav__inner">
        <div class="brand" @click="go('/')" style="cursor: pointer">
          <!-- logo.png 在 public/ 下，直接走站点根路径；用 ./ 会被 Vite 当成相对 src/ 解析而报错 -->
          <img class="brand__logo" src="/logo.png" alt="OpenCET" />
          <span>OpenCET</span>
        </div>

        <nav class="nav-links">
          <a
            v-for="item in NAV_ITEMS"
            :key="item.path"
            class="nav-link"
            :class="{ 'is-active': activePath === item.path }"
            :href="'#' + item.path"
          >
            {{ item.title }}
          </a>
        </nav>

        <div class="nav-right">
          <!-- AI 问答：在右侧滑出抽屉，不跳页 -->
          <button
            class="nav-link nav-link--accent"
            :class="{ 'is-active': ui.aiOpen }"
            :aria-expanded="ui.aiOpen"
            @click="ui.toggleAi()"
          >
            AI 问答
          </button>
          <span class="nav-sep" />
          <span class="tag tag--brand">{{ LEVEL_SHORT[store.level] }}</span>
          <span v-if="localMode" class="tag tag--warn" title="未连接后端，数据保存在本机浏览器">本地模式</span>
          <span v-else class="tag tag--ok" title="已连接 Spring Boot 后端">已连接</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- AI 右侧抽屉 -->
    <div v-if="ui.aiOpen" class="ai-scrim" @click="ui.closeAi()" />
    <aside class="ai-drawer" :class="{ 'is-open': ui.aiOpen }" aria-label="AI 问答">
      <div class="ai-drawer__head">
        <span class="ai-drawer__title">AI 问答</span>
        <span class="spacer" />
        <button class="btn btn--sm btn--ghost" @click="ui.closeAi()">关闭</button>
      </div>
      <AiPanel v-if="ui.aiOpen" class="ai-drawer__panel" @close="ui.closeAi()" />
    </aside>

    <!-- 选中文字就能收录到「好词好句」，全局挂一次 -->
    <CollectButton />

    <nav class="tabbar">
      <button
        v-for="item in NAV_ITEMS"
        :key="item.path"
        class="tabbar__item"
        :class="{ 'is-active': activePath === item.path }"
        @click="go(item.path)"
      >
        {{ item.title }}
      </button>
      <button class="tabbar__item" :class="{ 'is-active': ui.aiOpen }" @click="ui.toggleAi()">AI 问答</button>
    </nav>
  </div>
</template>
