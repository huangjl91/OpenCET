/**
 * 阅读批改的模型调用。
 *
 * 与 llmWriting 一样是「薄封装」：拼提示词、调 chat、解析 JSON 都在别处，
 * 这里只负责发请求并把模型输出交给解析器。
 */
import { chat } from './ai'
import {
  buildJudgeMessages,
  parseJudgeResult,
  type JudgeResult,
  type ReadingPart,
} from './readingPractice'

/**
 * 批改一整个阅读部分（一次请求覆盖该部分全部题目）。
 *
 * 整部分一起问而不是一题一次：段落匹配的十道题共用同一篇原文，
 * 分开问会把上千词的原文重复传十遍。
 */
export async function llmJudgeReading(
  part: ReadingPart,
  answers: Record<number, string>
): Promise<JudgeResult[]> {
  const reply = await chat(buildJudgeMessages(part, answers))
  const list = parseJudgeResult(reply, part, answers)

  // 一条答案都没解析出来，说明模型没按约定的 JSON 格式回。
  // 与其在界面上显示一排「正确答案 —」，不如直接说清楚并给出可操作的下一步。
  if (!list.some((r) => r.correctAnswer)) {
    throw new Error(
      '模型没按格式返回批改结果，可以重试一次，或在「模型设置」里换一个模型。' +
        '原始回复：' +
        reply.slice(0, 120)
    )
  }
  return list
}
