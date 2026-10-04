import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '学习总览' } },
  { path: '/study', name: 'study', component: () => import('@/views/StudyView.vue'), meta: { title: '背单词' } },
  { path: '/reading', name: 'reading', component: () => import('@/views/ReadingView.vue'), meta: { title: '阅读方法' } },
  { path: '/writing', name: 'writing', component: () => import('@/views/WritingView.vue'), meta: { title: '作文方法' } },
  { path: '/translation', name: 'translation', component: () => import('@/views/TranslationView.vue'), meta: { title: '翻译练习' } },
  { path: '/papers', name: 'papers', component: () => import('@/views/PapersView.vue'), meta: { title: '真题拆解' } },
  { path: '/papers/:id', name: 'paper-detail', component: () => import('@/views/PaperDetailView.vue'), meta: { title: '真题练习', hide: true } },
  { path: '/errors', name: 'errors', component: () => import('@/views/ErrorBookView.vue'), meta: { title: '错题本' } },
  { path: '/favorites', name: 'favorites', component: () => import('@/views/FavoritesView.vue'), meta: { title: '好词好句' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

/**
 * 顶部导航 / 底部 Tab 的条目。
 *
 * 注意这里**没有 AI 问答**：它已经不是独立路由页，而是由 App.vue 在右侧滑出的抽屉，
 * 这样在任何页面都能唤起，不会丢掉当前正在做的题。
 */
export const NAV_ITEMS = routes
  .filter((r) => !r.meta?.hide)
  .map((r) => ({
    path: r.path as string,
    name: String(r.name),
    title: r.meta?.title as string,
  }))

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = (to.meta?.title as string) || ''
  document.title = title ? `${title} · OpenCET` : 'OpenCET · 四六级在线学习'
})
