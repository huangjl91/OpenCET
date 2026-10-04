<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { paperApi, translationApi, wordApi } from '@/api'
import { useUserStore } from '@/stores/user'
import {
  buildSystemPrompt,
  chat,
  fetchModels,
  getAiConfig,
  hasApiKey,
  loadHistory,
  saveAiConfig,
  saveHistory,
  testConnection,
} from '@/utils/ai'
import { AI_PROVIDERS, modelOptions, normalizeBaseUrl, providerOf } from '@/utils/aiProviders'
import type { AiConfig, AiContext, ChatMessage, PaperDetail, TranslationQuestion, WordVo } from '@/types'

/* ---------------- 配置 ---------------- */
const showSettings = ref(false)
const cfg = ref<AiConfig>(getAiConfig())
const testing = ref(false)
const testMsg = ref('')

/* 厂商与模型：模型名变化快，预设只当默认值，另有「拉取模型列表」兜底 */
const providerId = ref<string>(providerOf(cfg.value.baseUrl)?.id ?? 'custom')
const provider = computed(() => AI_PROVIDERS.find((p) => p.id === providerId.value))
const fetched = ref<string[]>([])
const fetching = ref(false)
const fetchMsg = ref('')
const options = computed(() => modelOptions(provider.value, fetched.value, cfg.value.model))
/** 选「自定义」时用输入框填模型名 */
const MODEL_CUSTOM = '__custom__'
const modelPick = ref<string>(cfg.value.model)

watch(options, (list) => {
  modelPick.value = list.includes(cfg.value.model) ? cfg.value.model : MODEL_CUSTOM
})
watch(modelPick, (v) => {
  if (v !== MODEL_CUSTOM) cfg.value.model = v
})
watch(providerId, (id) => {
  const p = AI_PROVIDERS.find((x) => x.id === id)
  if (!p) return
  if (p.baseUrl) cfg.value.baseUrl = p.baseUrl
  fetched.value = []
  const first = p.models[0]
  if (first) cfg.value.model = first
  else modelPick.value = MODEL_CUSTOM
})

/** 切换厂商时地址是否可编辑：自定义 / 本地部署允许改 */
const editableBaseUrl = computed(() => providerId.value === 'custom' || !!provider.value?.local)

async function doFetchModels() {
  fetching.value = true
  fetchMsg.value = ''
  try {
    const list = await fetchModels(cfg.value.baseUrl, cfg.value.apiKey)
    fetched.value = list
    fetchMsg.value = `拉到 ${list.length} 个模型，已并入下面的下拉框`
    if (list.length && !list.includes(cfg.value.model)) {
      // 当前模型不在服务商列表里，说明它可能已经下线了，提醒一下
      fetchMsg.value += `；当前填的「${cfg.value.model}」不在列表里，注意是否已下线`
    }
  } catch (e) {
    fetchMsg.value = (e as Error).message
  } finally {
    fetching.value = false
  }
}

function saveCfg() {
  // 选了「自定义」但没填模型名，别把空串存进去
  if (!cfg.value.model.trim()) cfg.value.model = options.value[0] ?? ''
  if (!normalizeBaseUrl(cfg.value.baseUrl)) {
    testMsg.value = '请先选择厂商或填写接口地址'
    return
  }
  cfg.value = saveAiConfig(cfg.value)
  showSettings.value = false
  testMsg.value = ''
  fetchMsg.value = ''
}

async function doTest() {
  testing.value = true
  testMsg.value = ''
  try {
    const r = await testConnection()
    testMsg.value = '连接成功，模型回复：' + r
  } catch (e) {
    testMsg.value = '连接失败：' + (e as Error).message
  } finally {
    testing.value = false
  }
}

/* ---------------- 上下文 ---------------- */
type CtxKind = 'none' | 'word' | 'translation' | 'paper'
const ctxKind = ref<CtxKind>('none')

const store = useUserStore()
const { level } = storeToRefs(store)

const words = ref<WordVo[]>([])
const wordQuery = ref('')
const pickedWord = ref<WordVo | null>(null)

const translations = ref<TranslationQuestion[]>([])
const pickedTranslation = ref<TranslationQuestion | null>(null)

const papers = ref<PaperDetail[]>([])
const pickedPaperId = ref<number | null>(null)
const pickedQuestionId = ref<number | null>(null)

async function ensureWords() {
  if (!words.value.length) words.value = await wordApi.list(level.value)
}
async function ensureTranslations() {
  if (!translations.value.length) translations.value = await translationApi.list(level.value)
}
async function ensurePapers() {
  if (!papers.value.length) {
    const list = await paperApi.list()
    papers.value = await Promise.all(list.map((p) => paperApi.get(p.id)))
  }
}

async function setKind(k: CtxKind) {
  ctxKind.value = k
  if (k === 'word') await ensureWords()
  if (k === 'translation') await ensureTranslations()
  if (k === 'paper') await ensurePapers()
}

const filteredWords = computed(() => {
  const kw = wordQuery.value.trim().toLowerCase()
  if (!kw) return words.value.slice(0, 40)
  return words.value.filter((w) => w.word.toLowerCase().includes(kw) || w.meaning.includes(kw)).slice(0, 40)
})

const paperQuestions = computed(() => {
  const p = papers.value.find((x) => x.id === pickedPaperId.value)
  if (!p) return []
  return p.sectionList.flatMap((s) => s.questions)
})

const pickedQuestion = computed(() => paperQuestions.value.find((q) => q.id === pickedQuestionId.value) ?? null)

const context = computed<AiContext>(() => {
  if (ctxKind.value === 'word' && pickedWord.value) {
    const w = pickedWord.value
    return {
      kind: 'word',
      title: `单词 ${w.word} ${w.phonetic}`,
      content: `${w.pos} ${w.meaning}\n例句：${w.exampleEn}\n翻译：${w.exampleZh}`,
      extra: `来源：${w.source}`,
    }
  }
  if (ctxKind.value === 'translation' && pickedTranslation.value) {
    const q = pickedTranslation.value
    return {
      kind: 'translation',
      title: `翻译题（${q.type === 'sentence' ? '单句' : '段落'}）`,
      content: `原文：${q.prompt}\n参考译文：${q.reference}`,
      extra: `核心词汇：${(q.coreWords ?? []).map((c) => c.en + ' ' + c.zh).join('，')}`,
    }
  }
  if (ctxKind.value === 'paper' && pickedQuestion.value) {
    const q = pickedQuestion.value
    return {
      kind: 'paper',
      title: `真题第 ${q.orderNo} 题`,
      content: `题干：${q.stem}\n选项：${(q.options ?? []).join('  ')}\n参考答案：${q.answer}\n解析：${q.analysis}`,
    }
  }
  return { kind: 'general' }
})

/* ---------------- 对话 ---------------- */
const messages = ref<ChatMessage[]>([])
const input = ref('')
const sending = ref(false)
const errorMsg = ref('')
const chatBody = ref<HTMLElement | null>(null)

const QUICK_PROMPTS = ['讲讲这个单词', '拆解这个长难句', '这道题为什么选它', '出 3 道同类题']

onMounted(() => {
  messages.value = loadHistory()
})

function scrollBottom() {
  setTimeout(() => {
    if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
  }, 40)
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || sending.value) return
  if (!hasApiKey()) {
    showSettings.value = true
    errorMsg.value = '请先配置 API Key（仅保存在本机浏览器，不会上传到服务器）'
    return
  }

  errorMsg.value = ''
  input.value = ''
  const history = messages.value.filter((m) => m.role !== 'system').slice(-10)
  const payload: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(context.value) },
    ...history,
    { role: 'user', content },
  ]

  messages.value.push({ role: 'user', content })
  messages.value.push({ role: 'assistant', content: '' })
  const last = messages.value[messages.value.length - 1]
  sending.value = true
  scrollBottom()

  try {
    await chat(payload, (delta) => {
      last.content += delta
      scrollBottom()
    })
    if (!last.content) last.content = '（模型未返回内容）'
  } catch (e) {
    last.content = ''
    errorMsg.value = (e as Error).message
    messages.value.pop()
  } finally {
    sending.value = false
    saveHistory(messages.value.filter((m) => m.content))
    scrollBottom()
  }
}

function resetChat() {
  messages.value = []
  saveHistory([])
  errorMsg.value = ''
}

defineEmits<{ close: [] }>()
</script>

<template>
  <div class="ai-panel">
    <!-- 顶部状态与操作 -->
    <div class="ai-panel__bar">
      <span v-if="hasApiKey()" class="tag tag--ok">已配置 · {{ cfg.model }}</span>
      <span v-else class="tag tag--warn">未配置 API Key</span>
      <span class="spacer" />
      <button class="btn btn--sm btn--ghost" @click="showSettings = !showSettings">
        {{ showSettings ? '收起设置' : '模型设置' }}
      </button>
      <button class="btn btn--sm btn--ghost" @click="resetChat">清空</button>
    </div>

    <!-- 设置 -->
    <div v-if="showSettings" class="ai-panel__settings">
      <div class="field">
        <label class="field__label">模型厂商</label>
        <select v-model="providerId" class="select">
          <option v-for="p in AI_PROVIDERS" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <p v-if="provider?.note" class="tiny muted" style="margin: 5px 0 0; line-height: 1.7">{{ provider.note }}</p>
      </div>

      <div class="field">
        <label class="field__label">
          接口地址 Base URL
          <span v-if="!editableBaseUrl" class="tiny muted">（随厂商自动填好）</span>
        </label>
        <input
          v-model="cfg.baseUrl"
          class="input"
          :readonly="!editableBaseUrl"
          :class="{ 'input--readonly': !editableBaseUrl }"
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div class="field">
        <label class="field__label">模型</label>
        <div class="row" style="gap: 6px">
          <select v-model="modelPick" class="select" style="flex: 1">
            <option v-for="m in options" :key="m" :value="m">{{ m }}</option>
            <option :value="MODEL_CUSTOM">自定义…</option>
          </select>
          <button class="btn btn--sm" :disabled="fetching || !cfg.baseUrl.trim()" @click="doFetchModels">
            {{ fetching ? '拉取中…' : '拉取列表' }}
          </button>
        </div>
        <input
          v-if="modelPick === MODEL_CUSTOM"
          v-model="cfg.model"
          class="input"
          style="margin-top: 6px"
          placeholder="直接填服务商给的模型名，如 deepseek-flash"
        />
        <p v-if="fetchMsg" class="tiny" style="margin: 5px 0 0; line-height: 1.7; color: var(--text-2)">
          {{ fetchMsg }}
        </p>
      </div>

      <div class="field">
        <label class="field__label">
          API Key（仅存本机，不上传服务器）
          <span v-if="provider?.local" class="tiny muted">（本地部署随便填一个非空值）</span>
        </label>
        <input v-model="cfg.apiKey" class="input" type="password" placeholder="sk-..." />
      </div>

      <div class="field">
        <label class="field__label">温度 {{ cfg.temperature }}</label>
        <input v-model.number="cfg.temperature" type="range" min="0" max="1" step="0.1" style="width: 100%" />
      </div>

      <div class="row">
        <button class="btn btn--sm btn--primary" @click="saveCfg">保存</button>
        <button class="btn btn--sm" :disabled="testing" @click="doTest">{{ testing ? '测试中…' : '测试连接' }}</button>
      </div>
      <p v-if="testMsg" class="tiny" :style="{ color: testMsg.startsWith('连接成功') ? 'var(--ok)' : 'var(--danger)' }">
        {{ testMsg }}
      </p>
      <p class="tiny muted" style="margin: 6px 0 0; line-height: 1.7">
        Key 只存本机 localStorage，请求由浏览器直连服务商，不经过本站后端。列表里没有的服务商，选「自定义」填地址即可。
      </p>
    </div>

    <!-- 上下文挂载 -->
    <div class="ai-panel__ctx">
      <div class="segmented" style="width: 100%">
        <button class="segmented__item" :class="{ 'is-active': ctxKind === 'none' }" @click="setKind('none')">无</button>
        <button class="segmented__item" :class="{ 'is-active': ctxKind === 'word' }" @click="setKind('word')">单词</button>
        <button class="segmented__item" :class="{ 'is-active': ctxKind === 'translation' }" @click="setKind('translation')">
          翻译题
        </button>
        <button class="segmented__item" :class="{ 'is-active': ctxKind === 'paper' }" @click="setKind('paper')">真题</button>
      </div>

      <div v-if="ctxKind === 'word'" style="margin-top: 8px">
        <input v-model="wordQuery" class="input" placeholder="搜索单词…" style="margin-bottom: 6px" />
        <div style="max-height: 150px; overflow-y: auto">
          <div
            v-for="w in filteredWords"
            :key="w.id"
            class="list-item"
            style="cursor: pointer; padding: 7px 0"
            :style="pickedWord?.id === w.id ? 'background: var(--brand-soft); border-radius: 7px; padding-left: 7px' : ''"
            @click="pickedWord = w"
          >
            <div style="flex: 1; min-width: 0">
              <b class="small">{{ w.word }}</b>
              <span class="muted tiny">{{ w.phonetic }}</span>
              <div class="tiny muted">{{ w.meaning }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="ctxKind === 'translation'" style="margin-top: 8px">
        <select
          class="select"
          @change="pickedTranslation = translations.find((t) => t.id === ($event.target as HTMLSelectElement).value) ?? null"
        >
          <option value="">选择一道翻译题…</option>
          <option v-for="t in translations" :key="t.id" :value="t.id">{{ t.prompt.slice(0, 30) }}…</option>
        </select>
      </div>

      <div v-else-if="ctxKind === 'paper'" style="margin-top: 8px">
        <select v-model.number="pickedPaperId" class="select" style="margin-bottom: 6px">
          <option :value="null">选择一套真题…</option>
          <option v-for="p in papers" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
        <select v-if="pickedPaperId" v-model.number="pickedQuestionId" class="select">
          <option :value="null">选择一道题…</option>
          <option v-for="q in paperQuestions" :key="q.id" :value="q.id">第 {{ q.orderNo }} 题 · {{ q.stem.slice(0, 22) }}…</option>
        </select>
      </div>

      <div v-if="context.content" class="tiny muted" style="margin-top: 7px">已挂载：{{ context.title }}</div>
    </div>

    <!-- 消息 -->
    <div ref="chatBody" class="ai-panel__body">
      <div v-if="!messages.length" class="ai-panel__empty">
        <p style="margin: 0 0 10px">选好上下文后直接提问，例如「讲讲这个单词」</p>
        <div class="row" style="justify-content: center; gap: 6px">
          <button v-for="p in QUICK_PROMPTS" :key="p" class="btn btn--sm" @click="send(p)">{{ p }}</button>
        </div>
      </div>

      <template v-for="(m, i) in messages" :key="i">
        <div v-if="m.content" class="bubble" :class="m.role === 'user' ? 'bubble--user' : 'bubble--ai'">
          {{ m.content }}
        </div>
      </template>

      <div v-if="errorMsg" class="bubble bubble--error">{{ errorMsg }}</div>
    </div>

    <!-- 输入 -->
    <div class="ai-panel__foot">
      <textarea
        v-model="input"
        class="textarea"
        style="min-height: 56px"
        placeholder="输入问题，回车发送（Shift+Enter 换行）"
        @keydown.enter.exact.prevent="send()"
      />
      <button class="btn btn--primary" :disabled="sending || !input.trim()" @click="send()">
        {{ sending ? '生成中…' : '发送' }}
      </button>
    </div>
  </div>
</template>
