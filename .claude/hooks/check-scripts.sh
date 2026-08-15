#!/bin/bash
# PostToolUse (Edit|Write)：assets/scripts 下的 .ts 被改动后——
# 1) 打标记，等 Stop hook 统一跑 type-check；
# 2) 若改的是 core/，立即检查平台无关约束（禁止 tt./wx./cc. 依赖）。
set -u
input=$(cat)

fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$fp" in
  */assets/scripts/*.ts) ;;
  *) exit 0 ;;
esac

root=$(git -C "$(dirname "$fp")" rev-parse --show-toplevel 2>/dev/null) || root="${CLAUDE_PROJECT_DIR:-}"
if [ -n "$root" ]; then
  mkdir -p "$root/temp" && touch "$root/temp/.claude-needs-typecheck"
fi

case "$fp" in
  */assets/scripts/core/*)
    viol=$(grep -nE "(^|[^A-Za-z0-9_.\$])(tt|wx|cc)\.|from ['\"]cc['\"]" "$fp" 2>/dev/null | head -10)
    if [ -n "$viol" ]; then
      {
        echo "⛔ core/ 必须平台无关（三端共用），检测到疑似平台 API 依赖（tt./wx./cc.）："
        echo "$viol"
        echo "平台能力请下沉到 platform/ 适配层，画面操作走 components/。若是注释里的误报可忽略并说明。"
      } >&2
      exit 2
    fi
    ;;
esac
exit 0
