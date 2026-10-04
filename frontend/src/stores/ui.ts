import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 UI 状态。
 *
 * AI 问答不再是一个独立路由页，而是以**右侧抽屉**的形式出现在任何页面之上：
 * 做题时想查一个词、问一道题，直接点顶栏右侧的入口，当前页不会丢。
 */
export const useUiStore = defineStore('ui', () => {
  const aiOpen = ref(false)

  function openAi() {
    aiOpen.value = true
  }
  function closeAi() {
    aiOpen.value = false
  }
  function toggleAi() {
    aiOpen.value = !aiOpen.value
  }

  return { aiOpen, openAi, closeAi, toggleAi }
})
