<script setup lang="ts">
import { ref } from 'vue'
import { isLocalMode } from '@/api'
import { useUserStore } from '@/stores/user'
import { clearAllLocal } from '@/utils/storage'
import type { Level } from '@/types'

const store = useUserStore()
const localMode = isLocalMode()

const nickname = ref(store.profile.nickname)
const dailyGoal = ref(store.profile.dailyGoal)
const reviewGoal = ref(store.profile.reviewGoal)
const saving = ref(false)
const msg = ref('')

async function save() {
  saving.value = true
  msg.value = ''
  try {
    await store.updateSettings({
      nickname: nickname.value,
      dailyGoal: Number(dailyGoal.value),
      reviewGoal: Number(reviewGoal.value),
    })
    msg.value = '已保存'
  } finally {
    saving.value = false
  }
}

async function setLevel(l: Level) {
  await store.setLevel(l)
  msg.value = '已切换为 ' + (l === 'CET4' ? '四级' : '六级')
}

/** 导出全部本地数据 */
function exportData() {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('opencet.')) data[k] = localStorage.getItem(k)
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `opencet-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function importData(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as Record<string, string>
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v))
      msg.value = '导入成功，正在刷新…'
      setTimeout(() => location.reload(), 800)
    } catch {
      msg.value = '导入失败：文件格式不正确'
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function resetAll() {
  if (!confirm('将清空本机全部学习数据（单词进度、打卡、真题、错题、AI 设置），确定继续？')) return
  clearAllLocal()
  location.reload()
}

const dbSize = (() => {
  let n = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('opencet.')) n += (localStorage.getItem(k) ?? '').length
  }
  return (n / 1024).toFixed(1)
})()
</script>

<template>
  <div>
    <h1 class="page-title">设置</h1>
    <p class="page-sub">备考等级、每日目标量与本地数据管理</p>

    <div class="card">
      <div class="card__title">备考等级</div>
      <div class="segmented">
        <button class="segmented__item" :class="{ 'is-active': store.level === 'CET4' }" @click="setLevel('CET4')">
          英语四级 CET-4
        </button>
        <button class="segmented__item" :class="{ 'is-active': store.level === 'CET6' }" @click="setLevel('CET6')">
          英语六级 CET-6
        </button>
      </div>
      <p class="tiny muted" style="margin: 10px 0 0">
        四级与六级为两套独立词库与题库，切换后进度互不影响。
      </p>
    </div>

    <div class="card">
      <div class="card__title">学习设置</div>
      <div class="field">
        <label class="field__label">昵称</label>
        <input v-model="nickname" class="input" />
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field__label">每日新学目标（词）</label>
          <input v-model.number="dailyGoal" class="input" type="number" min="5" max="200" />
        </div>
        <div class="field">
          <label class="field__label">每日复习上限（词）</label>
          <input v-model.number="reviewGoal" class="input" type="number" min="10" max="300" />
        </div>
      </div>
      <div class="row">
        <button class="btn btn--primary" :disabled="saving" @click="save">保存</button>
        <span v-if="msg" class="small" style="color: var(--ok)">{{ msg }}</span>
      </div>
    </div>

    <div class="card">
      <div class="card__title">数据存储</div>
      <div class="row small muted" style="gap: 14px">
        <span>运行模式：{{ localMode ? '本地模式（浏览器 localStorage）' : '已连接后端（MySQL + Redis）' }}</span>
        <span>本机占用：约 {{ dbSize }} KB</span>
      </div>
      <p class="tiny muted" style="margin: 10px 0 14px">
        本站为免注册设计：浏览器首次访问生成随机 Token 写入 localStorage，
        {{ localMode ? '学习数据全部保存在本机浏览器' : '后端按该 Token 自动建档，数据落库并可用 Redis 加速' }}。
        AI 的 API Key 只保存在本机，请求直连模型服务商，不经过服务器。
      </p>
      <div class="row">
        <button class="btn" @click="exportData">导出备份</button>
        <label class="btn" style="cursor: pointer">
          导入备份
          <input type="file" accept=".json" style="display: none" @change="importData" />
        </label>
        <span class="spacer" />
        <button class="btn btn--danger" @click="resetAll">清空全部数据</button>
      </div>
    </div>

    <div class="card">
      <div class="card__title">使用说明</div>
      <ol class="small" style="margin: 0; padding-left: 20px; line-height: 2">
        <li><b>背单词</b>：选等级 → 每日定量 → 「认识 / 模糊 / 不认识」三档反馈，系统按艾宾浩斯遗忘曲线安排复习。</li>
        <li><b>翻译练习</b>：按等级与难度筛题 → 提交译文 → 查看评分、参考答案、核心词汇与语法点；低于 70 分自动进错题本。</li>
        <li><b>真题拆解</b>：粘贴或上传整套真题 → 自动切分成听力 / 阅读 / 选词填空 / 翻译 / 写作 → 再切到单题 → 逐题作答、收藏、标记完成。</li>
        <li><b>AI 问答</b>：在设置里填 Base URL / 模型 / API Key，可挂载当前单词或题目作为上下文提问。</li>
      </ol>
    </div>
  </div>
</template>
