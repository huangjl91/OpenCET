<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { paperApi } from '@/api'
import { SECTION_LABEL } from '@/utils/paperParser'
import { answerKey, hasKey, isChoice, isLetterOptions, optionLetter, optionStyle, stemText } from '@/utils/paperDisplay'
import { useUserStore } from '@/stores/user'
import type { PaperDetail, PaperQuestion, SectionType } from '@/types'

const route = useRoute()
const store = useUserStore()

const paper = ref<PaperDetail | null>(null)
const loading = ref(true)
const filter = ref<'all' | 'todo' | 'fav'>('all')
const showAnalysis = ref<Record<number, boolean>>({})

const paperId = computed(() => Number(route.params.id))

async function load() {
  loading.value = true
  try {
    paper.value = await paperApi.get(paperId.value)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const percent = computed(() => {
  const p = paper.value
  return p && p.totalCount ? Math.round((p.doneCount / p.totalCount) * 100) : 0
})

const visibleSections = computed(() => {
  if (!paper.value) return []
  return paper.value.sectionList
    .map((s) => ({
      ...s,
      questions: s.questions.filter((q) =>
        filter.value === 'todo' ? !q.done : filter.value === 'fav' ? q.favorite : true
      ),
    }))
    .filter((s) => s.questions.length > 0 || filter.value === 'all')
})

const draft = ref<Record<number, string>>({})

function draftOf(q: PaperQuestion): string {
  return draft.value[q.id] ?? q.userAnswer ?? ''
}

async function choose(q: PaperQuestion, letter: string) {
  draft.value[q.id] = letter
  const key = answerKey(q)
  await paperApi.updateQuestion(q.id, { userAnswer: letter, done: true })
  q.userAnswer = letter
  q.done = true
  recalc()
  // 有答案键且答对时自动展开解析；本卷没附答案就不判对错
  if (key && letter === key) showAnalysis.value[q.id] = true
}

/** 重做本题：清空作答，选项恢复可点（否则答过一次就永远锁死了） */
async function redo(q: PaperQuestion) {
  await paperApi.updateQuestion(q.id, { userAnswer: '', done: false })
  q.userAnswer = ''
  q.done = false
  delete draft.value[q.id]
  delete showAnalysis.value[q.id]
  recalc()
}

async function saveText(q: PaperQuestion) {
  await paperApi.updateQuestion(q.id, { userAnswer: draftOf(q), done: true })
  q.userAnswer = draftOf(q)
  q.done = true
  recalc()
}

async function toggleFav(q: PaperQuestion) {
  const next = !q.favorite
  await paperApi.updateQuestion(q.id, { favorite: next })
  q.favorite = next
}

async function toggleDone(q: PaperQuestion) {
  const next = !q.done
  await paperApi.updateQuestion(q.id, { done: next })
  q.done = next
  recalc()
}

function recalc() {
  if (!paper.value) return
  let done = 0
  let total = 0
  for (const s of paper.value.sectionList) {
    total += s.questions.length
    done += s.questions.filter((q) => q.done).length
  }
  paper.value.totalCount = total
  paper.value.doneCount = done
  store.refreshStats()
}

function sectionLabel(t: SectionType) {
  return SECTION_LABEL[t] ?? t
}

function sectionDone(s: { questions: PaperQuestion[] }) {
  return s.questions.filter((q) => q.done).length
}
</script>

<template>
  <div>
    <div v-if="loading" class="card empty">加载中…</div>

    <template v-else-if="paper">
      <div class="row" style="align-items: flex-start; margin-bottom: 14px">
        <div style="flex: 1; min-width: 0">
          <h1 class="page-title" style="font-size: 16px">{{ paper.title }}</h1>
          <div class="row tiny muted" style="gap: 6px">
            <span class="tag" :class="paper.level === 'CET6' ? 'tag--purple' : 'tag--brand'">{{ paper.level }}</span>
            <span v-if="paper.yearMonth">{{ paper.yearMonth }}</span>
            <span>{{ paper.source }}</span>
          </div>
        </div>
        <a class="btn btn--sm" href="#/papers">返回</a>
      </div>

      <div class="card">
        <div class="row small muted" style="margin-bottom: 8px">
          <span>完成 {{ paper.doneCount }} / {{ paper.totalCount }} 题</span>
          <span class="spacer" />
          <span style="font-weight: 700; color: var(--brand)">{{ percent }}%</span>
        </div>
        <div class="progress">
          <div class="progress__bar" :style="{ width: percent + '%' }" />
        </div>
        <div class="segmented" style="margin-top: 14px">
          <button class="segmented__item" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">全部</button>
          <button class="segmented__item" :class="{ 'is-active': filter === 'todo' }" @click="filter = 'todo'">未完成</button>
          <button class="segmented__item" :class="{ 'is-active': filter === 'fav' }" @click="filter = 'fav'">已收藏</button>
        </div>
      </div>

      <div v-for="s in visibleSections" :key="s.id" class="card">
        <div class="row" style="margin-bottom: 6px">
          <span class="tag tag--purple">{{ sectionLabel(s.type) }}</span>
          <span style="font-weight: 700">{{ s.title }}</span>
          <span class="spacer" />
          <span class="small muted">{{ sectionDone(s) }} / {{ s.questions.length }}</span>
        </div>

        <div
          v-if="s.passage"
          style="
            background: var(--bg-soft);
            border-radius: var(--radius-sm);
            padding: 11px 13px;
            margin: 9px 0 4px;
            line-height: 1.8;
            white-space: pre-wrap;
            font-size: 13px;
          "
        >
          {{ s.passage }}
        </div>

        <div v-for="q in s.questions" :key="q.id" style="border-top: 1px dashed var(--border); padding-top: 14px; margin-top: 14px">
          <div class="row" style="margin-bottom: 8px">
            <span class="tag tag--brand">第 {{ q.orderNo }} 题</span>
            <span v-if="q.done" class="tag tag--ok">已完成</span>
            <span v-if="q.favorite" class="tag tag--warn">已收藏</span>
            <span class="spacer" />
            <button class="btn btn--sm btn--ghost" @click="toggleFav(q)">{{ q.favorite ? '取消收藏' : '收藏' }}</button>
            <button class="btn btn--sm btn--ghost" @click="toggleDone(q)">{{ q.done ? '标记未完成' : '标记完成' }}</button>
          </div>

          <div style="line-height: 1.85; white-space: pre-wrap; margin-bottom: 10px">{{ stemText(q, s.type) }}</div>

          <!-- 客观题：只要有选项就当选择题渲染，不要求卷面附了答案 -->
          <template v-if="isChoice(q)">
            <!-- 段落匹配（长篇阅读）：选项是原文段落标号，排成一行字母片。
                 14 个整行按钮叠起来要占满一屏，完全没法用。 -->
            <div v-if="isLetterOptions(q.options)" class="letter-picker">
              <button
                v-for="opt in q.options"
                :key="opt"
                class="letter-picker__item"
                :style="optionStyle(q, opt)"
                :disabled="!!q.userAnswer"
                @click="choose(q, optionLetter(opt))"
              >
                {{ optionLetter(opt) }}
              </button>
            </div>

            <template v-else>
              <div v-for="(opt, oi) in q.options" :key="oi">
                <button
                  class="btn btn--block"
                  style="justify-content: flex-start; text-align: left; margin-bottom: 6px"
                  :style="optionStyle(q, opt)"
                  :disabled="!!q.userAnswer"
                  @click="choose(q, optionLetter(opt))"
                >
                  {{ opt }}
                </button>
              </div>
            </template>
            <div v-if="q.userAnswer" class="row small" style="margin-top: 8px">
              <template v-if="hasKey(q)">
                <span :class="q.userAnswer === answerKey(q) ? 'tag tag--ok' : 'tag tag--danger'">
                  {{ q.userAnswer === answerKey(q) ? '回答正确' : '回答错误' }}
                </span>
                <span class="muted">参考答案：{{ answerKey(q) }}</span>
              </template>
              <span v-else class="tag">已记录你的作答：{{ q.userAnswer }}（本卷未附答案）</span>
              <span class="spacer" />
              <button class="btn btn--sm btn--ghost" @click="redo(q)">重做本题</button>
            </div>
          </template>

          <!-- 主观题 -->
          <template v-else>
            <textarea v-model="draft[q.id]" class="textarea" style="min-height: 100px" placeholder="写下你的作答…" />
            <div class="row" style="margin-top: 8px">
              <button class="btn btn--primary btn--sm" @click="saveText(q)">保存作答</button>
            </div>
          </template>

          <div v-if="q.answer && (q.userAnswer || showAnalysis[q.id])" style="margin-top: 12px">
            <div class="row" style="margin-bottom: 6px">
              <span class="small" style="font-weight: 700">参考答案</span>
            </div>
            <div style="line-height: 1.85; white-space: pre-wrap; background: var(--bg-soft); padding: 12px 14px; border-radius: var(--radius-sm)">
              {{ q.answer }}
            </div>
          </div>

          <div v-if="q.analysis && (q.userAnswer || showAnalysis[q.id])" style="margin-top: 12px">
            <div class="small" style="font-weight: 700; margin-bottom: 6px">解析</div>
            <div class="small" style="line-height: 1.85; white-space: pre-wrap; color: var(--text-2)">
              {{ q.analysis }}
            </div>
          </div>

          <button
            v-if="!q.userAnswer && (q.answer || q.analysis)"
            class="btn btn--sm btn--ghost"
            style="margin-top: 8px"
            @click="showAnalysis[q.id] = !showAnalysis[q.id]"
          >
            {{ showAnalysis[q.id] ? '收起答案' : '查看答案与解析' }}
          </button>
        </div>
      </div>
    </template>

    <div v-else class="card empty">试卷不存在或已被删除</div>
  </div>
</template>
