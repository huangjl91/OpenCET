import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { statsApi, userApi, warmup } from '@/api'
import type { Level, Stats, UserProfile } from '@/types'

export const LEVEL_LABEL: Record<Level, string> = {
  CET4: '英语四级 CET-4',
  CET6: '英语六级 CET-6',
}

export const LEVEL_SHORT: Record<Level, string> = {
  CET4: '四级',
  CET6: '六级',
}

export const useUserStore = defineStore('user', () => {
  const profile = ref<UserProfile>({
    id: 0,
    nickname: 'CET 考生',
    currentLevel: 'CET4',
    dailyGoal: 20,
    reviewGoal: 40,
  })
  const stats = ref<Stats | null>(null)
  const ready = ref(false)

  const level = computed<Level>(() => profile.value.currentLevel ?? 'CET4')

  async function loadProfile() {
    try {
      profile.value = await userApi.get()
      await warmup(level.value)
    } catch (e) {
      console.warn('[store] 用户资料加载失败', e)
    }
  }

  async function refreshStats() {
    try {
      stats.value = await statsApi.overview()
    } catch (e) {
      console.warn('[store] 统计加载失败', e)
    }
  }

  async function setLevel(next: Level) {
    profile.value = await userApi.update({ currentLevel: next })
    await warmup(next)
    await refreshStats()
  }

  async function updateSettings(body: Partial<UserProfile>) {
    profile.value = await userApi.update(body)
    await refreshStats()
  }

  async function init() {
    await loadProfile()
    await refreshStats()
    ready.value = true
  }

  return { profile, stats, ready, level, init, loadProfile, refreshStats, setLevel, updateSettings }
})
