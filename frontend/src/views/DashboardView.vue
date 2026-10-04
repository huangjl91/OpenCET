<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ScoreConverter from '@/components/ScoreConverter.vue'
import { checkinApi, statsApi, wordApi } from '@/api'
import { useUserStore, LEVEL_SHORT } from '@/stores/user'
import { useUiStore } from '@/stores/ui'
import type { CheckinRecord, Level, StreakInfo, TodayQueue } from '@/types'

const store = useUserStore()
const ui = useUiStore()
const router = useRouter()

const queue = ref<TodayQueue | null>(null)
const streakInfo = ref<StreakInfo>({ current: 0, longest: 0, totalDays: 0, dates: [] })
const recent = ref<CheckinRecord[]>([])
const loading = ref(true)

const todayKey = new Date().toISOString().slice(0, 10)

async function load() {
  loading.value = true
  try {
    const [q, s, list] = await Promise.all([
      wordApi.today(store.level),
      checkinApi.streak(),
      checkinApi.list(30),
    ])
    queue.value = q
    streakInfo.value = s
    recent.value = list
  } finally {
    loading.value = false
  }
}

onMounted(load)

const stats = computed(() => store.stats)

const todoCount = computed(
  () => (queue.value?.newWords.length ?? 0) + (queue.value?.reviewWords.length ?? 0)
)

const dayPercent = computed(() => {
  if (!queue.value || !queue.value.goal) return 0
  return Math.min(100, Math.round((queue.value.learnedToday / queue.value.goal) * 100))
})

const learnedPercent = computed(() => {
  if (!stats.value || !stats.value.wordTotal) return 0
  return Math.min(100, Math.round((stats.value.knownTotal / stats.value.wordTotal) * 100))
})

async function switchLevel(level: Level) {
  await store.setLevel(level)
  await load()
  await statsApi.overview().then((s) => (store.stats = s))
}
</script>

<template>
  <div>
    <div class="row" style="align-items: flex-end; margin-bottom: 16px">
      <div>
        <h1 class="page-title">今天也要背单词</h1>
        <p class="page-sub">
          {{ store.profile.nickname }} · 正在备考 {{ LEVEL_SHORT[store.level] }}
          <span v-if="stats">· 连续打卡 {{ stats.streak }} 天</span>
        </p>
      </div>
      <div class="spacer" />
      <div class="segmented">
        <button
          class="segmented__item"
          :class="{ 'is-active': store.level === 'CET4' }"
          @click="switchLevel('CET4')"
        >
          四级
        </button>
        <button
          class="segmented__item"
          :class="{ 'is-active': store.level === 'CET6' }"
          @click="switchLevel('CET6')"
        >
          六级
        </button>
      </div>
    </div>

    <!-- 今日任务 -->
    <div class="card">
      <div class="row" style="align-items: flex-start">
        <div style="flex: 1; min-width: 220px">
          <div class="card__title">今日任务</div>
          <div class="row small muted" style="gap: 16px; margin-bottom: 10px">
            <span>新学 <b style="color: var(--text)">{{ queue?.learnedToday ?? 0 }}</b> / {{ queue?.goal ?? 20 }}</span>
            <span>复习 <b style="color: var(--text)">{{ queue?.reviewedToday ?? 0 }}</b></span>
            <span>待完成 <b style="color: var(--brand)">{{ todoCount }}</b></span>
          </div>
          <div class="progress" style="max-width: 420px">
            <div class="progress__bar" :style="{ width: dayPercent + '%' }" />
          </div>
          <p class="tiny muted" style="margin: 8px 0 0">
            按艾宾浩斯遗忘曲线自动安排复习：答对升阶（1→2→4→7→15→30→60 天），答错降 2 阶并进入生词本。
          </p>
        </div>
        <button class="btn btn--primary" @click="router.push('/study')">
          {{ todoCount > 0 ? '开始学习' : '去复习' }} →
        </button>
      </div>
    </div>

    <!-- 数据概览 -->
    <div class="grid grid-4" style="margin-top: 16px">
      <div class="stat">
        <div class="stat__label">连续打卡</div>
        <div class="stat__value" style="color: var(--brand)">{{ stats?.streak ?? 0 }}</div>
        <div class="stat__hint">最长 {{ stats?.longestStreak ?? 0 }} 天 · 累计 {{ stats?.checkinDays ?? 0 }} 天</div>
      </div>
      <div class="stat">
        <div class="stat__label">已学单词</div>
        <div class="stat__value">{{ stats?.learnedTotal ?? 0 }}</div>
        <div class="stat__hint">词库共 {{ stats?.wordTotal ?? 0 }} 词</div>
      </div>
      <div class="stat">
        <div class="stat__label">已掌握</div>
        <div class="stat__value" style="color: var(--ok)">{{ stats?.knownTotal ?? 0 }}</div>
        <div class="stat__hint">掌握度 {{ learnedPercent }}%</div>
      </div>
      <div class="stat">
        <div class="stat__label">待复习 / 生词本</div>
        <div class="stat__value" style="color: var(--warn)">{{ stats?.dueTotal ?? 0 }}</div>
        <div class="stat__hint">生词本 {{ stats?.notebookTotal ?? 0 }} 词</div>
      </div>
    </div>

    <!-- 打卡日历 + 快捷入口 -->
    <div class="grid grid-2" style="margin-top: 16px">
      <div class="card" style="margin-top: 0">
        <div class="card__title">最近 30 天打卡</div>
        <div class="heatmap">
          <div
            v-for="d in recent"
            :key="d.date"
            class="heatmap__cell"
            :class="{ 'is-done': d.done, 'is-today': d.date === todayKey }"
            :title="`${d.date} 新学 ${d.learnCount} · 复习 ${d.reviewCount}`"
          />
        </div>
        <p class="tiny muted" style="margin: 10px 0 0">
          达标标准：当日新学 ≥ {{ stats?.dailyGoal ?? 20 }} 词即自动打卡。
        </p>
      </div>

      <div class="card" style="margin-top: 0">
        <div class="card__title">快捷入口</div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 10px">
          <button class="btn" @click="router.push('/translation')">句子翻译</button>
          <button class="btn" @click="router.push('/papers')">真题拆解</button>
          <button class="btn" @click="router.push('/errors')">错题本</button>
          <button class="btn" @click="ui.openAi()">AI 问答</button>
        </div>
        <div class="row small muted" style="margin-top: 14px; gap: 14px">
          <span>翻译 {{ stats?.translationCount ?? 0 }} 题 · 均分 {{ stats?.translationAvgScore ?? 0 }}</span>
          <span>真题 {{ stats?.paperCount ?? 0 }} 套 · 完成 {{ stats?.paperDoneCount ?? 0 }}/{{ stats?.paperTotalCount ?? 0 }} 题</span>
        </div>
      </div>
    </div>

    <!-- 四六级换算分：做完一套真题就能在这儿估个总分 -->
    <ScoreConverter />

    <!-- 模块进度 -->
    <div class="card">
      <div class="card__title">词汇掌握进度</div>
      <div class="progress" style="margin-bottom: 8px">
        <div class="progress__bar" :style="{ width: learnedPercent + '%' }" />
      </div>
      <div class="row small muted" style="gap: 18px">
        <span>已掌握 {{ stats?.knownTotal ?? 0 }}</span>
        <span>学习中 {{ (stats?.learnedTotal ?? 0) - (stats?.knownTotal ?? 0) }}</span>
        <span>未学 {{ (stats?.wordTotal ?? 0) - (stats?.learnedTotal ?? 0) }}</span>
        <span class="spacer" />
        <a class="btn btn--sm" href="#/study">进入词库 →</a>
      </div>
    </div>
  </div>
</template>
