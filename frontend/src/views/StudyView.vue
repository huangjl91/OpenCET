<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { wordApi } from '@/api'
import { useUserStore, LEVEL_SHORT } from '@/stores/user'
import type { Level, WordVo } from '@/types'

type Mode = 'today' | 'review' | 'notebook' | 'known' | 'all'

const store = useUserStore()
const { level } = storeToRefs(store)

const mode = ref<Mode>('today')
const queue = ref<WordVo[]>([])
const idx = ref(0)
const revealed = ref(false)
const loading = ref(true)
const goal = ref(20)
const learnedToday = ref(0)
const lastResult = ref<'KNOWN' | 'FUZZY' | 'UNKNOWN' | ''>('')

const MODES: { key: Mode; label: string }[] = [
  { key: 'today', label: '今日任务' },
  { key: 'review', label: '待复习' },
  { key: 'notebook', label: '生词本' },
  { key: 'known', label: '已掌握' },
  { key: 'all', label: '全部词库' },
]

const current = computed(() => queue.value[idx.value] ?? null)
const finished = computed(() => queue.value.length > 0 && idx.value >= queue.value.length)
const progressPercent = computed(() =>
  queue.value.length ? Math.round((idx.value / queue.value.length) * 100) : 0
)

async function load() {
  loading.value = true
  revealed.value = false
  lastResult.value = ''
  idx.value = 0
  try {
    if (mode.value === 'today') {
      const q = await wordApi.today(level.value)
      queue.value = [...q.newWords, ...q.reviewWords]
      goal.value = q.goal
      learnedToday.value = q.learnedToday
    } else if (mode.value === 'review') {
      const q = await wordApi.today(level.value)
      queue.value = q.reviewWords
    } else if (mode.value === 'notebook') {
      queue.value = await wordApi.notebook()
    } else if (mode.value === 'known') {
      queue.value = await wordApi.byStatus(level.value, 'KNOWN')
    } else {
      queue.value = await wordApi.list(level.value)
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function setMode(m: Mode) {
  mode.value = m
  await load()
}

async function setLevel(l: Level) {
  await store.setLevel(l)
  await load()
}

async function answer(result: 'KNOWN' | 'FUZZY' | 'UNKNOWN') {
  const w = current.value
  if (!w) return
  lastResult.value = result
  revealed.value = true
  await wordApi.submit({
    wordId: w.id,
    result,
    mode: w.mode,
  })
  if (mode.value === 'today' && w.mode === 'new') learnedToday.value += 1
  await store.refreshStats()
}

function next() {
  if (idx.value < queue.value.length) idx.value += 1
  revealed.value = false
  lastResult.value = ''
  if (idx.value >= queue.value.length) store.refreshStats()
}

async function toggleNotebook() {
  const w = current.value
  if (!w) return
  const nextFlag = w.inNotebook === 1 ? 0 : 1
  const updated = await wordApi.toggleNotebook(w.id, nextFlag)
  queue.value[idx.value] = { ...updated, mode: w.mode }
  await store.refreshStats()
}

function onKey(e: KeyboardEvent) {
  if (finished.value) return
  if (!revealed.value) {
    if (e.key === '1') answer('UNKNOWN')
    else if (e.key === '2') answer('FUZZY')
    else if (e.key === '3') answer('KNOWN')
    return
  }
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault()
    next()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <h1 class="page-title">每日打卡背单词</h1>
    <p class="page-sub">先选备考等级 → 按每日定量学习 → 系统按遗忘曲线自动安排复习</p>

    <div class="row" style="margin-bottom: 14px">
      <div class="segmented">
        <button
          class="segmented__item"
          :class="{ 'is-active': level === 'CET4' }"
          @click="setLevel('CET4')"
        >
          四级 CET-4
        </button>
        <button
          class="segmented__item"
          :class="{ 'is-active': level === 'CET6' }"
          @click="setLevel('CET6')"
        >
          六级 CET-6
        </button>
      </div>
      <div class="spacer" />
      <span class="tag tag--brand">{{ LEVEL_SHORT[level] }} 词库</span>
    </div>

    <div class="segmented" style="margin-bottom: 16px">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="segmented__item"
        :class="{ 'is-active': mode === m.key }"
        @click="setMode(m.key)"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="card empty">词库加载中…</div>

    <!-- 完成 -->
    <div v-else-if="finished" class="card">
      <div class="empty">
        <h2 style="margin: 0 0 6px">本轮任务完成</h2>
        <p class="muted" style="margin: 0 0 4px">
          本轮共 {{ queue.length }} 词
          <span v-if="mode === 'today'">· 今日已新学 {{ learnedToday }} / {{ goal }}</span>
        </p>
        <p class="small muted">
          连续打卡 {{ store.stats?.streak ?? 0 }} 天 · 已掌握 {{ store.stats?.knownTotal ?? 0 }} 词
        </p>
        <div class="row" style="justify-content: center; margin-top: 16px">
          <button class="btn btn--primary" @click="load">再来一轮</button>
          <a class="btn" href="#/translation">去做翻译练习</a>
        </div>
      </div>
    </div>

    <!-- 空队列 -->
    <div v-else-if="queue.length === 0" class="card">
      <div class="empty">
        <p style="margin: 0">
          {{
            mode === 'today'
              ? '今天的任务已完成，明天再来或去复习生词本吧！'
              : mode === 'notebook'
                ? '生词本还是空的，学习中点「不认识」会自动收录。'
                : mode === 'known'
                  ? '还没有标记为「已掌握」的单词。'
                  : '暂无数据。'
          }}
        </p>
      </div>
    </div>

    <!-- 学习卡片 -->
    <template v-else>
      <div class="row small muted" style="margin-bottom: 8px">
        <span>第 {{ idx + 1 }} / {{ queue.length }} 个</span>
        <span v-if="current.mode === 'review'" class="tag tag--warn">复习</span>
        <span v-else class="tag tag--brand">新学</span>
        <span v-if="current.inNotebook === 1" class="tag tag--danger">生词本</span>
        <span class="spacer" />
        <span v-if="mode === 'today'">今日已学 {{ learnedToday }} / {{ goal }}</span>
      </div>

      <div class="progress" style="margin-bottom: 14px">
        <div class="progress__bar" :style="{ width: progressPercent + '%' }" />
      </div>

      <div class="word-card">
        <div class="word-card__word">{{ current.word }}</div>
        <div class="word-card__phonetic">{{ current.phonetic }}</div>

        <div v-if="revealed" class="fade-enter-active">
          <div class="word-card__meaning">
            <span class="word-card__pos">{{ current.pos }}</span>{{ current.meaning }}
          </div>
          <div class="word-card__example">
            <div class="en">{{ current.exampleEn }}</div>
            <div>{{ current.exampleZh }}</div>
            <div class="tiny muted" style="margin-top: 6px">— {{ current.source }}</div>
          </div>
        </div>
        <div v-else class="muted small" style="margin-top: 14px">
          回想一下释义，然后选择下方按钮（快捷键 <span class="kbd">1</span>
          <span class="kbd">2</span> <span class="kbd">3</span>）
        </div>
      </div>

      <div class="row" style="justify-content: center; margin-top: 16px">
        <template v-if="!revealed">
          <button class="btn btn--danger" @click="answer('UNKNOWN')">不认识</button>
          <button class="btn" @click="answer('FUZZY')">模糊</button>
          <button class="btn btn--primary" @click="answer('KNOWN')">认识</button>
        </template>
        <template v-else>
          <button class="btn" @click="toggleNotebook">
            {{ current.inNotebook === 1 ? '移出生词本' : '加入生词本' }}
          </button>
          <button class="btn btn--primary" @click="next">
            下一个 <span class="kbd" style="margin-left: 4px">Space</span>
          </button>
        </template>
      </div>

      <div v-if="revealed && lastResult" class="card" style="margin-top: 16px">
        <div class="row small">
          <span
            class="tag"
            :class="{
              'tag--ok': lastResult === 'KNOWN',
              'tag--warn': lastResult === 'FUZZY',
              'tag--danger': lastResult === 'UNKNOWN',
            }"
          >
            {{ lastResult === 'KNOWN' ? '认识' : lastResult === 'FUZZY' ? '模糊' : '不认识' }}
          </span>
          <span class="muted">
            {{
              lastResult === 'KNOWN'
                ? '已按遗忘曲线升阶，下次复习间隔更长。'
                : lastResult === 'FUZZY'
                  ? '12 小时后再次出现。'
                  : '已降 2 阶并加入生词本，5 分钟后再练一次。'
            }}
          </span>
        </div>
      </div>
    </template>

    <!-- 词库列表（全部词库模式） -->
    <div v-if="!loading && mode === 'all' && queue.length" class="card">
      <div class="card__title">{{ LEVEL_SHORT[level] }}词库（共 {{ queue.length }} 词）</div>
      <div style="max-height: 420px; overflow-y: auto">
        <div v-for="w in queue" :key="w.id" class="list-item">
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 700">
              {{ w.word }}
              <span class="muted small">{{ w.phonetic }}</span>
            </div>
            <div class="small muted">
              <i style="color: var(--brand)">{{ w.pos }}</i> {{ w.meaning }}
            </div>
          </div>
          <span
            class="tag"
            :class="{
              'tag--ok': w.status === 'KNOWN',
              'tag--brand': w.status === 'LEARNING',
            }"
          >
            {{ w.status === 'KNOWN' ? '已掌握' : w.status === 'LEARNING' ? '学习中' : '未学' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
