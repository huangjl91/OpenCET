<script setup lang="ts">
/**
 * 上传真题 → 切出阅读部分 → 作答 → AI 按方法批改。
 *
 * 真实四六级真题卷不带答案，所以判分交给 AI（提示词里写死了阅读方法，
 * 要求模型先判题型、再按该题型的步骤讲解）。卷面万一带了答案就先本地判一遍。
 */
import { computed, ref } from 'vue'
import { extractTextFromFile, formatSize } from '@/utils/fileExtract'
import { parsePaper, countQuestions } from '@/utils/paperParser'
import {
  hasLocalAnswers,
  judgeLocally,
  methodHintOf,
  splitReading,
  type JudgeResult,
  type ReadingPart,
} from '@/utils/readingPractice'
import { llmJudgeReading } from '@/utils/llmReading'
import { hasApiKey } from '@/utils/ai'

const parsing = ref(false)
const parseError = ref('')
const fileName = ref('')
const fileInfo = ref('')
const parts = ref<ReadingPart[]>([])

const activeIdx = ref(0)
const activePart = computed<ReadingPart | null>(() => parts.value[activeIdx.value] ?? null)

/** part.id → { 题号: 选项字母 } */
const answers = ref<Record<string, Record<number, string>>>({})
/** part.id → 批改结果 */
const results = ref<Record<string, JudgeResult[]>>({})

const judging = ref(false)
const judgeError = ref('')
/** 原文默认展开（做题要看），可以收起 */
const showPassage = ref(true)

function pick(partId: string, orderNo: number, letter: string) {
  const cur = answers.value[partId] ?? {}
  answers.value = { ...answers.value, [partId]: { ...cur, [orderNo]: cur[orderNo] === letter ? '' : letter } }
  // 改了答案就把这一部分的旧批改结果清掉，避免「答案变了结果没变」
  if (results.value[partId]) {
    const next = { ...results.value }
    delete next[partId]
    results.value = next
  }
}

const answeredCount = computed(() => {
  const p = activePart.value
  if (!p) return 0
  const a = answers.value[p.id] ?? {}
  return p.questions.filter((q) => (a[q.orderNo] ?? '').trim()).length
})

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  await loadFile(f)
  input.value = ''
}

async function loadFile(f: File) {
  parsing.value = true
  parseError.value = ''
  parts.value = []
  answers.value = {}
  results.value = {}
  judgeError.value = ''
  fileName.value = f.name
  fileInfo.value = formatSize(f.size)
  try {
    const { text } = await extractTextFromFile(f)
    if (!text.trim()) throw new Error('这个文件没抽出文字。若是扫描版 PDF（图片），需要带文字层的版本。')
    const paper = parsePaper(text, 'CET6')
    const found = splitReading(paper)
    if (!found.length) {
      throw new Error(
        `没切出阅读部分（整卷识别到 ${paper.sections.length} 个模块、${countQuestions(paper.sections)} 道题）。` +
          '请确认上传的是完整真题卷，且包含 Section B 长篇阅读 / Passage One 等标题。'
      )
    }
    parts.value = found
    activeIdx.value = 0
  } catch (err) {
    parseError.value = (err as Error).message
  } finally {
    parsing.value = false
  }
}

/** 拖拽上传 */
const dragging = ref(false)
function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) void loadFile(f)
}

async function runJudge() {
  const p = activePart.value
  if (!p) return
  judging.value = true
  judgeError.value = ''
  try {
    const a = answers.value[p.id] ?? {}
    const list = await llmJudgeReading(p, a)
    results.value = { ...results.value, [p.id]: list }
  } catch (e) {
    judgeError.value = (e as Error).message
  } finally {
    judging.value = false
  }
}

/** 卷面自带答案时，先本地判一遍（不花模型调用） */
function runLocalJudge() {
  const p = activePart.value
  if (!p) return
  const a = answers.value[p.id] ?? {}
  const items = judgeLocally(p, a)
  const list: JudgeResult[] = items.map((it) => ({
    orderNo: it.orderNo,
    questionType: p.kind === 'matching' ? '匹配题' : '细节题',
    correctAnswer: it.correctAnswer,
    userAnswer: it.userAnswer,
    isCorrect: it.isCorrect,
    steps: [],
    evidence: '',
    whyWrong: '',
    takeaway: '',
  }))
  results.value = { ...results.value, [p.id]: list }
}

const currentResults = computed(() => (activePart.value ? results.value[activePart.value.id] ?? [] : []))
function resultOf(orderNo: number): JudgeResult | undefined {
  return currentResults.value.find((r) => r.orderNo === orderNo)
}

const wrongCount = computed(() => currentResults.value.filter((r) => !r.isCorrect).length)
const rightCount = computed(() => currentResults.value.filter((r) => r.isCorrect).length)

/**
 * 标出这道题用的是哪套方法。
 *
 * 办法表放在 utils/readingPractice.ts 里（能单测），这里只做取值。
 */
function methodHint(type: string) {
  return methodHintOf(type)
}
</script>

<template>
  <div class="card">
    <div class="row" style="margin-bottom: 4px">
      <div class="card__title" style="margin: 0">上传真题练阅读</div>
      <span class="tiny muted">自动切出长篇阅读与仔细阅读，做完由 AI 按方法批改</span>
    </div>

    <!-- 上传区 -->
    <label
      class="rp__drop"
      :class="{ 'is-drag': dragging, 'is-busy': parsing }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown,.json"
        style="display: none"
        :disabled="parsing"
        @change="onFile"
      />
      <template v-if="parsing">
        <b>正在抽取文字并切分…</b>
        <span class="tiny muted">{{ fileName }} · {{ fileInfo }}</span>
      </template>
      <template v-else>
        <b>点这里选择真题文件，或把文件拖进来</b>
        <span class="tiny muted">支持 PDF / DOCX / TXT。扫描版（图片型）PDF 抽不出文字，请用可复制版。</span>
        <span v-if="fileName && !parseError" class="tiny muted">上次：{{ fileName }} · {{ fileInfo }}</span>
      </template>
    </label>

    <p v-if="parseError" class="small" style="color: var(--danger); margin: 10px 0 0; line-height: 1.8">
      {{ parseError }}
    </p>

    <!-- 切分结果 -->
    <template v-if="parts.length">
      <div class="row" style="margin: 14px 0 10px; gap: 8px">
        <span class="tiny muted">已切出阅读部分</span>
        <div class="segmented">
          <button
            v-for="(p, i) in parts"
            :key="p.id"
            class="segmented__item"
            :class="{ 'is-active': i === activeIdx }"
            @click="activeIdx = i"
          >
            {{ p.title }}（{{ p.questions.length }}）
          </button>
        </div>
        <div class="spacer" />
        <span class="tag" :class="activePart?.kind === 'matching' ? 'tag--purple' : 'tag--brand'">
          {{ activePart?.kind === 'matching' ? '段落匹配' : '仔细阅读' }}
        </span>
      </div>

      <template v-if="activePart">
        <!-- 原文 -->
        <div class="rp__passage">
          <div class="row" style="margin-bottom: 8px">
            <b class="small">原文</b>
            <span class="tiny muted">{{ activePart.passage.split(/\s+/).length }} 词</span>
            <div class="spacer" />
            <button class="btn btn--sm btn--ghost" @click="showPassage = !showPassage">
              {{ showPassage ? '收起原文' : '显示原文' }}
            </button>
          </div>
          <div v-if="showPassage" class="rp__passage-body">{{ activePart.passage }}</div>
        </div>

        <!-- 题目 -->
        <div v-for="q in activePart.questions" :key="q.orderNo" class="rp__q">
          <div class="row" style="align-items: flex-start; gap: 8px">
            <span class="rp__no">{{ q.orderNo }}</span>
            <div style="flex: 1; min-width: 0">
              <div class="rp__stem">{{ q.stem }}</div>
            </div>
            <span v-if="resultOf(q.orderNo)" class="tag" :class="resultOf(q.orderNo)!.isCorrect ? 'tag--ok' : 'tag--danger'">
              {{ resultOf(q.orderNo)!.isCorrect ? '正确' : '错误' }}
            </span>
          </div>

          <!-- 段落匹配：选段落字母 -->
          <div v-if="activePart.kind === 'matching'" class="letter-picker" style="margin-top: 8px">
            <button
              v-for="L in activePart.labels"
              :key="L"
              class="letter-picker__item"
              :class="{
                'is-picked': (answers[activePart.id] ?? {})[q.orderNo] === L,
                'is-right': resultOf(q.orderNo)?.correctAnswer === L,
              }"
              @click="pick(activePart.id, q.orderNo, L)"
            >
              {{ L }}
            </button>
          </div>

          <!-- 仔细阅读：A/B/C/D 选项可点 -->
          <div v-else class="rp__opts" style="margin-top: 8px">
            <button
              v-for="opt in q.options"
              :key="opt"
              class="rp__opt"
              :class="{
                'is-picked': (answers[activePart.id] ?? {})[q.orderNo] === opt.trim().charAt(0).toUpperCase(),
                'is-right': resultOf(q.orderNo)?.correctAnswer === opt.trim().charAt(0).toUpperCase(),
              }"
              @click="pick(activePart.id, q.orderNo, opt.trim().charAt(0).toUpperCase())"
            >
              {{ opt }}
            </button>
          </div>

          <!-- AI 讲解 -->
          <div v-if="resultOf(q.orderNo)?.steps.length" class="rp__explain">
            <div class="rp__explain-head">
              <span class="tag tag--purple">{{ resultOf(q.orderNo)!.questionType }}</span>
              <span class="tiny muted">{{ methodHint(resultOf(q.orderNo)!.questionType) }}</span>
              <span class="tiny muted">
                你选 {{ resultOf(q.orderNo)!.userAnswer || '—' }} · 正确答案 {{ resultOf(q.orderNo)!.correctAnswer || '—' }}
              </span>
            </div>
            <div v-for="(s, si) in resultOf(q.orderNo)!.steps" :key="si" class="read-step">
              <div class="read-step__title">{{ si + 1 }}. {{ s.name }}</div>
              <div class="read-step__hint">{{ s.detail }}</div>
            </div>
            <div v-if="resultOf(q.orderNo)!.evidence" class="rp__evidence">
              <span class="tiny muted">原文证据</span>
              <p>{{ resultOf(q.orderNo)!.evidence }}</p>
            </div>
            <p v-if="resultOf(q.orderNo)!.whyWrong" class="small rp__why">
              <b>你错在哪：</b>{{ resultOf(q.orderNo)!.whyWrong }}
            </p>
            <p v-if="resultOf(q.orderNo)!.takeaway" class="small muted rp__take">
              <b>记住：</b>{{ resultOf(q.orderNo)!.takeaway }}
            </p>
          </div>
        </div>

        <!-- 提交 -->
        <div class="row" style="margin-top: 14px; gap: 8px">
          <button
            class="btn btn--primary"
            :disabled="judging || answeredCount === 0 || !hasApiKey()"
            @click="runJudge"
          >
            {{ judging ? 'AI 批改中…' : '提交，让 AI 按方法批改' }}
          </button>
          <button v-if="hasLocalAnswers(activePart)" class="btn btn--sm" @click="runLocalJudge">用卷面答案先判</button>
          <span class="tiny muted">已作答 {{ answeredCount }} / {{ activePart.questions.length }}</span>
          <div class="spacer" />
          <span v-if="!hasApiKey()" class="tiny" style="color: var(--warn)">
            需要先在顶栏「AI 问答」→「模型设置」配好 Key
          </span>
        </div>

        <p v-if="judgeError" class="small" style="color: var(--danger); margin: 8px 0 0">{{ judgeError }}</p>

        <div v-if="currentResults.length" class="row" style="margin-top: 10px; gap: 8px">
          <span class="tag tag--ok">答对 {{ rightCount }}</span>
          <span class="tag" :class="wrongCount ? 'tag--danger' : 'tag--ok'">答错 {{ wrongCount }}</span>
          <span class="tiny muted">错题的讲解按阅读方法逐步给出，照着走一遍再回头重做</span>
        </div>
      </template>
    </template>
  </div>
</template>
