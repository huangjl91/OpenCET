#!/usr/bin/env bash
# 一次性全栈冒烟：起 MySQL -> 灌 data.sql -> 起后端 -> 起前端预览 -> 断言接口
# 注意：WorkBuddy 沙箱每次 Bash 调用结束会回收后台进程，因此必须在同一次调用内跑完。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL_HOME="${MYSQL_HOME:?请先设置 MYSQL_HOME 指向本机 MySQL 安装目录}"
MYSQL_DATA="$ROOT/.runtime/mysqldata"
MYSQL_LOG="$ROOT/.runtime/mysqld.log"
APP_PORT=8080

echo "=== [1/5] 准备 MySQL 数据目录 ==="
mkdir -p "$ROOT/.runtime"
if [ ! -d "$MYSQL_DATA/mysql" ]; then
  "$MYSQL_HOME/bin/mysqld" --initialize-insecure --datadir="$(cygpath -w "$MYSQL_DATA" 2>/dev/null || echo "$MYSQL_DATA")" > "$MYSQL_LOG" 2>&1 \
    || { echo "初始化失败，日志尾部:"; tail -20 "$MYSQL_LOG"; exit 1; }
fi

echo "=== [2/5] 启动 MySQL (3306) ==="
if ! "$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping >/dev/null 2>&1; then
  nohup "$MYSQL_HOME/bin/mysqld" --datadir="$(cygpath -w "$MYSQL_DATA" 2>/dev/null || echo "$MYSQL_DATA")" \
    --port=3306 --bind-address=127.0.0.1 --console > "$MYSQL_LOG" 2>&1 &
  disown
fi
for i in $(seq 1 60); do
  "$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping >/dev/null 2>&1 && break
  sleep 1
done
"$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping || { echo "MySQL 起不来"; tail -20 "$MYSQL_LOG"; exit 1; }
echo "MySQL OK"

echo "=== [3/5] 建库 + 灌入最新数据 ==="
"$MYSQL_HOME/bin/mysql" -h 127.0.0.1 -uroot -proot < "$ROOT/backend/src/main/resources/db/schema.sql"
"$MYSQL_HOME/bin/mysql" -h 127.0.0.1 -uroot -proot opencet < "$ROOT/backend/src/main/resources/db/data.sql"
"$MYSQL_HOME/bin/mysql" -h 127.0.0.1 -uroot -proot opencet -e \
  "SELECT level, COUNT(*) AS cnt FROM word GROUP BY level;"

echo "=== [4/5] 启动后端 (${APP_PORT}) ==="
export JAVA_HOME="${JAVA_HOME:-E:/java/jdk17}"
export MAVEN_HOME="${MAVEN_HOME:-E:/java/maven}"
export SERVER_PORT=$APP_PORT
unset PORT || true
cd "$ROOT/backend"
nohup bash "$MAVEN_HOME/bin/mvn" -q spring-boot:run \
  -Dspring-boot.run.arguments="--server.port=$APP_PORT" > "$ROOT/.runtime/backend.log" 2>&1 &
disown
for i in $(seq 1 180); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/user/profile" -H "X-User-Token: smoke-$RANDOM")
  [ "$code" != "000" ] && break
  sleep 2
done
echo "后端状态码: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/user/profile" -H 'X-User-Token: smoke-token')"

echo "=== [5/5] 接口断言 ==="
TOKEN="smoke-$(date +%s)"
echo "-- /api/user/profile --"
curl -s -H "X-User-Token: $TOKEN" "http://127.0.0.1:$APP_PORT/api/user/profile" | head -c 300; echo
echo "-- /api/stats/overview --"
curl -s -H "X-User-Token: $TOKEN" "http://127.0.0.1:$APP_PORT/api/stats/overview" | head -c 400; echo
echo "-- /api/words?level=CET4 数量 --"
curl -s -H "X-User-Token: $TOKEN" "http://127.0.0.1:$APP_PORT/api/words?level=CET4" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const j=JSON.parse(s);const arr=j.data?.list||j.data||j;
  console.log('CET4 返回条数:', Array.isArray(arr)?arr.length:'非数组');
  if(Array.isArray(arr)&&arr[0]) console.log('首词:', arr[0].word, arr[0].phonetic, arr[0].meaning);
  }catch(e){console.log('解析失败:', s.slice(0,200))}
})"
echo "-- /api/words?level=CET6 数量 --"
curl -s -H "X-User-Token: $TOKEN" "http://127.0.0.1:$APP_PORT/api/words?level=CET6" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const j=JSON.parse(s);const arr=j.data?.list||j.data||j;
  console.log('CET6 返回条数:', Array.isArray(arr)?arr.length:'非数组');
  }catch(e){console.log('解析失败:', s.slice(0,200))}
})"
echo "-- 末词 zoom 是否入库 --"
"$MYSQL_HOME/bin/mysql" -h 127.0.0.1 -uroot -proot opencet -N -e \
  "SELECT level, word, phonetic, meaning FROM word WHERE word IN ('zoom','absolute','abandon') ORDER BY level, word;"
echo "SMOKE_DONE"
