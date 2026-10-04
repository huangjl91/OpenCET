<script setup lang="ts">
/**
 * 好词好句汇总页。
 *
 * 条目来自「选中文字 → 浮出按钮」的收录，也可以在这里手动粘贴添加。
 */
import { computed, ref } from 'vue'
import {
  clearFavorites,
  filterFavorites,
  listFavorites,
  MAX_LEN,
  removeFavorite,
  sourcesOf,
  toMarkdown,
  updateNote,
  addFavorite,
  type FavoriteItem,
} from '@/utils/favorites'

const items = ref<FavoriteItem[]>(listFavorites())
const keyword = ref('')
const sourceFilter = ref('')
const sourceList = computed(() => sourcesOf(items.value))
const shown = computed(() => filterFavorites(items.value, keyword.value, sourceFilter.value))

const manual = ref('')
const manualMsg = ref('')
const copied = ref('')

function refresh() {
  items.value = listFavorites()
}

function addManual() {
  const r = addFavorite(manual.value, '手动添加')
  if (r.added) {
    manual.value = ''
    manualMsg.value = '已添加'
    refresh()
  } else if (r.reason === 'duplicate') manualMsg.value = '这条已经在汇总里了'
  else if (r.reason === 'too-long') manualMsg.value = `太长了（上限 ${MAX_LEN} 字符）`
  else manualMsg.value = '请输入内容'
  window.setTimeout(() => (manualMsg.value = ''), 2200)
}

function del(it: FavoriteItem) {
  removeFavorite(it.id)
  refresh()
}

function onNote(it: FavoriteItem, e: Event) {
  const v = (e.target as HTMLInputElement).value
  updateNote(it.id, v)
  refresh()
}

async function copyOne(it: FavoriteItem) {
  try {
    await navigator.clipboard.writeText(it.text)
    copied.value = it.id
    window.setTimeout(() => (copied.value = ''), 1500)
  } catch {
    copied.value = ''
  }
}

function copyAll() {
  const md = toMarkdown(shown.value)
  if (!md) return
  void navigator.clipboard.writeText(md).catch(() => {})
}

function exportMarkdown() {
  const md = toMarkdown(items.value)
  if (!md) return
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '好词好句.md'
  a.click()
  URL.revokeObjectURL(url)
}

function doClear() {
  if (!items.value.length) return
  clearFavorites()
  refresh()
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
</script>

<template>
  <div>
    <h1 class="page-title">好词好句</h1>
    <p class="page-sub">
      在任意页面（阅读原文、翻译参考译文、作文金句、AI 讲解…）选中一段文字，浮出的「+ 好词好句」按钮点一下就能收录到这里。
    </p>

    <div class="card">
      <div class="row" style="gap: 8px; flex-wrap: wrap">
        <div class="card__title" style="margin: 0">汇总（{{ items.length }}）</div>
        <span class="tiny muted">共 {{ sourceList.length }} 个来源</span>
        <div class="spacer" />
        <input v-model="keyword" class="input" placeholder="搜索内容或备注…" style="width: 180px" />
        <select v-model="sourceFilter" class="select" style="width: auto">
          <option value="">全部来源</option>
          <option v-for="s in sourceList" :key="s.name" :value="s.name">{{ s.name }}（{{ s.count }}）</option>
        </select>
        <button class="btn btn--sm" :disabled="!shown.length" @click="copyAll">复制筛选结果</button>
        <button class="btn btn--sm" :disabled="!items.length" @click="exportMarkdown">导出 Markdown</button>
        <button class="btn btn--sm btn--danger" :disabled="!items.length" @click="doClear">清空</button>
      </div>

      <!-- 手动添加 -->
      <div class="row" style="margin-top: 12px; gap: 8px; align-items: flex-start">
        <textarea
          v-model="manual"
          class="textarea"
          style="flex: 1; min-height: 52px"
          placeholder="也可以直接在这里粘贴一条好词好句…"
        />
        <button class="btn btn--primary" style="flex: none" @click="addManual">添加</button>
      </div>
      <p v-if="manualMsg" class="tiny" style="margin: 6px 0 0; color: var(--text-2)">{{ manualMsg }}</p>
    </div>

    <div v-if="!items.length" class="card empty">
      还没有收录。去「阅读方法」「作文方法」或「翻译练习」页面选一段文字试试。
    </div>

    <div v-else-if="!shown.length" class="card empty">没有匹配的条目。</div>

    <div v-for="it in shown" v-else :key="it.id" class="card fav">
      <div class="row" style="align-items: flex-start; gap: 8px">
        <div class="fav__text">{{ it.text }}</div>
        <button class="btn btn--sm btn--ghost" style="flex: none" @click="copyOne(it)">
          {{ copied === it.id ? '已复制' : '复制' }}
        </button>
        <button class="btn btn--sm btn--ghost" style="flex: none" @click="del(it)">删除</button>
      </div>
      <div class="row" style="margin-top: 8px; gap: 10px">
        <span class="tag">{{ it.source || '未标注' }}</span>
        <span class="tiny muted">{{ fmtDate(it.createdAt) }}</span>
        <div class="spacer" />
        <input
          class="input fav__note"
          :value="it.note"
          placeholder="加个备注（比如「这个句式可以套用」）"
          @change="onNote(it, $event)"
        />
      </div>
    </div>
  </div>
</template>
