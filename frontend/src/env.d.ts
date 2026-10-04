/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// mammoth 浏览器包无自带类型声明
declare module 'mammoth/mammoth.browser.js' {
  export function extractRawText(opts: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
  export function convertToHtml(opts: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
}

interface ImportMetaEnv {
  /** true = 纯本地模式（数据存 localStorage，不请求后端）；false = 走 Spring Boot API */
  readonly VITE_USE_MOCK?: string
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
