import type { Directive } from 'vue'

/**
 * 让 textarea 的高度自动跟随内容，长文本不再出现内部滚动条。
 *
 * 导入预览页里阅读理解的原文动辄两三千字，固定高度的输入框只能靠滚动条查看，
 * 核对切分结果时根本没法一眼读完；题干也一样。这个指令把高度设成内容实际高度，
 * 文本多长、框就多高。
 */
function resize(el: HTMLTextAreaElement): void {
  // 先归零再量，否则删除内容时高度不会回缩
  el.style.height = 'auto'
  const border = el.offsetHeight - el.clientHeight
  const next = el.scrollHeight + border
  // 元素还没上屏（display:none / 未挂载）时量出来是 0，跳过避免塌成一条线
  if (next > 0) el.style.height = `${next}px`
}

const teardown = new WeakMap<HTMLTextAreaElement, () => void>()

export const vAutogrow: Directive<HTMLTextAreaElement> = {
  mounted(el) {
    resize(el)
    const onInput = () => resize(el)
    // 窗口宽度变化会让文本重排，高度得跟着重算
    const onResize = () => resize(el)
    el.addEventListener('input', onInput)
    window.addEventListener('resize', onResize)
    teardown.set(el, () => {
      el.removeEventListener('input', onInput)
      window.removeEventListener('resize', onResize)
    })
  },
  updated(el) {
    resize(el)
  },
  unmounted(el) {
    teardown.get(el)?.()
    teardown.delete(el)
  },
}
