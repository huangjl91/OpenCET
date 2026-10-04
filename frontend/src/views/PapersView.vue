<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { paperApi } from '@/api'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import {
  countQuestions,
  parsePaper,
  SECTION_LABEL,
  type ParsedPaper,
  type ParsedQuestion,
  type ParsedSection,
} from '@/utils/paperParser'
import { extractTextFromFile, formatSize, type ExtractKind } from '@/utils/fileExtract'
import { vAutogrow } from '@/utils/autogrow'
import { answerKey, isLetterOptions, optionLetter } from '@/utils/paperDisplay'
import type { Paper, SectionType } from '@/types'

type Tab = 'mine' | 'presets' | 'import'

const router = useRouter()
const store = useUserStore()
const { level } = storeToRefs(store)

const tab = ref<Tab>('mine')
const papers = ref<Paper[]>([])
const presets = ref<Paper[]>([])
const loading = ref(true)
const working = ref(false)

/* ---------------- 导入切分 ---------------- */
const rawText = ref('')
const parsed = ref<ParsedPaper | null>(null)
const parseMsg = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const extracting = ref(false)
const fileName = ref('')
const fileSize = ref(0)
const fileKind = ref<ExtractKind | ''>('')

const SECTION_TYPES: SectionType[] = ['writing', 'listening', 'cloze', 'reading', 'translation']

function doParse() {
  parseMsg.value = ''
  if (!rawText.value.trim()) {
    parseMsg.value = '请先粘贴或上传真题文本'
    return
  }
  try {
    parsed.value = parsePaper(rawText.value, level.value)
    if (!parsed.value.sections.length) {
      parseMsg.value = '未识别到任何模块，请检查文本格式，或直接手工填写题目。'
    }
  } catch (e) {
    parseMsg.value = '解析失败：' + (e as Error).message
  }
}

async function loadFile(file: File) {
  if (!file) return
  extracting.value = true
  parseMsg.value = ''
  try {
    const r = await extractTextFromFile(file)
    rawText.value = r.text
    fileName.value = r.name
    fileSize.value = r.size
    fileKind.value = r.kind
    doParse()
  } catch (e) {
    parseMsg.value = '读取失败：' + (e instanceof Error ? e.message : String(e))
  } finally {
    extracting.value = false
  }
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return
  await loadFile(file)
}

function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  void loadFile(file)
}

function clearFile() {
  rawText.value = ''
  fileName.value = ''
  fileSize.value = 0
  fileKind.value = ''
  parsed.value = null
  parseMsg.value = ''
}

function removeQuestion(s: ParsedSection, qi: number) {
  s.questions.splice(qi, 1)
}

function addQuestion(s: ParsedSection) {
  s.questions.push({
    orderNo: s.questions.length ? s.questions[s.questions.length - 1].orderNo + 1 : 1,
    stem: '',
    options: [],
    answer: '',
    analysis: '',
  })
}

/** 补一个选项，字母按当前数量顺延（A、B、C…） */
function addOption(q: ParsedQuestion) {
  q.options.push(`${String.fromCharCode(65 + q.options.length)}) `)
}

/** 哪些题正处于「编辑选项文字」状态，键为 模块 key + 题号下标 */
const optionEditing = ref<Record<string, boolean>>({})
const optionKey = (s: ParsedSection, qi: number) => `${s.key}:${qi}`

/**
 * 点击选项 = 把它标为正确答案（再点一次取消）。
 * 真题 PDF 通常不带答案，核对切分时直接点一遍就能把答案补上。
 */
function toggleAnswer(q: ParsedQuestion, opt: string) {
  const letter = optionLetter(opt)
  if (!letter) return
  q.answer = answerKey(q) === letter ? '' : letter
}

function removeSection(si: number) {
  parsed.value?.sections.splice(si, 1)
}

const parsedCount = computed(() => (parsed.value ? countQuestions(parsed.value.sections) : 0))

async function saveParsed() {
  if (!parsed.value) return
  working.value = true
  try {
    const { id } = await paperApi.create({
      title: parsed.value.title,
      level: parsed.value.level,
      yearMonth: parsed.value.yearMonth,
      source: '粘贴/上传',
      rawText: parsed.value.rawText,
      sections: parsed.value.sections.map((s) => ({
        type: s.type,
        title: s.title,
        passage: s.passage,
        questions: s.questions.map((q) => ({
          orderNo: q.orderNo,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
        })),
      })),
    })
    store.refreshStats()
    router.push(`/papers/${id}`)
  } finally {
    working.value = false
  }
}

/* ---------------- 列表 ---------------- */
async function load() {
  loading.value = true
  try {
    const [a, b] = await Promise.all([paperApi.list(), paperApi.presets()])
    papers.value = a
    presets.value = b
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function clonePreset(id: number) {
  working.value = true
  try {
    const { id: newId } = await paperApi.clone(id)
    await store.refreshStats()
    router.push(`/papers/${newId}`)
  } finally {
    working.value = false
  }
}

async function removePaper(id: number) {
  if (!confirm('确定删除这套真题？删除后无法恢复。')) return
  await paperApi.remove(id)
  await load()
  await store.refreshStats()
}

function percent(p: Paper) {
  return p.totalCount ? Math.round((p.doneCount / p.totalCount) * 100) : 0
}
</script>

<template>
  <div>
    <h1 class="page-title">真题拆解练习</h1>
    <p class="page-sub">粘贴或上传整套真题 → 自动按听力 / 阅读 / 选词填空 / 翻译 / 写作切分到单题 → 逐题作答并保留进度</p>

    <div class="segmented" style="margin-bottom: 16px">
      <button class="segmented__item" :class="{ 'is-active': tab === 'mine' }" @click="tab = 'mine'">
        我的真题（{{ papers.length }}）
      </button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'presets' }" @click="tab = 'presets'">
        内置示范卷（{{ presets.length }}）
      </button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'import' }" @click="tab = 'import'">
        ＋ 导入并切分
      </button>
    </div>

    <!-- 我的真题 -->
    <div v-if="tab === 'mine'">
      <div v-if="loading" class="card empty">加载中…</div>
      <div v-else-if="!papers.length" class="card">
        <div class="empty">
          <p style="margin: 0 0 12px">还没有真题，去「内置示范卷」一键加入，或导入自己的真题。</p>
          <button class="btn btn--primary" @click="tab = 'presets'">看看示范卷</button>
        </div>
      </div>
      <div v-else class="grid grid-2">
        <div v-for="p in papers" :key="p.id" class="card" style="margin-top: 0">
          <div class="row" style="align-items: flex-start">
            <div style="flex: 1; min-width: 0">
              <div style="font-weight: 700; line-height: 1.4">{{ p.title }}</div>
              <div class="row tiny muted" style="gap: 6px; margin-top: 4px">
                <span class="tag" :class="p.level === 'CET6' ? 'tag--purple' : 'tag--brand'">{{ p.level }}</span>
                <span v-if="p.yearMonth">{{ p.yearMonth }}</span>
                <span>{{ p.source }}</span>
              </div>
            </div>
            <button class="btn btn--sm btn--danger" @click="removePaper(p.id)">删除</button>
          </div>
          <div class="progress" style="margin: 12px 0 8px">
            <div class="progress__bar" :style="{ width: percent(p) + '%' }" />
          </div>
          <div class="row small muted">
            <span>完成 {{ p.doneCount }} / {{ p.totalCount }} 题（{{ percent(p) }}%）</span>
            <span class="spacer" />
            <a class="btn btn--sm btn--primary" :href="`#/papers/${p.id}`">继续练习</a>
          </div>
        </div>
      </div>
    </div>

    <!-- 内置示范卷 -->
    <div v-else-if="tab === 'presets'" class="grid grid-2">
      <div v-for="p in presets" :key="p.id" class="card" style="margin-top: 0">
        <div class="row" style="align-items: flex-start">
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 700; line-height: 1.4">{{ p.title }}</div>
            <div class="row tiny muted" style="gap: 6px; margin-top: 4px">
              <span class="tag" :class="p.level === 'CET6' ? 'tag--purple' : 'tag--brand'">{{ p.level }}</span>
              <span v-if="p.yearMonth">{{ p.yearMonth }}</span>
              <span>共 {{ p.totalCount }} 题</span>
            </div>
          </div>
        </div>
        <div class="row" style="margin-top: 12px">
          <span class="small muted">含答案与解析，一键加入我的真题后即可作答</span>
          <span class="spacer" />
          <button class="btn btn--sm btn--primary" :disabled="working" @click="clonePreset(p.id)">
            加入我的真题
          </button>
        </div>
      </div>
    </div>

    <!-- 导入切分 -->
    <div v-else>
      <div class="card">
        <div class="card__title">1. 粘贴原文或上传文件</div>
        <p class="small muted" style="margin: -6px 0 12px">
          支持拖拽或点击上传 <b>.pdf / .docx / .txt / .md / .json</b>。系统会按「Part I/II/III/IV、写作、听力、阅读理解、选词填空、翻译」切分大模块，
          再把听力 / 阅读下的 <b>Section A/B/C、Passage One/Two</b> 各自切成独立模块，然后按题号（1. / （1）/ Question 1）切到单题；
          页眉页脚自动剥离，卷末答案自动回填。下面的结果可以直接改标题、改模块类型或删除。
        </p>

        <!-- 拖拽区 -->
        <div
          class="dropzone"
          :class="{ 'is-over': false }"
          @dragover.prevent
          @dragenter.prevent
          @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <div v-if="!fileName" class="dropzone__hint">
            <div>把真题文件拖到这里，或<span class="link">点击选择</span></div>
            <div class="tiny muted">PDF / DOCX / TXT / MD / JSON（也支持直接粘贴全文到下方文本框）</div>
          </div>
          <div v-else class="dropzone__file">
            <span>{{ fileName }}</span>
            <span class="tiny muted">{{ formatSize(fileSize) }} · {{ fileKind.toUpperCase() }}</span>
            <button class="btn btn--sm btn--ghost" @click.stop="clearFile">移除</button>
          </div>
        </div>

        <textarea
          v-model="rawText"
          class="textarea"
          style="min-height: 160px; margin-top: 10px"
          placeholder="在此粘贴整套真题原文，或上传文件后自动填入…"
        />
        <div class="row" style="margin-top: 12px">
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.markdown,.json,.text,.csv,.tsv,.xml,.html,.htm"
            style="display: none"
            @change="onFile"
          />
          <button class="btn" :disabled="extracting" @click="fileInput?.click()">选择文件</button>
          <button class="btn btn--primary" :disabled="extracting" @click="doParse">
            {{ extracting ? '读取中…' : '自动切分' }}
          </button>
          <span v-if="parseMsg" class="small" style="color: var(--danger)">{{ parseMsg }}</span>
        </div>
      </div>

      <template v-if="parsed && parsed.sections.length">
        <div class="card">
          <div class="card__title">2. 核对切分结果（共 {{ parsed.sections.length }} 个模块 / {{ parsedCount }} 题）</div>
          <div class="grid grid-2">
            <div class="field" style="margin-bottom: 0">
              <label class="field__label">试卷标题</label>
              <input v-model="parsed.title" class="input" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label class="field__label">考试等级</label>
              <select v-model="parsed.level" class="select">
                <option value="CET4">四级 CET-4</option>
                <option value="CET6">六级 CET-6</option>
              </select>
            </div>
          </div>
        </div>

        <div v-for="(s, si) in parsed.sections" :key="s.key" class="card">
          <div class="row" style="align-items: flex-start">
            <select v-model="s.type" class="select" style="width: 130px">
              <option v-for="t in SECTION_TYPES" :key="t" :value="t">{{ SECTION_LABEL[t] }}</option>
            </select>
            <input v-model="s.title" class="input" style="flex: 1; min-width: 160px" placeholder="模块标题" />
            <span class="tag">{{ s.questions.length }} 题</span>
            <button class="btn btn--sm btn--danger" @click="removeSection(si)">删除模块</button>
          </div>

          <div v-if="s.passage" class="field" style="margin-top: 12px">
            <label class="field__label">公共题干 / 原文</label>
            <textarea v-model="s.passage" v-autogrow class="textarea" style="min-height: 90px" />
          </div>

          <div v-for="(q, qi) in s.questions" :key="qi" style="border-top: 1px dashed var(--border); padding-top: 12px; margin-top: 12px">
            <div class="row" style="margin-bottom: 8px">
              <span class="tag tag--brand">第 {{ q.orderNo }} 题</span>
              <span class="spacer" />
              <button class="btn btn--sm btn--ghost" @click="removeQuestion(s, qi)">删除本题</button>
            </div>
            <div class="field">
              <label class="field__label">题干</label>
              <textarea
                v-model="q.stem"
                v-autogrow
                class="textarea"
                style="min-height: 70px"
                placeholder="本题题干。听力题的题干在音频中念出，卷面通常不印，留空属正常；若卷面有题干请填在这里"
              />
            </div>

            <div class="field">
              <label class="field__label">
                选项
                <span class="muted" style="font-weight: 400">
                  （{{ q.options.length }} 个 —— 点击选项即标为正确答案；长篇阅读的段落字母也在这里点）
                </span>
              </label>

              <!-- 默认可点击（与练习页一致）；需要改选项文字时再切到编辑态 -->
              <template v-if="!optionEditing[optionKey(s, qi)]">
                <!-- 段落匹配（长篇阅读）：选项是原文段落标号，用字母片平铺 -->
                <div v-if="isLetterOptions(q.options)" class="letter-picker" style="margin-bottom: 6px">
                  <button
                    v-for="(opt, oi) in q.options"
                    :key="oi"
                    class="letter-picker__item"
                    :style="
                      optionLetter(opt) === answerKey(q)
                        ? 'border-color: var(--ok); background: var(--ok-soft); color: var(--ok)'
                        : ''
                    "
                    :title="optionLetter(opt) === answerKey(q) ? '再点一次取消正确答案' : '点击标为正确答案'"
                    @click="toggleAnswer(q, opt)"
                  >
                    {{ optionLetter(opt) }}
                  </button>
                </div>

                <template v-else>
                  <button
                    v-for="(opt, oi) in q.options"
                    :key="oi"
                    class="btn btn--block"
                    style="justify-content: flex-start; text-align: left; margin-bottom: 6px"
                    :style="
                      optionLetter(opt) === answerKey(q)
                        ? 'border-color: var(--ok); background: var(--ok-soft); color: var(--ok)'
                        : ''
                    "
                    :title="optionLetter(opt) === answerKey(q) ? '再点一次取消正确答案' : '点击标为正确答案'"
                    @click="toggleAnswer(q, opt)"
                  >
                    {{ opt }}
                  </button>
                </template>
                <div class="row">
                  <button class="btn btn--sm" @click="addOption(q)">＋ 添加选项</button>
                  <button
                    v-if="q.options.length"
                    class="btn btn--sm btn--ghost"
                    @click="optionEditing[optionKey(s, qi)] = true"
                  >
                    ✎ 编辑选项文字
                  </button>
                  <span v-if="!q.options.length" class="small muted">
                    本题暂无选项（匹配题、写作、翻译本来就没有选项）
                  </span>
                </div>
              </template>

              <template v-else>
                <div v-for="(opt, oi) in q.options" :key="oi" class="row" style="margin-bottom: 6px">
                  <input
                    v-model="q.options[oi]"
                    class="input"
                    style="flex: 1"
                    :title="opt"
                    :placeholder="`选项 ${oi + 1}`"
                  />
                  <button class="btn btn--sm btn--ghost" @click="q.options.splice(oi, 1)">删除</button>
                </div>
                <div class="row">
                  <button class="btn btn--sm" @click="addOption(q)">＋ 添加选项</button>
                  <button class="btn btn--sm btn--primary" @click="optionEditing[optionKey(s, qi)] = false">
                    完成
                  </button>
                </div>
              </template>
            </div>

            <div class="grid grid-2">
              <div class="field">
                <label class="field__label">参考答案</label>
                <textarea v-model="q.answer" v-autogrow class="textarea" style="min-height: 60px" />
              </div>
              <div class="field">
                <label class="field__label">解析</label>
                <textarea
                  v-model="q.analysis"
                  v-autogrow
                  class="textarea"
                  style="min-height: 60px"
                  placeholder="可留空，作答时自行补充"
                />
              </div>
            </div>
          </div>

          <button class="btn btn--sm" style="margin-top: 10px" @click="addQuestion(s)">＋ 添加题目</button>
        </div>

        <div class="row">
          <button class="btn btn--primary btn--block" :disabled="working" @click="saveParsed">
            保存真题（{{ parsedCount }} 题）并开始练习
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
