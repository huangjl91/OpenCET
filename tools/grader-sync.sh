#!/usr/bin/env bash
# 双端评分一致性对照：前端 grade.ts ↔ 后端 TranslationGrader.java
#
# 用途：只要改动了翻译评分规则（任一侧），就必须跑这个脚本。
# 两份实现给出的分数一旦分叉，「本地模式」与「连后端」会对同一份译文打出不同分数。
#
# 前置：后端已 `mvn compile`（需要 backend/target/classes 存在）
# 用法：bash tools/grader-sync.sh
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

JAVA_HOME="${JAVA_HOME:?请先设置 JAVA_HOME（JDK 17）}"
JAVAC="$JAVA_HOME/bin/javac"
JAVA="$JAVA_HOME/bin/java"
ESBUILD="$ROOT/frontend/node_modules/.bin/esbuild"

mkdir -p .runtime/javabin

echo "[1/4] 生成用例 + 前端侧结果"
"$ESBUILD" tools/grader-sync.mts --bundle --platform=node --format=esm \
  --outfile=.runtime/grader-sync.mjs --log-level=warning
node .runtime/grader-sync.mjs

echo "[2/4] 编译后端（确保对照的是最新 Java 代码）"
(cd backend && bash "${MAVEN_HOME:-E:/java/maven}/bin/mvn" -o -q compile)

echo "[3/4] 编译并运行后端侧对照"
"$JAVAC" -encoding UTF-8 -cp backend/target/classes -d .runtime/javabin tools/GraderSyncCheck.java
"$JAVA" -Dfile.encoding=UTF-8 -cp ".runtime/javabin;backend/target/classes" GraderSyncCheck

echo "[4/4] 比对"
trailing() { [ -n "$(tail -c 1 "$1")" ] && echo "" >> "$1" || true; }
trailing .runtime/sync-ts.tsv
trailing .runtime/sync-java.tsv
if diff -q .runtime/sync-ts.tsv .runtime/sync-java.tsv >/dev/null; then
  echo "✅ 双端评分完全一致（$(grep -c . .runtime/sync-ts.tsv) 条用例）"
else
  echo "❌ 双端评分存在差异："
  diff .runtime/sync-ts.tsv .runtime/sync-java.tsv | head -40
  exit 1
fi
