<script setup lang="ts">
import { computed, ref } from 'vue'
import ReadingPractice from '@/components/ReadingPractice.vue'
import { GUIDES, METHOD_CARDS, splitBold, splitMarks, type GuideDemo } from '@/utils/readingGuide'

/** 每张示范卡已展开到第几步（-1 表示还没开始） */
const revealed = ref<Record<string, number>>({})
/** 「自己练」的题：用户先选的答案 */
const picked = ref<Record<string, string>>({})

function stepOf(d: GuideDemo): number {
  return revealed.value[d.id] ?? -1
}
function started(d: GuideDemo): boolean {
  return stepOf(d) >= 0
}
function done(d: GuideDemo): boolean {
  return stepOf(d) >= d.steps.length - 1
}

function start(d: GuideDemo) {
  revealed.value = { ...revealed.value, [d.id]: 0 }
}
function next(d: GuideDemo) {
  const cur = stepOf(d)
  if (cur < d.steps.length - 1) revealed.value = { ...revealed.value, [d.id]: cur + 1 }
}
function reset(d: GuideDemo) {
  const r = { ...revealed.value }
  delete r[d.id]
  revealed.value = r
  const p = { ...picked.value }
  delete p[d.id]
  picked.value = p
}

function choose(d: GuideDemo, letter: string) {
  if (picked.value[d.id]) return
  picked.value = { ...picked.value, [d.id]: letter }
  next(d)
}

/** 已展开的步骤（含当前步） */
function visibleSteps(d: GuideDemo) {
  return d.steps.slice(0, stepOf(d) + 1)
}

const pieces = (body: string, marks?: string[]) => splitMarks(body, marks)

const totalSteps = computed(() => GUIDES.reduce((n, d) => n + d.steps.length, 0))
const doneSteps = computed(() => GUIDES.reduce((n, d) => n + Math.max(0, stepOf(d) + 1), 0))
</script>

<template>
  <div>
    <h1 class="page-title">阅读方法</h1>
    <p class="page-sub">
      四六级阅读就三种题：长篇阅读（段落匹配）、仔细阅读主旨题、仔细阅读细节题。下面用真实题目逐步示范怎么做，
      素材来自 2025.06 六级真题与内置示范卷。
    </p>

    <!-- 方法总览 -->
    <div class="grid grid-3">
      <div v-for="m in METHOD_CARDS" :key="m.kind" class="card" style="margin-top: 0">
        <div class="card__title">{{ m.title }}</div>
        <ul class="read-method">
          <li v-for="(p, i) in m.points" :key="i">
            <template v-for="(seg, si) in splitBold(p)" :key="si">
              <b v-if="seg.bold">{{ seg.text }}</b>
              <template v-else>{{ seg.text }}</template>
            </template>
          </li>
        </ul>
      </div>
    </div>

    <!-- 进度 -->
    <div class="row small muted" style="margin: 16px 0 10px; gap: 10px">
      <span>示范进度：{{ doneSteps }} / {{ totalSteps }} 步</span>
      <span class="spacer" />
      <button class="btn btn--sm btn--ghost" @click="revealed = {}; picked = {}">全部收起</button>
    </div>

    <!-- 示范 -->
    <div v-for="d in GUIDES" :key="d.id" class="card read-demo">
      <div class="row" style="align-items: flex-start">
        <span class="tag" :class="d.kind === 'long' ? 'tag--brand' : d.kind === 'main' ? 'tag--purple' : 'tag--ok'">
          {{ d.badge }}
        </span>
        <span class="tiny muted" style="flex: 1; min-width: 0">{{ d.source }}</span>
        <button v-if="started(d)" class="btn btn--sm btn--ghost" @click="reset(d)">重来</button>
      </div>

      <!-- 题干 -->
      <div class="read-q">
        <div class="read-q__label">题干</div>
        <div class="read-q__text">{{ d.question }}</div>
        <div v-if="d.options && d.options.length > 3" class="read-q__opts">
          <button
            v-for="o in d.options"
            :key="o"
            class="letter-picker__item"
            :disabled="d.practice ? !!picked[d.id] : true"
            :style="
              picked[d.id] && done(d)
                ? o === d.answer
                  ? 'border-color: var(--ok); background: var(--ok-soft); color: var(--ok)'
                  : picked[d.id] === o
                    ? 'border-color: var(--danger); background: var(--danger-soft); color: var(--danger)'
                    : ''
                : ''
            "
            @click="choose(d, o)"
          >
            {{ o }}
          </button>
        </div>
        <div v-else-if="d.options" class="read-q__opts" style="display: block">
          <div v-for="o in d.options" :key="o" class="read-opt">{{ o }}</div>
        </div>
      </div>

      <!-- 未开始 -->
      <div v-if="!started(d)" class="row" style="margin-top: 12px">
        <button class="btn btn--primary" @click="start(d)">
          {{ d.practice ? '开始做题' : '开始示范' }}
        </button>
        <span class="tiny muted">共 {{ d.steps.length }} 步</span>
      </div>

      <!-- 步骤 -->
      <template v-else>
        <div v-for="(s, i) in visibleSteps(d)" :key="i" class="read-step">
          <div class="read-step__title">{{ s.title }}</div>
          <div class="read-step__hint">
            <template v-for="(seg, si) in splitBold(s.hint)" :key="si">
              <b v-if="seg.bold">{{ seg.text }}</b>
              <template v-else>{{ seg.text }}</template>
            </template>
          </div>

          <div v-if="s.body" class="read-step__body">
            <template v-for="(p, pi) in pieces(s.body, s.marks)" :key="pi">
              <mark v-if="p.mark" class="read-mark">{{ p.text }}</mark>
              <span v-else>{{ p.text }}</span>
            </template>
          </div>

          <div v-if="s.chips?.length" class="read-chips">
            <div v-for="(c, ci) in s.chips" :key="ci" class="read-chip" :class="'read-chip--' + (c.kind ?? 'plain')">
              <span class="read-chip__label">{{ c.label }}</span>
              <span class="read-chip__value">{{ c.value }}</span>
            </div>
          </div>
        </div>

        <div class="row" style="margin-top: 12px">
          <button v-if="!done(d)" class="btn btn--primary" @click="next(d)">
            下一步（{{ stepOf(d) + 2 }} / {{ d.steps.length }}）
          </button>
          <span v-else class="tag tag--ok">示范完成 · 答案 {{ d.answer }}</span>
          <span v-if="done(d)" class="small muted" style="flex: 1; min-width: 200px">{{ d.answerText }}</span>
        </div>
      </template>
    </div>

    <!-- 用自己上传的真题练 -->
    <ReadingPractice />
  </div>
</template>
