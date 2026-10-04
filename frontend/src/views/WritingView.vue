<script setup lang="ts">
import { computed, ref } from 'vue'
import BlankDrill from '@/components/BlankDrill.vue'
import { getAiConfig, hasApiKey } from '@/utils/ai'
import { splitBold } from '@/utils/inlineMarkup'
import { llmSentenceReview, type SentenceReview } from '@/utils/llmWriting'
import {
  buildPatternBlanks,
  buildWordBlanks,
  checkSentence,
  GOLDEN_PATTERNS,
  PATTERN_GROUPS,
  WORD_GROUPS,
  WRITING_WORDS,
  type BlankItem,
  type GoldenPattern,
  type SentenceCheck,
} from '@/utils/writingGuide'

type Tab = 'words' | 'patterns'
const tab = ref<Tab>('words')
/** 金句有两种练法：逐词默写例句 / 用句式自己造句 */
const patternMode = ref<'blank' | 'write'>('blank')

/* ---------------- 逐词默写（重点词 / 金句，共用 BlankDrill） ---------------- */
const wordItems = ref<BlankItem[]>(buildWordBlanks(2026))
const patternItems = ref<BlankItem[]>(buildPatternBlanks(2026))
const wordGroup = ref<string>('全部')
const patternGroup = ref<string>('全部')

/** 重点词 tab 练词；金句 tab 且选了默写模式时练例句 */
const practicing = computed(() => tab.value === 'words' || patternMode.value === 'blank')
const blankItems = computed(() => (tab.value === 'words' ? wordItems.value : patternItems.value))

function restartBlanks() {
  const seed = Date.now() % 100000
  if (tab.value === 'words') wordItems.value = buildWordBlanks(seed)
  else patternItems.value = buildPatternBlanks(seed)
}

/** 只练写错的：组件的 items 一换就自动重开一轮 */
function practiceSubset(items: BlankItem[]) {
  if (tab.value === 'words') wordItems.value = items
  else patternItems.value = items
}

const listWords = computed(() =>
  wordGroup.value === '全部' ? WRITING_WORDS : WRITING_WORDS.filter((w) => w.group === wordGroup.value)
)
const listPatterns = computed(() =>
  patternGroup.value === '全部'
    ? GOLDEN_PATTERNS
    : GOLDEN_PATTERNS.filter((p) => p.group === patternGroup.value)
)

/* ---------------- 金句 · 造句练习 ---------------- */
const drafts = ref<Record<string, string>>({})
const checks = ref<Record<string, SentenceCheck>>({})
const reviews = ref<Record<string, SentenceReview>>({})
const reviewing = ref<Record<string, boolean>>({})
const reviewErr = ref<Record<string, string>>({})

function runCheck(p: GoldenPattern) {
  checks.value = { ...checks.value, [p.id]: checkSentence(drafts.value[p.id] ?? '', p) }
}
function fillExample(p: GoldenPattern) {
  drafts.value = { ...drafts.value, [p.id]: p.example }
  runCheck(p)
}
async function runReview(p: GoldenPattern) {
  const s = (drafts.value[p.id] ?? '').trim()
  if (!s || !hasApiKey()) return
  reviewing.value = { ...reviewing.value, [p.id]: true }
  reviewErr.value = { ...reviewErr.value, [p.id]: '' }
  try {
    reviews.value = { ...reviews.value, [p.id]: await llmSentenceReview(p, s) }
  } catch (e) {
    reviewErr.value = { ...reviewErr.value, [p.id]: (e as Error).message }
  } finally {
    reviewing.value = { ...reviewing.value, [p.id]: false }
  }
}

/** 把句式模板里的 ___ 高亮出来 */
function patternParts(tpl: string) {
  return tpl.split(/(_{2,})/).map((t) => ({ text: t, blank: /^_{2,}$/.test(t) }))
}

/** 参考答案的展开状态（默认收起，先自己写） */
const refOpen = ref<Record<string, boolean>>({})
function toggleRef(p: GoldenPattern) {
  refOpen.value = { ...refOpen.value, [p.id]: !refOpen.value[p.id] }
}

/** 语言问题的类别标签 */
const KIND_LABEL: Record<string, string> = { spelling: '拼写', grammar: '语法', punctuation: '标点' }
function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind
}
</script>

<template>
  <div>
    <h1 class="page-title">作文方法</h1>
    <p class="page-sub">
      写作拿分就两件事：词用对、句用对。这里收了 {{ WRITING_WORDS.length }} 个写作重点词与
      {{ GOLDEN_PATTERNS.length }} 个高分句式，都做成「一个词一条横线」的逐词默写。
    </p>

    <div class="segmented" style="margin-bottom: 14px">
      <button class="segmented__item" :class="{ 'is-active': tab === 'words' }" @click="tab = 'words'">
        写作重点词（{{ WRITING_WORDS.length }}）
      </button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'patterns' }" @click="tab = 'patterns'">
        金句句式（{{ GOLDEN_PATTERNS.length }}）
      </button>
    </div>

    <div v-if="tab === 'patterns'" class="segmented" style="margin-bottom: 12px">
      <button
        class="segmented__item"
        :class="{ 'is-active': patternMode === 'blank' }"
        @click="patternMode = 'blank'"
      >
        逐词默写例句
      </button>
      <button
        class="segmented__item"
        :class="{ 'is-active': patternMode === 'write' }"
        @click="patternMode = 'write'"
      >
        用句式造句
      </button>
    </div>

    <!-- 重点词：先看词表，再往下默写 -->
    <div v-if="tab === 'words'" class="card" style="margin-top: 0">
      <div class="row" style="margin-bottom: 10px">
        <div class="card__title" style="margin: 0">重点词表</div>
        <span class="tiny muted">先看一遍，再往下默写</span>
        <div class="spacer" />
        <select v-model="wordGroup" class="select" style="width: auto">
          <option value="全部">全部分组</option>
          <option v-for="g in WORD_GROUPS" :key="g" :value="g">{{ g }}</option>
        </select>
      </div>
      <div class="wtable">
        <div v-for="w in listWords" :key="w.id" class="wtable__row">
          <div class="wtable__zh">{{ w.zh }}</div>
          <div class="wtable__en">{{ w.en }}</div>
          <div class="wtable__note tiny muted">
            <template v-for="(seg, si) in splitBold(w.note)" :key="si">
              <b v-if="seg.bold">{{ seg.text }}</b>
              <template v-else>{{ seg.text }}</template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 逐词填空 -->
    <BlankDrill
      v-if="practicing"
      :items="blankItems"
      :style="tab === 'words' ? '' : 'margin-top: 0'"
      :caption="blankItems.length + ' 题 · 一题一屏'"
      restart-text="换一套题"
      @restart="restartBlanks"
      @practice="practiceSubset"
    />

    <!-- 金句：造句练习 -->
    <template v-if="tab === 'patterns' && patternMode === 'write'">
      <div class="row" style="margin-bottom: 10px">
        <select v-model="patternGroup" class="select" style="width: auto">
          <option value="全部">全部分组</option>
          <option v-for="g in PATTERN_GROUPS" :key="g" :value="g">{{ g }}</option>
        </select>
        <span class="tiny muted">共 {{ listPatterns.length }} 句</span>
        <div class="spacer" />
        <span class="tiny muted">按中文题目翻译，点「检查句式」查句式 + 拼写 + 语法</span>
      </div>

      <div v-for="p in listPatterns" :key="p.id" class="card gp">
        <div class="row" style="align-items: flex-start">
          <span class="tag tag--purple">{{ p.group }}</span>
          <div class="spacer" />
          <button class="btn btn--sm btn--ghost" @click="fillExample(p)">用例句试试</button>
        </div>

        <div class="gp__pattern">
          <template v-for="(seg, i) in patternParts(p.pattern)" :key="i">
            <span v-if="seg.blank" class="gp__blank">______</span>
            <span v-else>{{ seg.text }}</span>
          </template>
        </div>
        <div class="gp__zh">{{ p.zh }}</div>
        <div class="gp__example"><span class="tiny muted">例句</span>{{ p.example }}</div>
        <div class="gp__tip">
          <template v-for="(seg, si) in splitBold(p.tip)" :key="si">
            <b v-if="seg.bold">{{ seg.text }}</b>
            <template v-else>{{ seg.text }}</template>
          </template>
        </div>

        <!-- 造句的中文题目：不给题目用户不知道要写什么内容 -->
        <div class="gp__task">
          <span class="gp__task-label">请用这个句式翻译</span>
          <p class="gp__task-text">{{ p.task || '（这个句式还没配题目）' }}</p>
        </div>

        <textarea
          v-model="drafts[p.id]"
          class="textarea"
          style="min-height: 62px; margin-top: 10px"
          placeholder="把你的英文译文写在这里…"
        />

        <div class="row" style="margin-top: 8px">
          <button class="btn btn--sm btn--primary" :disabled="!(drafts[p.id] ?? '').trim()" @click="runCheck(p)">
            检查句式
          </button>
          <button
            class="btn btn--sm"
            :disabled="!hasApiKey() || reviewing[p.id] || !(drafts[p.id] ?? '').trim()"
            :title="hasApiKey() ? '让模型点评语法与用词' : '先在顶栏「AI 问答」里配置模型 Key'"
            @click="runReview(p)"
          >
            {{ reviewing[p.id] ? '点评中…' : 'AI 点评' }}
          </button>
          <button class="btn btn--sm btn--ghost" @click="toggleRef(p)">
            {{ refOpen[p.id] ? '收起参考答案' : '看参考答案' }}
          </button>
          <span v-if="!hasApiKey()" class="tiny muted">未配 Key，AI 点评不可用</span>
        </div>

        <div v-if="refOpen[p.id]" class="gp__ref">
          <span class="tiny muted">参考答案</span>
          <p>{{ p.taskRef }}</p>
        </div>

        <div v-if="checks[p.id]" class="gp__check" :class="checks[p.id].ok ? 'is-ok' : 'is-bad'">
          <div class="row" style="gap: 8px">
            <span class="tag" :class="checks[p.id].ok ? 'tag--ok' : 'tag--warn'">
              {{ checks[p.id].ok ? '句式与语言都没问题' : '还需要改' }}
            </span>
            <span class="tiny muted">{{ checks[p.id].words }} 词</span>
            <span v-if="checks[p.id].problems.length" class="tiny muted">
              发现 {{ checks[p.id].problems.length }} 处拼写 / 语法问题
            </span>
          </div>
          <ul v-if="checks[p.id].issues.length" class="tiny" style="margin: 6px 0 0; padding-left: 18px; line-height: 1.9">
            <li v-for="(s, i) in checks[p.id].issues" :key="i">{{ s }}</li>
          </ul>
          <div v-if="checks[p.id].hits.length" class="tiny muted" style="margin-top: 4px">
            已用到骨架：{{ checks[p.id].hits.join(' / ') }}
          </div>

          <!-- 拼写 / 语法问题：逐条给出错在哪、应该改成什么 -->
          <div v-if="checks[p.id].problems.length" class="gp__problems">
            <div
              v-for="(pr, i) in checks[p.id].problems"
              :key="i"
              class="gp__problem"
              :class="'is-' + pr.kind"
            >
              <span class="gp__problem-kind">{{ kindLabel(pr.kind) }}</span>
              <span class="gp__problem-text">{{ pr.message }}</span>
              <code v-if="pr.suggest" class="gp__problem-fix">{{ pr.suggest }}</code>
            </div>
          </div>
        </div>

        <p v-if="reviewErr[p.id]" class="small" style="color: var(--danger); margin: 8px 0 0">
          {{ reviewErr[p.id] }}
        </p>

        <div v-if="reviews[p.id]" class="gp__review">
          <div class="row">
            <span
              class="tag"
              :class="reviews[p.id].score >= 80 ? 'tag--ok' : reviews[p.id].score >= 60 ? 'tag--warn' : 'tag--danger'"
            >
              AI {{ reviews[p.id].score }} 分
            </span>
            <span class="tiny muted">{{ getAiConfig().model }}</span>
          </div>
          <ul v-if="reviews[p.id].issues.length" class="small" style="margin: 8px 0 0; padding-left: 18px; line-height: 1.9">
            <li v-for="(s, i) in reviews[p.id].issues" :key="i">{{ s }}</li>
          </ul>
          <div v-if="reviews[p.id].better" class="gp__better">
            <span class="tiny muted">润色</span>{{ reviews[p.id].better }}
          </div>
          <div v-if="reviews[p.id].comment" class="small muted" style="margin-top: 6px">
            {{ reviews[p.id].comment }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
