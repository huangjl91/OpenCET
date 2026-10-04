#!/usr/bin/env bash
# 翻译评分引擎三道验证关卡（改动评分规则 / 核心词后必须全绿再交付）
#
#   1. 规则回归测试   tools/grade.test.mts          —— 25 条断言，覆盖词形还原 / 语序 / 拼写 / 冗余 / 规范 / 边界
#   2. 题库自检       tools/translations.selfcheck.mts —— 用「参考译文自己作答」，每题必须 100 分且核心词全命中
#   3. 双端一致性对照 tools/grader-sync.sh           —— 前端 grade.ts ↔ 后端 TranslationGrader.java 逐字段 diff
#
# 关卡 2 是公平性底线：核心词在标准答案里都匹配不上 = 学生译对也扣分。
# 关卡 3 防双实现分叉：两份实现给同一份译文打分必须完全一致。
#
# 用法：bash tools/verify-grader.sh
set -e

cd "$(dirname "$0")/.."
ESB="frontend/node_modules/.bin/esbuild"
mkdir -p .runtime

bundle_run() { # $1=入口  $2=产物
  "$ESB" "$1" --bundle --platform=node --format=esm --outfile="$2" --log-level=warning
  node "$2"
}

echo "════ 关卡 1/3：规则回归测试 ════"
bundle_run tools/grade.test.mts .runtime/grade.test.mjs

echo ""
echo "════ 关卡 2/3：题库自检（参考译文必须满分）════"
# 注意：这里用 node 直跑 .mts 会因「无扩展名导入」报 ERR_MODULE_NOT_FOUND，必须先 esbuild 打包
bundle_run tools/translations.selfcheck.mts .runtime/selfcheck.mjs

echo ""
echo "════ 关卡 3/3：前后端评分一致性对照 ════"
bash tools/grader-sync.sh

echo ""
echo "✅ 三道关卡全部通过"
