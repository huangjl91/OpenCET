<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import BlankDrill from '@/components/BlankDrill.vue'
import { translationApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { getAiConfig, hasApiKey } from '@/utils/ai'
import { freeTranslate, type TranslateDirection } from '@/utils/freeTranslate'
import { vAutogrow } from '@/utils/autogrow'
import { blendScore, llmReview, WEIGHT_LLM, WEIGHT_MACHINE } from '@/utils/llmGrade'
import { getCachedExplain, llmExplainCached } from '@/utils/llmExplain'
import { buildCategoryBlanks, groupByCategory, vocabCategoryGroup } from '@/utils/translationCategories'
import type { BlankItem } from '@/utils/blankFill'
import type { Level, LlmExplain, LlmReview, TranslationQuestion, TranslationResult, VocabWord } from '@/types'

const store = useUserStore()
const { level } = storeToRefs(store)

const questions = ref<TranslationQuestion[]>([])
const currentId = ref<string>('')
const typeFilter = ref<'all' | 'sentence' | 'paragraph'>('all')
const difficultyFilter = ref<0 | 1 | 2 | 3>(0)
const answer = ref('')
const submitting = ref(false)
const result = ref<TranslationResult | null>(null)
const showReference = ref(false)
const loading = ref(true)

/* ---------------- AI 二次润色评分 ---------------- */
const aiLoading = ref(false)
const aiError = ref('')
const llm = ref<LlmReview | null>(null)
const aiModel = ref('')
const finalScore = ref<number | null>(null)
const showPolish = ref(false)
const copied = ref(false)
const compiled = computed(() => !!(result.value && llm.value && finalScore.value != null))

/* ---------------- AI 讲解（重难点词汇 + 句子结构拆解） ---------------- */
const explain = ref<LlmExplain | null>(null)
const explainLoading = ref(false)
const explainError = ref('')
const explainModel = ref('')

/** 生成讲解；同一题生成过就直接读本地缓存，不再花 token */
async function runExplain() {
  if (!current.value || !hasApiKey()) return
  explainLoading.value = true
  explainError.value = ''
  try {
    explain.value = await llmExplainCached(current.value)
    explainModel.value = getAiConfig().model
  } catch (e) {
    explainError.value = (e as Error).message
  } finally {
    explainLoading.value = false
  }
}

const current = computed(() => questions.value.find((q) => q.id === currentId.value) ?? null)

/* ---------------- 分类：常考词 → 逐词默写 → 句子翻译 ---------------- */
const categoryFilter = ref<string>('')
/** 《翻译常用词汇》笔记整理出的词表（只有词，没有配套句子题） */
const vocabWords = ref<VocabWord[]>([])

/**
 * 按分类归组：题库分类 + 常用词汇分类。
 *
 * 词表类不放进 questions 里 —— 它跟着等级过滤会被切掉，
 * 而这份笔记里四级六级的内容都有，应该一直在。
 */
const groups = computed(() => {
  const fromQuestions = groupByCategory(questions.value)
  const vocab = vocabCategoryGroup(vocabWords.value)
  return vocab.words.length ? [...fromQuestions, vocab] : fromQuestions
})
const activeGroup = computed(() => groups.value.find((g) => g.name === categoryFilter.value) ?? null)
const categoryBlanks = ref<BlankItem[]>([])

/** 这一分类是不是纯词表（没有句子题） */
const isVocabOnly = computed(() => !!activeGroup.value && activeGroup.value.questions.length === 0)

/** 分类 chip 上的数字：有题显示题数，纯词表显示词数 */
function groupCount(g: { questions: unknown[]; words: unknown[] }) {
  return g.questions.length || g.words.length
}

watch(
  activeGroup,
  (g) => {
    categoryBlanks.value = g ? buildCategoryBlanks(g, 1) : []
  },
  { immediate: true }
)

function restartCategoryBlanks() {
  if (activeGroup.value) categoryBlanks.value = buildCategoryBlanks(activeGroup.value, Date.now() % 100000)
}

/** 只练写错的：组件的 items 一换就自动重开一轮 */
function practiceCategorySubset(items: BlankItem[]) {
  categoryBlanks.value = items
}

/** 切分类时，如果当前题目不属于新分类，自动跳到该分类的第一题 */
function pickCategory(name: string) {
  categoryFilter.value = name
  const list = name ? questions.value.filter((q) => (q.category ?? '') === name) : questions.value
  if (!list.find((q) => q.id === currentId.value)) {
    currentId.value = list[0]?.id ?? ''
    reset()
  }
}

const filtered = computed(() =>
  questions.value.filter(
    (q) =>
      (!categoryFilter.value || (q.category ?? '') === categoryFilter.value) &&
      (typeFilter.value === 'all' || q.type === typeFilter.value) &&
      (difficultyFilter.value === 0 || q.difficulty === difficultyFilter.value)
  )
)

async function load() {
  loading.value = true
  try {
    questions.value = await translationApi.list(level.value)
    if (!questions.value.find((q) => q.id === currentId.value)) {
      currentId.value = questions.value[0]?.id ?? ''
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 《翻译常用词汇》是附加内容，加载失败不该让整个翻译页用不了 */
onMounted(async () => {
  try {
    vocabWords.value = await translationApi.vocab()
  } catch {
    vocabWords.value = []
  }
})

async function switchLevel(l: Level) {
  await store.setLevel(l)
  reset()
  await load()
}

function reset() {
  answer.value = ''
  result.value = null
  showReference.value = false
  resetAi()
}

function resetAi() {
  aiLoading.value = false
  aiError.value = ''
  llm.value = null
  finalScore.value = null
  showPolish.value = false
  explain.value = null
  explainError.value = ''
  explainLoading.value = false
}

function pick(id: string) {
  currentId.value = id
  reset()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  if (!current.value || !answer.value.trim()) return
  submitting.value = true
  resetAi()
  try {
    result.value = await translationApi.submit(current.value.id, answer.value)
    showReference.value = true
    // 这道题之前生成过 AI 讲解的话，直接显示，不用再点一次
    explain.value = getCachedExplain(current.value.id)
    await store.refreshStats()
  } finally {
    submitting.value = false
  }
}

/** AI 精批：浏览器直连模型做语义/语法二次评分 + 润色，再把结论回填后端 */
async function runAiReview() {
  if (!current.value || !result.value) return
  if (!hasApiKey()) return
  aiLoading.value = true
  aiError.value = ''
  try {
    const r = await llmReview(
      current.value,
      result.value.answer,
      result.value.score,
      result.value.missWords ?? []
    )
    llm.value = r
    aiModel.value = getAiConfig().model
    finalScore.value = blendScore(result.value.score, r.score)
    showPolish.value = !!r.polish

    // 回填持久化，并按综合分复判错题本
    try {
      const saved = await translationApi.review({
        questionId: current.value.id,
        answer: result.value.answer,
        llmScore: r.score,
        finalScore: finalScore.value,
        llmComment: r.comment,
        polish: r.polish,
        llmIssues: r.issues,
        llmModel: aiModel.value,
      })
      result.value.wrong = saved.wrong
      await store.refreshStats()
    } catch (e) {
      // 持久化失败不影响展示，提示用户即可
      aiError.value = 'AI 结果已生成，但保存失败：' + (e as Error).message
    }
  } catch (e) {
    aiError.value = (e as Error).message
  } finally {
    aiLoading.value = false
  }
}

async function copyPolish() {
  if (!llm.value?.polish) return
  try {
    await navigator.clipboard.writeText(llm.value.polish)
    aiError.value = ''
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    aiError.value = '复制失败，请手动选中复制'
  }
}

/* ---------------- 右侧栏：实时翻译工具 ---------------- */
/** 翻译方向：中译英 / 英译中 */
const transDirection = ref<TranslateDirection>('zh2en')
const transInput = ref('')
const transOutput = ref('')
const transLoading = ref(false)
const transError = ref('')
const transAuto = ref(true)
const transCopied = ref(false)

let transTimer: ReturnType<typeof setTimeout> | null = null
/** 请求序号：文本改动后旧请求的流式增量要丢弃，否则会把新译文覆盖掉 */
let transSeq = 0

/** 停止输入 800ms 后自动翻译（真·逐键调用会把 API 打爆，也读不过来） */
function scheduleTranslate() {
  if (transTimer) {
    clearTimeout(transTimer)
    transTimer = null
  }
  if (!transAuto.value) return
  if (transInput.value.trim().length < 2) {
    transSeq++
    transOutput.value = ''
    transError.value = ''
    transLoading.value = false
    return
  }
  transTimer = setTimeout(() => void runTranslate(), 800)
}

async function runTranslate() {
  const text = transInput.value.trim()
  if (!text) return
  if (transTimer) {
    clearTimeout(transTimer)
    transTimer = null
  }
  const my = ++transSeq
  transLoading.value = true
  transError.value = ''
  transOutput.value = ''
  try {
    const r = await freeTranslate(text, transDirection.value)
    if (my === transSeq) transOutput.value = r
  } catch (e) {
    if (my === transSeq) transError.value = (e as Error).message
  } finally {
    if (my === transSeq) transLoading.value = false
  }
}

function clearTrans() {
  if (transTimer) clearTimeout(transTimer)
  transTimer = null
  transSeq++ // 让在途请求的增量失效
  transInput.value = ''
  transOutput.value = ''
  transError.value = ''
  transLoading.value = false
}

/** 把当前题目的题干带进来翻（中→英），出译文后可以直接填进答题框 */
function useCurrentPrompt() {
  if (!current.value) return
  transDirection.value = 'zh2en'
  transInput.value = current.value.prompt
  void runTranslate()
}

/** 中英互换：像百度翻译的「交换」按钮，内容和方向一起换 */
function swapTrans() {
  transDirection.value = transDirection.value === 'zh2en' ? 'en2zh' : 'zh2en'
  const prevIn = transInput.value
  transInput.value = transOutput.value
  transOutput.value = prevIn
  transError.value = ''
  if (transInput.value.trim()) void runTranslate()
}

/** 把译文填进答题框，省得手抄 */
function fillAnswer() {
  if (!transOutput.value.trim() || result.value) return
  answer.value = transOutput.value.trim()
}

async function copyTrans() {
  if (!transOutput.value.trim()) return
  try {
    await navigator.clipboard.writeText(transOutput.value)
    transCopied.value = true
    setTimeout(() => (transCopied.value = false), 1600)
  } catch {
    transError.value = '复制失败，请手动选中复制'
  }
}

function difficultyLabel(d: number) {
  return d === 1 ? '基础' : d === 2 ? '进阶' : '挑战'
}

function scoreColor(s: number) {
  return s >= 85 ? 'var(--ok)' : s >= 70 ? 'var(--brand)' : s >= 50 ? 'var(--warn)' : 'var(--danger)'
}
</script>

<template>
  <div>
    <h1 class="page-title">句子翻译练习</h1>
    <p class="page-sub">题目取自历年四六级真题话题；提交后展示参考答案、核心词汇与语法点解析，错题自动收录</p>

    <div class="row" style="margin-bottom: 14px">
      <div class="segmented">
        <button class="segmented__item" :class="{ 'is-active': level === 'CET4' }" @click="switchLevel('CET4')">
          四级
        </button>
        <button class="segmented__item" :class="{ 'is-active': level === 'CET6' }" @click="switchLevel('CET6')">
          六级
        </button>
      </div>
      <div class="segmented">
        <button class="segmented__item" :class="{ 'is-active': typeFilter === 'all' }" @click="typeFilter = 'all'">
          全部
        </button>
        <button
          class="segmented__item"
          :class="{ 'is-active': typeFilter === 'sentence' }"
          @click="typeFilter = 'sentence'"
        >
          单句
        </button>
        <button
          class="segmented__item"
          :class="{ 'is-active': typeFilter === 'paragraph' }"
          @click="typeFilter = 'paragraph'"
        >
          段落
        </button>
      </div>
      <div class="segmented">
        <button class="segmented__item" :class="{ 'is-active': difficultyFilter === 0 }" @click="difficultyFilter = 0">
          全部难度
        </button>
        <button class="segmented__item" :class="{ 'is-active': difficultyFilter === 1 }" @click="difficultyFilter = 1">
          基础
        </button>
        <button class="segmented__item" :class="{ 'is-active': difficultyFilter === 2 }" @click="difficultyFilter = 2">
          进阶
        </button>
        <button class="segmented__item" :class="{ 'is-active': difficultyFilter === 3 }" @click="difficultyFilter = 3">
          挑战
        </button>
      </div>
    </div>

    <!-- 分类：先选分类 → 背常考词 → 默写 → 再往下做句子翻译 -->
    <div class="row" style="margin-bottom: 14px; gap: 8px; align-items: flex-start">
      <span class="tiny muted" style="line-height: 2">分类</span>
      <div class="segmented" style="flex-wrap: wrap; flex: 1">
        <button class="segmented__item" :class="{ 'is-active': !categoryFilter }" @click="pickCategory('')">
          全部（{{ questions.length }}）
        </button>
        <button
          v-for="g in groups"
          :key="g.name"
          class="segmented__item"
          :class="{ 'is-active': categoryFilter === g.name }"
          @click="pickCategory(g.name)"
        >
          {{ g.name }}（{{ groupCount(g) }}）
        </button>
      </div>
    </div>

    <!-- 本分类的常考词 + 逐词默写 -->
    <template v-if="activeGroup">
      <div class="card" style="margin-top: 0">
        <div class="row" style="margin-bottom: 10px">
          <div class="card__title" style="margin: 0">{{ activeGroup.name }} · 常考词</div>
          <span class="tiny muted">
            <template v-if="isVocabOnly">
              {{ activeGroup.words.length }} 个词，来自《翻译常用词汇》笔记
            </template>
            <template v-else>
              {{ activeGroup.words.length }} 个词，来自本分类 {{ activeGroup.questions.length }} 道题的核心词
            </template>
          </span>
          <div class="spacer" />
          <span class="tiny muted">先背词，再往下默写</span>
        </div>
        <div class="wtable">
          <div v-for="w in activeGroup.words" :key="w.en + '|' + w.zh" class="wtable__row">
            <div class="wtable__zh">{{ w.zh || '—' }}</div>
            <div class="wtable__en">{{ w.en }}</div>
            <div class="wtable__note tiny muted">{{ w.note || (w.count > 1 ? w.count + ' 道题考到' : '') }}</div>
          </div>
        </div>
      </div>

      <BlankDrill
        :items="categoryBlanks"
        title="背完就默写：看中文，逐词写出英文"
        :caption="activeGroup.name + ' · ' + categoryBlanks.length + ' 词'"
        restart-text="换一套题"
        @restart="restartCategoryBlanks"
        @practice="practiceCategorySubset"
      />

      <!-- 纯词表分类没有句子题，说明一下，而不是给个空题库 -->
      <p v-if="isVocabOnly" class="tiny muted" style="margin: 14px 0 8px">
        《翻译常用词汇》只有词条，没有配套句子题 —— 句子翻译请在上面的分类里选一个主题。
      </p>
      <p v-else class="tiny muted" style="margin: 14px 0 8px">词背完了，下面是「{{ activeGroup.name }}」的句子翻译 ▼</p>
    </template>

    <!-- 纯词表分类没有题目，不显示题库区 -->
    <div v-if="!isVocabOnly" class="translate-layout">
      <!-- 题目列表 -->
      <div class="card" style="margin-top: 0">
        <div class="card__title">题库（{{ filtered.length }}）</div>
        <div v-if="loading" class="empty small">加载中…</div>
        <div v-else style="max-height: 620px; overflow-y: auto">
          <div
            v-for="q in filtered"
            :key="q.id"
            class="list-item"
            style="cursor: pointer"
            :style="q.id === currentId ? 'background: var(--brand-soft); border-radius: 8px; padding-left: 8px; padding-right: 8px' : ''"
            @click="pick(q.id)"
          >
            <div style="flex: 1; min-width: 0">
              <div class="small" style="font-weight: 600">
                {{ q.prompt.slice(0, 26) }}{{ q.prompt.length > 26 ? '…' : '' }}
              </div>
              <div class="row tiny muted" style="gap: 6px; margin-top: 3px">
                <span class="tag">{{ q.type === 'sentence' ? '单句' : '段落' }}</span>
                <span class="tag" :class="q.difficulty === 3 ? 'tag--danger' : q.difficulty === 2 ? 'tag--warn' : 'tag--ok'">
                  {{ difficultyLabel(q.difficulty) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 答题区 -->
      <div class="card" style="margin-top: 0">
        <template v-if="current">
          <div class="row" style="margin-bottom: 12px">
            <span class="tag">{{ current.source }}</span>
            <span class="tag">{{ current.type === 'sentence' ? '单句翻译' : '段落翻译' }}</span>
            <span class="tag" :class="current.difficulty === 3 ? 'tag--danger' : current.difficulty === 2 ? 'tag--warn' : 'tag--ok'">
              {{ difficultyLabel(current.difficulty) }}
            </span>
          </div>

          <div
            style="
              background: var(--bg-soft);
              border-radius: var(--radius-sm);
              padding: 14px 16px;
              margin-bottom: 16px;
              line-height: 1.9;
            "
          >
            {{ current.prompt }}
          </div>

          <div class="field">
            <label class="field__label">你的译文（汉译英）</label>
            <textarea
              v-model="answer"
              class="textarea"
              placeholder="Translate the passage into English…"
              :disabled="!!result"
            />
          </div>

          <div class="row">
            <button class="btn btn--primary" :disabled="!answer.trim() || submitting" @click="submit">
              {{ submitting ? '批改中…' : '提交并批改' }}
            </button>
            <button v-if="result" class="btn" @click="reset">重做本题</button>
            <div class="spacer" />
            <span v-if="current.tips" class="tiny muted">{{ current.tips }}</span>
          </div>

          <!-- 批改结果 -->
          <template v-if="result">
            <div
              style="
                margin-top: 14px;
                padding: 13px;
                border-radius: var(--radius);
                background: var(--bg-soft);
              "
            >
              <div class="row">
                <div>
                  <div class="tiny muted">{{ compiled ? '机器分' : '本次得分' }}</div>
                  <div style="font-size: 26px; font-weight: 800; line-height: 1.1" :style="{ color: scoreColor(result.score) }">
                    {{ result.score }}
                  </div>
                </div>
                <div v-if="finalScore != null" style="padding-left: 14px; border-left: 1px dashed var(--border)">
                  <div class="tiny muted">综合分</div>
                  <div
                    style="font-size: 26px; font-weight: 800; line-height: 1.1"
                    :style="{ color: scoreColor(finalScore) }"
                  >
                    {{ finalScore }}
                  </div>
                </div>
                <div style="flex: 1; min-width: 200px">
                  <div class="small">{{ result.comment }}</div>
                  <div class="row tiny" style="gap: 6px; margin-top: 6px">
                    <span v-for="w in result.hitWords" :key="w" class="tag tag--ok">命中 {{ w }}</span>
                    <span v-for="w in result.reorderWords ?? []" :key="w" class="tag tag--warn">
                      语序存疑 {{ w }}
                    </span>
                    <span v-for="n in result.nearWords ?? []" :key="n.expected" class="tag tag--warn">
                      拼写近似 {{ n.found }} → {{ n.expected }}
                    </span>
                    <span v-for="w in result.missWords" :key="w" class="tag tag--danger">未命中 {{ w }}</span>
                  </div>
                </div>
                <span v-if="result.wrong" class="tag tag--danger">已收入错题本</span>
                <span v-else class="tag tag--ok">已达线</span>
              </div>

              <!-- 评分构成明细 -->
              <div v-if="result.breakdown" class="row tiny muted" style="gap: 14px; margin-top: 12px; flex-wrap: wrap">
                <span>
                  核心词 <b>{{ result.breakdown.coreScore }}</b
                  >/55（覆盖 {{ Math.round(result.breakdown.coreRate * 100) }}%）
                </span>
                <span>
                  篇幅 <b>{{ result.breakdown.lengthScore }}</b
                  >/30（贴合 {{ Math.round(result.breakdown.lengthFit * 100) }}%）
                </span>
                <span>
                  语言规范 <b>{{ result.breakdown.languageScore }}</b>/15
                </span>
                <span v-if="result.breakdown.redundancy > 0.2">
                  冗余度 {{ Math.round(result.breakdown.redundancy * 100) }}%
                </span>
              </div>

              <!-- 语言规范 / 拼写提示 -->
              <div
                v-if="
                  (result.breakdown?.languageIssues?.length ?? 0) > 0 ||
                  (result.breakdown?.spellingIssues?.length ?? 0) > 0 ||
                  (result.breakdown?.repeatedWords?.length ?? 0) > 0
                "
                style="margin-top: 10px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg)"
              >
                <div class="tiny muted" style="margin-bottom: 6px">规范性检查（本地启发式）</div>
                <ul class="tiny" style="margin: 0; padding-left: 18px; line-height: 1.9">
                  <li v-for="(s, i) in result.breakdown?.spellingIssues ?? []" :key="'sp' + i" style="color: var(--warn)">
                    {{ s }}
                  </li>
                  <li v-for="(s, i) in result.breakdown?.languageIssues ?? []" :key="'lg' + i">{{ s }}</li>
                  <li v-if="(result.breakdown?.repeatedWords?.length ?? 0) > 0">
                    高频重复词：{{ result.breakdown?.repeatedWords?.join('、') }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- ============ AI 二次润色评分 ============ -->
            <div
              style="
                margin-top: 13px;
                padding: 13px;
                border-radius: var(--radius);
                border: 1px solid var(--border);
              "
            >
              <div class="row">
                <div class="card__title" style="margin: 0">AI 二次润色评分</div>
                <div class="spacer" />
                <button v-if="!llm" class="btn btn--primary" :disabled="aiLoading || !hasApiKey()" @click="runAiReview">
                  {{ aiLoading ? 'AI 精批中…（约 5-15 秒）' : '开始 AI 精批' }}
                </button>
                <button v-else class="btn" @click="runAiReview">重新精批</button>
              </div>

              <p v-if="!hasApiKey()" class="tiny muted" style="margin: 10px 0 0">
                尚未配置模型 API Key。请在顶栏右侧的「AI 问答」抽屉里点「模型设置」填写（OpenAI 兼容端点，Key 只存本机浏览器，
                不经过本站后端），返回本页即可使用 AI 精批。
              </p>
              <p v-else-if="!llm && !aiLoading" class="tiny muted" style="margin: 10px 0 0">
                在机器分之上，由大模型独立判断<b>语义完整性、语法正确性、用词地道度</b>并给出润色译文。
                综合分 = 机器分 ×{{ WEIGHT_MACHINE }} + 语义分 ×{{ WEIGHT_LLM }}。当前模型：{{ getAiConfig().model }}
              </p>

              <p v-if="aiError" class="small" style="color: var(--danger); margin: 10px 0 0">{{ aiError }}</p>

              <template v-if="llm">
                <div class="row" style="margin-top: 12px; align-items: flex-start">
                  <div>
                    <div class="tiny muted">AI 语义分</div>
                    <div style="font-size: 24px; font-weight: 800; line-height: 1.1" :style="{ color: scoreColor(llm.score) }">
                      {{ llm.score }}
                    </div>
                  </div>
                  <div style="flex: 1; min-width: 220px">
                    <div class="small">{{ llm.comment || '（模型未给点评）' }}</div>
                    <div class="tiny muted" style="margin-top: 6px">
                      综合分 {{ finalScore }} = 机器分 {{ result.score }} × {{ WEIGHT_MACHINE }} + 语义分
                      {{ llm.score }} × {{ WEIGHT_LLM }} · 模型 {{ aiModel }}
                    </div>
                  </div>
                </div>

                <div v-if="llm.issues.length" style="margin-top: 14px">
                  <div class="card__title">具体问题（{{ llm.issues.length }}）</div>
                  <ul class="small" style="margin: 0; padding-left: 20px; line-height: 1.9">
                    <li v-for="(s, i) in llm.issues" :key="i">{{ s }}</li>
                  </ul>
                </div>

                <div v-if="llm.polish" style="margin-top: 14px">
                  <div class="row">
                    <div class="card__title" style="margin: 0">润色译文</div>
                    <div class="spacer" />
                    <button class="btn btn--sm" @click="showPolish = !showPolish">
                      {{ showPolish ? '收起' : '展开' }}
                    </button>
                    <button class="btn btn--sm" @click="copyPolish">{{ copied ? '已复制' : '复制' }}</button>
                  </div>
                  <div
                    v-if="showPolish"
                    style="
                      margin-top: 8px;
                      padding: 12px 14px;
                      background: var(--bg-soft);
                      border-radius: var(--radius-sm);
                      line-height: 1.9;
                      white-space: pre-wrap;
                    "
                  >
                    {{ llm.polish }}
                  </div>
                </div>
              </template>
            </div>

            <div style="margin-top: 16px">
              <div class="card__title">参考答案</div>
              <div style="line-height: 1.9; white-space: pre-wrap">{{ result.question.reference }}</div>
            </div>

            <div style="margin-top: 16px">
              <div class="card__title">核心词汇</div>
              <div class="row" style="gap: 8px">
                <span v-for="cw in result.question.coreWords" :key="cw.en" class="tag tag--brand">
                  {{ cw.en }} · {{ cw.zh }}
                </span>
              </div>
            </div>

            <div style="margin-top: 16px">
              <div class="card__title">语法点解析</div>
              <ol style="margin: 0; padding-left: 20px; line-height: 1.9">
                <li v-for="(g, i) in result.question.grammarPoints" :key="i" class="small">{{ g }}</li>
              </ol>
            </div>

            <!-- ============ AI 讲解：重难点词汇 + 句子结构拆解 ============ -->
            <div class="explain" style="margin-top: 16px">
              <div class="row">
                <div class="card__title" style="margin: 0">AI 讲解</div>
                <span class="tag tag--purple">重难点词汇 · 句子结构</span>
                <div class="spacer" />
                <button
                  v-if="!explain"
                  class="btn btn--sm btn--primary"
                  :disabled="explainLoading || !hasApiKey()"
                  @click="runExplain"
                >
                  {{ explainLoading ? '讲解生成中…' : '生成讲解' }}
                </button>
                <button v-else class="btn btn--sm" :disabled="explainLoading" @click="runExplain">
                  {{ explainLoading ? '重新生成中…' : '重新生成' }}
                </button>
              </div>

              <p v-if="!hasApiKey()" class="tiny muted" style="margin: 10px 0 0">
                尚未配置模型 API Key。请在顶栏右侧的「AI 问答」抽屉里点「模型设置」填写（Key 只存本机浏览器），返回本页即可生成讲解。
              </p>
              <p v-else-if="!explain && !explainLoading" class="tiny muted" style="margin: 10px 0 0">
                逐句讲<b>重难点词汇</b>（推荐英文、词性、音标、搭配与易错点）和<b>句子结构拆解</b>（主干、成分、句型套路）。讲解会缓存在本机，同一题只花一次。
              </p>
              <p v-if="explainError" class="small" style="color: var(--danger); margin: 10px 0 0">{{ explainError }}</p>

              <template v-if="explain">
                <!-- 句子结构拆解 -->
                <div v-if="explain.structure?.main || explain.structure?.parts?.length" style="margin-top: 14px">
                  <div class="explain__h">
                    句子结构拆解
                    <span v-if="explain.structure.pattern" class="tag tag--brand">{{ explain.structure.pattern }}</span>
                  </div>

                  <div v-if="explain.structure.main" class="explain__main">
                    <span class="explain__main-label">主干</span>{{ explain.structure.main }}
                  </div>

                  <div v-if="explain.structure.parts.length" class="explain__parts">
                    <div v-for="(p, i) in explain.structure.parts" :key="i" class="explain__part">
                      <div class="explain__role">{{ p.role }}</div>
                      <div style="flex: 1; min-width: 0">
                        <div class="explain__en">{{ p.text }}</div>
                        <div v-if="p.note" class="tiny muted" style="margin-top: 2px">{{ p.note }}</div>
                      </div>
                    </div>
                  </div>

                  <p v-if="explain.structure.summary" class="tiny muted" style="margin: 10px 0 0">
                    翻译思路：{{ explain.structure.summary }}
                  </p>
                </div>

                <!-- 重难点词汇 -->
                <div v-if="explain.vocab?.length" style="margin-top: 16px">
                  <div class="explain__h">重难点词汇</div>
                  <div class="explain__vocab">
                    <div v-for="(w, i) in explain.vocab" :key="i" class="explain__word">
                      <div class="row" style="gap: 6px; align-items: baseline">
                        <span class="explain__en" style="font-weight: 700">{{ w.en }}</span>
                        <span v-if="w.phonetic" class="tiny muted">{{ w.phonetic }}</span>
                        <span v-if="w.pos" class="tag">{{ w.pos }}</span>
                        <span class="spacer" />
                        <span v-if="w.zh" class="tiny muted">原文「{{ w.zh }}」</span>
                      </div>
                      <div v-if="w.meaning" class="small" style="margin-top: 3px">{{ w.meaning }}</div>
                      <div v-if="w.usage" class="tiny muted" style="margin-top: 3px">{{ w.usage }}</div>
                    </div>
                  </div>
                </div>

                <!-- 注意点 -->
                <div v-if="explain.tips?.length" style="margin-top: 14px">
                  <div class="explain__h">翻译注意点</div>
                  <ul class="small" style="margin: 0; padding-left: 20px; line-height: 1.9">
                    <li v-for="(t, i) in explain.tips" :key="i">{{ t }}</li>
                  </ul>
                </div>

                <div v-if="explainModel" class="tiny muted" style="margin-top: 12px">讲解模型：{{ explainModel }}</div>
              </template>
            </div>
          </template>
        </template>
        <div v-else class="empty">请选择左侧题目</div>
      </div>

      <!-- ============ 右侧栏：实时翻译工具 ============ -->
      <div class="card translate-tool" style="margin-top: 0">
        <div class="row" style="margin-bottom: 10px">
          <div class="card__title" style="margin: 0">实时翻译</div>
          <div class="spacer" />
          <button class="btn btn--sm btn--ghost" @click="clearTrans">清空</button>
        </div>

        <div class="row" style="gap: 8px; margin-bottom: 10px">
          <div class="segmented">
            <button
              class="segmented__item"
              :class="{ 'is-active': transDirection === 'zh2en' }"
              @click="transDirection = 'zh2en'; runTranslate()"
            >
              中 → 英
            </button>
            <button
              class="segmented__item"
              :class="{ 'is-active': transDirection === 'en2zh' }"
              @click="transDirection = 'en2zh'; runTranslate()"
            >
              英 → 中
            </button>
          </div>
          <button class="btn btn--sm" title="中英互换" @click="swapTrans">互换</button>
        </div>

        <div class="field" style="margin-bottom: 10px">
          <label class="field__label">
            原文
            <span class="muted" style="font-weight: 400">（{{ transDirection === 'zh2en' ? '中文' : '英文' }}）</span>
          </label>
          <textarea
            v-model="transInput"
            v-autogrow
            class="textarea"
            style="min-height: 90px"
            :placeholder="transDirection === 'zh2en' ? '输入或粘贴中文，停笔后自动翻译…' : 'Type or paste English here…'"
            @input="scheduleTranslate"
          />
        </div>

        <div class="field" style="margin-bottom: 10px">
          <label class="field__label">
            译文
            <span v-if="transLoading" class="muted" style="font-weight: 400">翻译中…</span>
          </label>
          <div class="translate-out" :class="{ 'translate-out--empty': !transOutput && !transLoading }">
            <span v-if="transOutput" :class="{ 'translate-caret': transLoading }">{{ transOutput }}</span>
            <span v-else-if="transLoading" class="translate-caret"></span>
            <span v-else>译文会实时出现在这里。</span>
          </div>
        </div>

        <p v-if="transError" class="small" style="color: var(--danger); margin: 0 0 10px">{{ transError }}</p>

        <div class="row" style="gap: 8px">
          <button class="btn btn--sm btn--primary" :disabled="transLoading || !transInput.trim()" @click="runTranslate">
            {{ transLoading ? '翻译中…' : '翻译' }}
          </button>
          <button class="btn btn--sm" :disabled="!transOutput.trim()" @click="copyTrans">
            {{ transCopied ? '已复制' : '复制' }}
          </button>
          <button class="btn btn--sm" :disabled="!transOutput.trim() || !!result" @click="fillAnswer">填入译文</button>
        </div>

        <div class="row" style="margin-top: 10px; gap: 8px">
          <button class="btn btn--sm btn--ghost" :disabled="!current" @click="useCurrentPrompt">取当前题目</button>
          <div class="spacer" />
          <label class="row tiny muted" style="gap: 5px; cursor: pointer" title="停笔 0.8 秒后自动翻译">
            <input v-model="transAuto" type="checkbox" />
            自动翻译
          </label>
        </div>

        <p class="tiny muted" style="margin: 10px 0 0; line-height: 1.7">
          免费在线翻译，浏览器直连、无需任何配置。长段落会自动按句切块再翻译。
        </p>
      </div>
    </div>
  </div>
</template>
