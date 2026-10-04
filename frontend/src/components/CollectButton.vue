<script setup lang="ts">
/**
 * 「选中就能收录」的浮出按钮。
 *
 * 挂一次在 App 里，监听全局选区：用户在任意页面选中一段文字，
 * 选区上方就浮出一个「+ 好词好句」按钮，点一下收录。
 *
 * 几个必须处理好的细节：
 *   - 按钮要用 `mousedown.prevent`，否则点它的瞬间选区就被清掉了，读不到选中的文字；
 *   - 在选择输入框/文本域里的文字时不出现（那是编辑，不是收藏）；
 *   - 收录后先取消选区再收起按钮，否则按钮会一直挂着；
 *   - 滚动、点击空白处、选区塌缩都要收起。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { addFavorite, MAX_LEN } from '@/utils/favorites'

const route = useRoute()

const visible = ref(false)
const pos = ref({ top: 0, left: 0 })
const toast = ref('')
const toastOk = ref(true)
let toastTimer: number | undefined

/** 选区所属的页面名，用作收录来源 */
function currentSource(): string {
  const t = route.meta?.title
  return typeof t === 'string' && t ? t : '其它'
}

/** 选区是不是落在输入框里 */
function insideEditable(node: Node | null): boolean {
  const el = node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null)
  return !!el?.closest('input, textarea, [contenteditable="true"]')
}

function hide() {
  visible.value = false
}

function onSelectionChange() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hide()
    return
  }
  const text = sel.toString().trim()
  if (text.length < 2 || text.length > MAX_LEN) {
    hide()
    return
  }
  if (insideEditable(sel.anchorNode)) {
    hide()
    return
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) {
    hide()
    return
  }
  // 浮在选区上方；贴到屏幕顶部时改到下方，避免被顶出去
  const above = rect.top > 44
  pos.value = {
    top: (above ? rect.top - 38 : rect.bottom + 8) + window.scrollY,
    left: Math.min(Math.max(rect.left + rect.width / 2, 70), window.innerWidth - 70) + window.scrollX,
  }
  visible.value = true
}

function flash(msg: string, ok: boolean) {
  toast.value = msg
  toastOk.value = ok
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 2200)
}

function collect() {
  const sel = window.getSelection()
  const text = sel?.toString() ?? ''
  const r = addFavorite(text, currentSource())
  if (r.added) flash('已加入好词好句', true)
  else if (r.reason === 'duplicate') flash('这句已经在汇总里了', false)
  else if (r.reason === 'too-long') flash('选得太长了，挑一句收吧', false)
  else flash('没选中内容', false)
  // 收起：先取消选区，否则按钮会一直挂着
  sel?.removeAllRanges()
  hide()
}

/** 选择「去汇总页看看」 */
function goFavorites() {
  window.location.hash = '#/favorites'
}

onMounted(() => {
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('mouseup', onSelectionChange)
  window.addEventListener('scroll', hide, { passive: true })
  window.addEventListener('resize', hide)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  document.removeEventListener('mouseup', onSelectionChange)
  window.removeEventListener('scroll', hide)
  window.removeEventListener('resize', hide)
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <div>
    <button
      v-if="visible"
      class="collect-btn"
      :style="{ top: pos.top + 'px', left: pos.left + 'px' }"
      title="把选中的文字收进「好词好句」"
      @mousedown.prevent
      @click="collect"
    >
      + 好词好句
    </button>

    <div v-if="toast" class="collect-toast" :class="{ 'is-bad': !toastOk }" @click="goFavorites">
      {{ toast }}
      <span v-if="toastOk" class="collect-toast__link">去看看</span>
    </div>
  </div>
</template>
