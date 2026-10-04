<script setup lang="ts">
/**
 * 四六级换算分估算器。
 *
 * 放在首页的用途很直接：做完一套真题、拿到各部分的原始分
 * （听力/阅读 35 分制、写作/翻译 15 分制），填进去立刻知道离 425 还差多少。
 *
 * 换算必须**查表**而不是按比例算 —— 官方对照表是阶梯状的：
 * 35 分表里 19 与 18 都对应 154 分、10 与 9 都对应 126 分。
 */
import { computed, ref } from 'vue'
import {
  CET_SECTIONS,
  PASS_LINE,
  SCALE_NOTE,
  SCALE_TABLES,
  SCALE_TITLE,
  totalScore,
} from '@/utils/cetScale'

/** 四个部分的原始分；null 表示还没填 */
const raw = ref<Record<string, number | null>>({
  listening: null,
  reading: null,
  writing: null,
  translation: null,
})

const filledInput = computed(() => {
  const out: Record<string, number> = {}
  for (const s of CET_SECTIONS) {
    const v = raw.value[s.id]
    if (typeof v === 'number' && Number.isFinite(v)) out[s.id] = v
  }
  return out
})

const result = computed(() => totalScore(filledInput.value))
const complete = computed(() => result.value.filled === CET_SECTIONS.length)

/** 总分进度条宽度（按 710 算） */
const barWidth = computed(() => Math.min(100, (result.value.total / result.value.full) * 100))

function clamp(sectionId: string, max: number) {
  const v = raw.value[sectionId]
  if (v === null || v === undefined || !Number.isFinite(v)) return
  raw.value[sectionId] = Math.min(max, Math.max(0, Math.round(v)))
}

function clearAll() {
  for (const s of CET_SECTIONS) raw.value[s.id] = null
}

/** 填一组「刚好过线」的分数，方便看看各部分的底线在哪 */
function fillSample() {
  raw.value = { listening: 25, reading: 25, writing: 10, translation: 10 }
}

const showTable = ref(false)
</script>

<template>
  <div class="card">
    <div class="row" style="margin-bottom: 4px">
      <div class="card__title" style="margin: 0">{{ SCALE_TITLE }}</div>
      <span class="tiny muted">填各部分原始分，实时算 710 分制总分</span>
      <div class="spacer" />
      <button class="btn btn--sm btn--ghost" @click="showTable = !showTable">
        {{ showTable ? '收起换算表' : '查看换算表' }}
      </button>
    </div>

    <!-- 四个部分的原始分输入 -->
    <div class="scale__grid">
      <div v-for="s in CET_SECTIONS" :key="s.id" class="scale__cell">
        <label class="field__label">
          {{ s.name }}
          <span class="tiny muted">（0–{{ s.max }} 分）</span>
        </label>
        <div class="row" style="gap: 6px; align-items: center">
          <input
            v-model.number="raw[s.id]"
            class="input"
            type="number"
            :min="0"
            :max="s.max"
            step="1"
            :placeholder="String(s.max)"
            style="width: 92px"
            @change="clamp(s.id, s.max)"
          />
          <span class="tiny muted">→</span>
          <b class="scale__std">{{ result.parts.find((p) => p.id === s.id)?.score ?? 0 }}</b>
        </div>
        <div class="tiny muted" style="margin-top: 4px">{{ s.hint }}</div>
      </div>
    </div>

    <!-- 总分 -->
    <div class="scale__total">
      <div class="row" style="align-items: baseline; gap: 8px">
        <span class="tiny muted">710 分制总分</span>
        <b class="scale__total-num">{{ result.total }}</b>
        <span class="tiny muted">/ {{ result.full }}</span>
        <span class="tag" :class="result.passed ? 'tag--ok' : 'tag--warn'">
          {{ result.passed ? '已达 425 分线' : '距 425 还差 ' + result.gap + ' 分' }}
        </span>
        <div class="spacer" />
        <span v-if="!complete" class="tiny muted">已填 {{ result.filled }} / {{ CET_SECTIONS.length }} 项，未填的按 0 计</span>
        <button class="btn btn--sm btn--ghost" @click="fillSample">填组示例</button>
        <button class="btn btn--sm btn--ghost" @click="clearAll">清空</button>
      </div>
      <div class="scale__bar">
        <div class="scale__bar-fill" :class="{ 'is-pass': result.passed }" :style="{ width: barWidth + '%' }" />
        <div class="scale__bar-line" :style="{ left: (PASS_LINE / 710) * 100 + '%' }" title="425 分线" />
      </div>
      <div class="tiny muted" style="margin-top: 4px">
        425 分是普遍认可的过线分数，也是报考六级的常见门槛（官方不设及格线）。
      </div>
    </div>

    <!-- 完整换算表 -->
    <div v-if="showTable" class="scale__tables">
      <p class="tiny muted" style="margin: 0 0 8px">{{ SCALE_NOTE }}</p>
      <div v-for="t in SCALE_TABLES" :key="t.id" class="scale__table">
        <div class="row" style="margin-bottom: 6px">
          <b class="small">{{ t.name }}</b>
          <span class="tiny muted">{{ t.sections.join(' / ') }}；满分 {{ t.scaleMax }}</span>
        </div>
        <div class="scale__rows">
          <div v-for="r in t.rows" :key="t.id + '-' + r.raw" class="scale__row">
            <span class="scale__row-raw">{{ r.raw }}</span>
            <span class="scale__row-score">{{ r.score }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
