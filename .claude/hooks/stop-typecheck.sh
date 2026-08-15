#!/bin/bash
# Stop：本回合改过 assets/scripts 下的 .ts 时（由 check-scripts.sh 打标记），
# 结束前强制跑一次 npm run type-check，未通过则阻止结束并把错误喂回。
set -u
input=$(cat)

# 防死循环：上一次 Stop 已被本 hook 拦截过则直接放行
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
flag="$root/temp/.claude-needs-typecheck"
[ -f "$flag" ] || exit 0

if [ ! -f "$root/temp/tsconfig.cocos.json" ]; then
  rm -f "$flag"
  echo '{"systemMessage":"⚠️ 已跳过 type-check：temp/tsconfig.cocos.json 不存在（需先用 Cocos 打开或构建过工程）"}'
  exit 0
fi

if ! out=$(cd "$root" && npm run type-check 2>&1); then
  {
    echo "⛔ type-check 未通过，请修复以下错误后再结束回合："
    printf '%s\n' "$out" | tail -40
  } >&2
  exit 2
fi

rm -f "$flag"
exit 0
