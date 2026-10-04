<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { errorApi } from '@/api'
import type { ErrorItem, ErrorSourceType } from '@/types'

const items = ref<ErrorItem[]>([])
const loading = ref(true)
const typeFilter = ref<'ALL' | ErrorSourceType>('ALL')
const showResolved = ref(false)

const TYPE_LABEL: Record<ErrorSourceType, string> = {
  WORD: '单词',
  TRANSLATION: '翻译',
  PAPER: '真题',
}

async function load() {
  loading.value = true
  try {
    items.value = await errorApi.list()
  } finally {
    loading.value = false
  }
}

onMounted(load)

const filtered = computed(() =>
  items.value.filter(
    (e) =>
      (typeFilter.value === 'ALL' || e.sourceType === typeFilter.value) &&
      (showResolved.value ? true : !e.resolved)
  )
)

async function toggleResolved(e: ErrorItem) {
  await errorApi.update(e.id, { resolved: !e.resolved })
  e.resolved = !e.resolved
}

async function remove(id: number) {
  if (!confirm('确定删除这条错题记录？')) return
  await errorApi.remove(id)
  await load()
}

async function clearAll() {
  if (!confirm('确定清空当前筛选下的全部错题？')) return
  await errorApi.clear(typeFilter.value === 'ALL' ? undefined : typeFilter.value)
  await load()
}
</script>

<template>
  <div>
    <h1 class="page-title">错题本</h1>
    <p class="page-sub">
      翻译低于 70 分、真题答错、单词点「不认识」都会自动收录；真题答对或单词练到掌握后自动移出，也可手动归档。
    </p>

    <div class="row" style="margin-bottom: 14px">
      <div class="segmented">
        <button class="segmented__item" :class="{ 'is-active': typeFilter === 'ALL' }" @click="typeFilter = 'ALL'">
          全部
        </button>
        <button class="segmented__item" :class="{ 'is-active': typeFilter === 'TRANSLATION' }" @click="typeFilter = 'TRANSLATION'">
          翻译
        </button>
        <button class="segmented__item" :class="{ 'is-active': typeFilter === 'PAPER' }" @click="typeFilter = 'PAPER'">
          真题
        </button>
        <button class="segmented__item" :class="{ 'is-active': typeFilter === 'WORD' }" @click="typeFilter = 'WORD'">
          单词
        </button>
      </div>
      <label class="row small muted" style="gap: 6px; cursor: pointer">
        <input v-model="showResolved" type="checkbox" /> 显示已掌握
      </label>
      <span class="spacer" />
      <button class="btn btn--sm btn--danger" :disabled="!filtered.length" @click="clearAll">清空</button>
    </div>

    <div v-if="loading" class="card empty">加载中…</div>
    <div v-else-if="!filtered.length" class="card">
      <div class="empty">
        <p style="margin: 0">暂无错题，保持住！</p>
      </div>
    </div>

    <div v-for="e in filtered" :key="e.id" class="card">
      <div class="row" style="align-items: flex-start">
        <span class="tag tag--purple">{{ TYPE_LABEL[e.sourceType] }}</span>
        <span style="font-weight: 700; flex: 1; min-width: 0">{{ e.title }}</span>
        <span v-if="e.resolved" class="tag tag--ok">已掌握</span>
        <button class="btn btn--sm btn--ghost" @click="remove(e.id)">删除</button>
      </div>

      <div class="grid grid-2" style="margin-top: 12px">
        <div>
          <div class="tiny muted" style="font-weight: 700">题目 / 原文</div>
          <div class="small" style="white-space: pre-wrap; line-height: 1.8">{{ e.content }}</div>
        </div>
        <div>
          <div class="tiny muted" style="font-weight: 700">参考答案</div>
          <div class="small" style="white-space: pre-wrap; line-height: 1.8">{{ e.rightAnswer || '—' }}</div>
        </div>
      </div>

      <div style="margin-top: 12px">
        <div class="tiny muted" style="font-weight: 700">我的作答</div>
        <div class="small" style="white-space: pre-wrap; line-height: 1.8; color: var(--danger)">
          {{ e.userAnswer || '—' }}
        </div>
      </div>

      <div v-if="e.note" class="small" style="margin-top: 10px; color: var(--text-2)">{{ e.note }}</div>

      <div class="row" style="margin-top: 12px">
        <span class="tiny muted">{{ e.createTime?.slice(0, 16).replace('T', ' ') }}</span>
        <span class="spacer" />
        <button class="btn btn--sm" @click="toggleResolved(e)">
          {{ e.resolved ? '取消已掌握' : '标记已掌握' }}
        </button>
      </div>
    </div>
  </div>
</template>
