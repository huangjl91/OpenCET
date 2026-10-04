#!/usr/bin/env bash
# 启动后端 + 前端生产预览（4173 已配 preview.proxy -> 8080），并在同一次调用内完成断言。
# 注意：沙箱会在 Bash 调用结束时回收后台进程，因此必须在本脚本内完成验证。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL_HOME="${MYSQL_HOME:?请先设置 MYSQL_HOME 指向本机 MySQL 安装目录}"
JAVA_HOME="${JAVA_HOME:-E:/java/jdk17}"
MAVEN_HOME="${MAVEN_HOME:-E:/java/maven}"
export JAVA_HOME MAVEN_HOME
APP_PORT=8080
PREVIEW_PORT=4173

echo "=== [1/4] MySQL ==="
if ! "$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping >/dev/null 2>&1; then
  mkdir -p "$ROOT/.runtime"
  nohup "$MYSQL_HOME/bin/mysqld" --datadir="$(cygpath -w "$ROOT/.runtime/mysqldata")" \
    --port=3306 --bind-address=127.0.0.1 --console > "$ROOT/.runtime/mysqld.log" 2>&1 &
  disown
  for i in $(seq 1 60); do
    "$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping >/dev/null 2>&1 && break
    sleep 1
  done
fi
"$MYSQL_HOME/bin/mysqladmin" -h 127.0.0.1 -uroot -proot ping >/dev/null 2>&1 \
  && echo "MySQL OK (3306)" || echo "MySQL DOWN"

echo "=== [2/4] 后端 ==="
if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/user/profile" -H 'X-User-Token: probe')" = "000" ]; then
  export SERVER_PORT=$APP_PORT
  unset PORT || true
  cd "$ROOT/backend"
  nohup bash "$MAVEN_HOME/bin/mvn" -q spring-boot:run \
    -Dspring-boot.run.arguments="--server.port=$APP_PORT" > "$ROOT/.runtime/backend.log" 2>&1 &
  disown
  for i in $(seq 1 180); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/user/profile" -H 'X-User-Token: probe')" != "000" ] && break
    sleep 2
  done
fi
echo "后端 /api/user/profile -> $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/user/profile" -H 'X-User-Token: probe')"

echo "=== [3/4] 前端生产预览 ==="
cd "$ROOT/frontend"
if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PREVIEW_PORT/")" != "200" ]; then
  nohup npx vite preview --port $PREVIEW_PORT --host > "$ROOT/.runtime/preview.log" 2>&1 &
  disown
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PREVIEW_PORT/")" = "200" ] && break
    sleep 1
  done
fi
echo "前端 / -> $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PREVIEW_PORT/")"

echo "=== [4/4] 经前端代理断言后端数据 ==="
echo "代理 /api/stats/overview:"
curl -s -H "X-User-Token: launch-$(date +%s)" "http://127.0.0.1:$PREVIEW_PORT/api/stats/overview" | head -c 260; echo
echo "代理 /api/words?level=CET4 条数:"
curl -s -H "X-User-Token: launch-1" "http://127.0.0.1:$PREVIEW_PORT/api/words?level=CET4" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const j=JSON.parse(s);const arr=j.data?.list||j.data||j;console.log(Array.isArray(arr)?arr.length:'非数组');}
  catch(e){console.log('解析失败:',s.slice(0,150))}})"
echo "LAUNCH_DONE preview=http://localhost:$PREVIEW_PORT"
