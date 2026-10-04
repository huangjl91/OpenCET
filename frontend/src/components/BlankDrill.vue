<script setup lang="ts">
/**
 * 逐词填空练习（答案有几个词就画几条横线，一个词一格）。
 *
 * 作文方法的重点词/金句默写、翻译练习的分类常考词默写，用的都是这一套 ——
 * 抽成组件后两边的交互（空格跳格、回车提交、首字母提示、逐格判对错）天然一致。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { hintsOf, checkBlanks, blanksToRewrite, addMiss, type BlankItem, type BlankResult } from '@/utils/blankFill'
import { splitBold } from '@/utils/inlineMarkup'

const props = defineProps<{
  items: BlankItem[]
  /** 卡片标题 */
  title?: string
  /** 统计文案，如「110 题 · 一题一屏」 */
  caption?: string
  /** 标题右侧的操作按钮文案；不传就不显示 */
  restartText?: string
}>()

const emit = defineEmits<{
  restart: []
  /** 把「只练写错的」这组题交给父组件（父组件替换 items 即可，watch 会自动重开一轮） */
  practice: [items: BlankItem[]]
}>()

const at = ref(0)
const typed = ref<string[]>([])
const result = ref<BlankResult | null>(null)
const score = ref({ right: 0, total: 0 })
const hintOn = ref(false)
const cells = ref<HTMLInputElement[]>([])

/** 本轮写错的题（只记第一次作答，重写订正不计入） */
const missList = ref<BlankItem[]>([])
/** 当前这题是否处于「重写」状态 —— 重写是订正，不再计分 */
const retrying = ref(false)

const current = computed<BlankItem | null>(() => props.items[at.value] ?? null)
const done = computed(() => props.items.length > 0 && (at.value >= props.items.length || !current.value))
const hints = computed(() => (current.value ? hintsOf(current.value.answer) : []))

function reset() {
  at.value = 0
  typed.value = []
  result.value = null
  hintOn.value = false
  retrying.value = false
  score.value = { right: 0, total: 0 }
  missList.value = []
  cells.value = []
  focusCell(0)
}

// 题组变了（换分类 / 换一套题 / 只练写错的）就从头开始
watch(() => props.items, reset)
reset()

function setCell(el: unknown, i: number) {
  if (el) cells.value[i] = el as HTMLInputElement
}
function focusCell(i: number) {
  if (i < 0) return
  nextTick(() => cells.value[i]?.focus())
}
/** 横线数量 = 答案词数，所以每写一格就跳到下一格 */
function focusNext(i: number) {
  if (i < (current.value?.words.length ?? 0) - 1) focusCell(i + 1)
}

function submit() {
  const q = current.value
  if (!q || result.value) return
  const r = checkBlanks(typed.value, q.answer)
  result.value = r

  // 只有第一次作答计分并进错题集；重写订正不重复计分
  if (!retrying.value) {
    score.value.total += 1
    if (r.allOk) score.value.right += 1
    else missList.value = addMiss(missList.value, q)
  }
}

/**
 * 重写：只清掉写错的格子，写对的保留，重新作答。
 *
 * 这是「订正」而不是「重考」—— 所以不再计分，也不影响错题集。
 * 看过正确答案之后把错的词再手写一遍，本身就是有效的记忆动作。
 */
function rewrite() {
  const r = result.value
  if (!r || !current.value) return
  const { typed: next, firstBad } = blanksToRewrite(r.marks, typed.value)
  typed.value = next
  result.value = null
  retrying.value = true
  focusCell(firstBad)
}

function next() {
  typed.value = []
  result.value = null
  hintOn.value = false
  retrying.value = false
  at.value += 1
  focusCell(0)
}

function skip() {
  const q = current.value
  if (!q || result.value) return
  result.value = checkBlanks([], q.answer)
  if (!retrying.value) {
    score.value.total += 1
    missList.value = addMiss(missList.value, q)
  }
}

/** 只练这一轮写错的题 */
function practiceMissed() {
  if (missList.value.length) emit('practice', [...missList.value])
}

/** 每一格的样式：作答后按对错上色 */
function cellClass(i: number): string {
  const m = result.value?.marks[i]
  if (!m) return ''
  return m.level === 'exact' ? 'is-ok' : m.level === 'close' ? 'is-close' : 'is-bad'
}

defineExpose({ reset })
</script>

<template>
  <div class="card" style="margin-top: 0">
    <div class="row">
      <div class="card__title" style="margin: 0">{{ title ?? '看中文，逐词写出英文' }}</div>
      <span class="tag tag--brand">
        正确率 {{ score.total ? Math.round((score.right / score.total) * 100) : 0 }}%
      </span>
      <span class="tiny muted">{{ score.right }} / {{ score.total }}</span>
      <div class="spacer" />
      <span v-if="caption" class="tiny muted">{{ caption }}</span>
      <!-- 写错的随时能捞出来重练 -->
      <button v-if="missList.length" class="btn btn--sm btn--warn" @click="practiceMissed">
        重练写错的 {{ missList.length }} 题
      </button>
      <button v-if="restartText" class="btn btn--sm btn--ghost" @click="emit('restart')">{{ restartText }}</button>
    </div>

    <div v-if="!items.length" class="empty" style="padding: 24px 0">这里还没有可练的词</div>

    <div v-else-if="done" class="empty" style="padding: 24px 0">
      <p style="margin: 0 0 10px">
        这一套 {{ items.length }} 题写完了，正确率
        {{ Math.round((score.right / Math.max(1, score.total)) * 100) }}%。
      </p>
      <div class="row" style="justify-content: center">
        <button v-if="missList.length" class="btn btn--primary" @click="practiceMissed">
          重练写错的 {{ missList.length }} 题
        </button>
        <button v-if="restartText" class="btn" :class="missList.length ? '' : 'btn--primary'" @click="emit('restart')">
          再来一套
        </button>
      </div>
    </div>

    <template v-else-if="current">
      <div class="row tiny muted" style="margin: 12px 0 8px; gap: 8px">
        <span>第 {{ at + 1 }} / {{ items.length }} 题</span>
        <span v-if="current.group" class="tag">{{ current.group }}</span>
        <span>{{ current.words.length }} 个词 · {{ current.words.length }} 条横线</span>
        <span v-if="retrying" class="tag tag--warn">订正中 · 这题不计分</span>
      </div>

      <div class="bk">
        <div class="bk__prompt">{{ current.prompt }}</div>
        <div v-if="current.hint" class="bk__hint">
          <span class="bk__hint-label">提示</span>{{ current.hint }}
        </div>

        <!-- 一个词一条横线 -->
        <div class="bk__lines">
          <div v-for="(w, i) in current.words" :key="i" class="bk__cell" :class="cellClass(i)">
            <input
              :ref="(el) => setCell(el, i)"
              v-model="typed[i]"
              class="bk__input"
              :disabled="!!result"
              :placeholder="hintOn && !result ? hints[i] : ''"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              @keydown.space.prevent="focusNext(i)"
              @keydown.enter.prevent="submit()"
            />
            <span class="bk__no">{{ i + 1 }}</span>
            <span v-if="result && !result.marks[i]?.ok" class="bk__fix">{{ w }}</span>
          </div>
        </div>
      </div>

      <div v-if="!result" class="row" style="margin-top: 12px">
        <button class="btn btn--primary" :disabled="!typed.some((t) => (t ?? '').trim())" @click="submit">
          {{ retrying ? '再检查一次' : '检查' }}
        </button>
        <button class="btn btn--sm btn--ghost" :disabled="hintOn" @click="hintOn = true">首字母提示</button>
        <button v-if="!retrying" class="btn btn--sm btn--ghost" @click="skip">跳过看答案</button>
        <span class="tiny muted">空格跳到下一条横线，回车提交</span>
      </div>

      <div v-else class="bk__result">
        <div class="row" style="gap: 8px">
          <span class="tag" :class="result.allOk ? 'tag--ok' : 'tag--danger'">
            {{ result.allOk ? (retrying ? '订正完成' : '全对') : `${result.okCount} / ${result.total} 条正确` }}
          </span>
          <span v-if="result.issues.length" class="tiny muted">{{ result.issues.join('；') }}</span>
        </div>

        <div class="bk__answer">
          <span class="tiny muted">正确写法</span>
          <b>{{ current.answer }}</b>
        </div>
        <div v-if="current.note" class="tiny muted">
          <template v-for="(seg, si) in splitBold(current.note)" :key="si">
            <b v-if="seg.bold">{{ seg.text }}</b>
            <template v-else>{{ seg.text }}</template>
          </template>
        </div>
        <div class="row" style="margin-top: 10px">
          <button class="btn btn--primary btn--sm" @click="next">下一题</button>
          <!-- 写错就当场再写一遍：保留写对的格子，只清掉错的 -->
          <button v-if="!result.allOk" class="btn btn--sm btn--warn" @click="rewrite">重写错的格子</button>
          <button v-if="missList.length" class="btn btn--sm" @click="practiceMissed">
            重练写错的 {{ missList.length }} 题
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
