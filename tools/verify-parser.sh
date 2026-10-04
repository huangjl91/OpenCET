#!/usr/bin/env bash
# 回归测试入口（改动切分引擎 / 复习调度 / 错题本 / 教学页 / 桌面壳后必须跑）
#
#   关卡 1  切分规则   tools/paperParser.test.mts          —— 114 条断言：模块切分、词库排布、
#                      答案键、段落标号、Part 级空壳、Directions 误判、PDF 折行误判、写作/翻译拆分、
#                      长篇阅读补选项、显示层判定
#   关卡 2  端到端     tools/pdfExtract.test.mts           —— 15 条断言：真实 PDF → 文本抽取 → 自动切分
#   关卡 3  复习调度   tools/reviewSchedule.test.mts       —— 11 条断言：遗忘曲线按「天」调度的数学
#   关卡 4  复习集成   tools/reviewIntegration.test.mts    —— 10 条断言：驱动真实 mockApi，
#                      模拟「昨晚 22:00 背词 → 今天 10:00 打开」，以及 v1→v2 数据迁移
#   关卡 5  AI 讲解    tools/llmExplain.test.mts           —— 42 条断言：模型各种畸形输出
#                      （代码围栏、前后废话、字段缺失、类型不对、脏缓存）都要兜住
#   关卡 6  错题本     tools/errorbook.test.mts            —— 56 条断言：三种来源的收录/去重/
#                      自动移出/手动归档/删除/清空/筛选/统计口径
#   关卡 7  阅读示范   tools/readingGuide.test.mts         —— 60 条断言：示范内容完整性 +
#                      与题库/真实原文的交叉校验（答案抄错、证据句不存在都会被抓出来）
#   关卡 8  作文方法   tools/writingGuide.test.mts         —— 119 条断言：重点词/金句数据自洽、
#                      逐词默写判定边界、AI 点评 JSON 契约
#   关卡 9  翻译分类   tools/translationCategories.test.mts —— 45 条断言：分类不丢题、
#                      常考词聚合正确、默写题自洽（答案表写错立刻红）
#   关卡 10 写错重写   tools/blankDrill.test.mts           —— 40 条断言：重写只清错的格子、
#                      错题按 id 去重、端到端「改完必须真的变成全对」
#   关卡 11 语言检查   tools/languageCheck.test.mts        —— 40 条断言：拼写 + 语法的判定边界，
#                      以及**站内 146 条范文/词条必须零误报**（这条最重要）
#   关卡 12 模型设置   tools/aiProviders.test.mts          —— 43 条断言：厂商预设地址不能写错、
#                      模型下拉不能吃掉手填的模型名、拉取模型列表的兼容与失败提示
#   关卡 13 常用词汇   tools/translationVocab.test.mts     —— 44 条断言：《翻译常用词汇》数据自洽 +
#                      **英文零拼写错**（拿拼写检查器复核手工整理的内容）
#   关卡 14 换算分     tools/cetScale.test.mts             —— 57 条断言：换算表完整性/单调性/查表边界，
#                      **逐格与 Word 原件比对**（差一格用户估的分就是错的）
#   关卡 15 阅读练习   tools/readingPractice.test.mts      —— 119 条断言：真题阅读切分、**先判题型再按
#                      对应方法讲**（提示词里步骤序列与示范一致）、模型输出不可信时按答案本地重算
#   关卡 16 好词好句   tools/favorites.test.mts            —— 83 条断言：收录去重（同一句多种选法算一条）、
#                      长度边界、脏 localStorage 容错、浮出按钮与汇总页接线
#
# 关卡 2 不能省：规则层单测喂的是「已经带好换行的文本」，只要 PDF 抽取把一整页
# 拼成一行，规则再对也全部失配——旧实现在真实四级整卷上只切出 1 个模块 5 道题，
# 正确答案是 8 个模块 15 道题。
#
# 关卡 4 不能省：它拦的是「时刻 + N 天」这个经典错误——昨晚背的词要等到今晚同一时刻
# 才到期，第二天白天复习队列是空的，用户会以为数据没存上。
#
# 关卡 6 不能省：错题本联通三种来源（翻译 / 真题 / 单词），前后端各一份实现，
# 只测「翻译」一条链路会漏掉真题与单词根本不收录的问题。
#
# 关卡 8/9 不能省：这两页是**教学内容**，最容易出的问题是「和题库/原文对不上」——
# 金句例句自己过不了自己的检查、常考词聚合漏词、分类漏题，都靠这两关拦。
#
# 用法：bash tools/verify-parser.sh
set -e

cd "$(dirname "$0")/.."
ESB="frontend/node_modules/.bin/esbuild"
TSCFG="frontend/tsconfig.json"
mkdir -p .runtime

bundle_run() { # $1=入口  $2=产物
  # .mts 不能直接 node 跑（无扩展名导入会报 ERR_MODULE_NOT_FOUND），必须先 esbuild 打包
  # --external:canvas：pdfjs 在 Node 下缺少 canvas 只会告警，不影响文本抽取
  "$ESB" "$1" --bundle --platform=node --format=esm --outfile="$2" \
    --log-level=warning --external:canvas
  node "$2"
}

echo "════ 关卡 1/16：切分规则回归测试 ════"
bundle_run tools/paperParser.test.mts .runtime/paperParser.test.mjs

echo ""
echo "════ 关卡 2/16：真实 PDF 端到端 ════"
bundle_run tools/pdfExtract.test.mts .runtime/pdfExtract.test.mjs

echo ""
echo "════ 关卡 3/16：复习调度数学 ════"
# 这个用例不依赖别名，可以直接 tsx 跑
npx tsx tools/reviewSchedule.test.mts

echo ""
echo "════ 关卡 4/16：复习调度集成（真实 mockApi）════"
# mock.ts 内部用 @/ 别名，必须指定前端 tsconfig 才能解析
npx tsx --tsconfig "$TSCFG" tools/reviewIntegration.test.mts

echo ""
echo "════ 关卡 5/16：AI 讲解解析健壮性 ════"
npx tsx --tsconfig "$TSCFG" tools/llmExplain.test.mts

echo ""
echo "════ 关卡 6/16：错题本全流程 ════"
npx tsx --tsconfig "$TSCFG" tools/errorbook.test.mts

echo ""
echo "════ 关卡 7/16：阅读示范内容 ════"
npx tsx --tsconfig "$TSCFG" tools/readingGuide.test.mts

echo ""
echo "════ 关卡 8/16：作文方法内容 ════"
npx tsx --tsconfig "$TSCFG" tools/writingGuide.test.mts

echo ""
echo "════ 关卡 9/16：翻译分类与常考词 ════"
npx tsx --tsconfig "$TSCFG" tools/translationCategories.test.mts

echo ""
echo "════ 关卡 10/16：写错重写与错题重练 ════"
npx tsx --tsconfig "$TSCFG" tools/blankDrill.test.mts

echo ""
echo "════ 关卡 11/16：拼写与语法检查 ════"
npx tsx --tsconfig "$TSCFG" tools/languageCheck.test.mts

echo ""
echo "════ 关卡 12/16：模型设置与厂商预设 ════"
npx tsx --tsconfig "$TSCFG" tools/aiProviders.test.mts

echo ""
echo "════ 关卡 13/16：翻译常用词汇表 ════"
npx tsx --tsconfig "$TSCFG" tools/translationVocab.test.mts

echo ""
echo "════ 关卡 14/16：四六级换算分表 ════"
npx tsx --tsconfig "$TSCFG" tools/cetScale.test.mts

echo ""
echo "════ 关卡 15/16：真题阅读练习与 AI 批改 ════"
npx tsx --tsconfig "$TSCFG" tools/readingPractice.test.mts

echo ""
echo "════ 关卡 16/16：好词好句汇总 ════"
npx tsx --tsconfig "$TSCFG" tools/favorites.test.mts

echo ""
echo "✅ 全部回归通过"
