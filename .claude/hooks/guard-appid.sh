#!/bin/bash
# PreToolUse (Edit|Write)：拦截把新 AppID 写进 project.config.json。
# 规则：appid 只能保持 git HEAD 里已提交的占位值；真实 AppID 走 project.private.config.json（已 gitignore）。
set -u
input=$(cat)

fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
case "$fp" in
  */project.config.json) ;;
  *) exit 0 ;;
esac

new_content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
new_id=$(printf '%s' "$new_content" | grep -oE '"appid"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/')
[ -z "$new_id" ] && exit 0

root=$(git -C "$(dirname "$fp")" rev-parse --show-toplevel 2>/dev/null) || exit 0
rel=${fp#"$root"/}
cur_id=$(git -C "$root" show "HEAD:$rel" 2>/dev/null | jq -r '.appid // empty')

if [ "$new_id" != "$cur_id" ]; then
  {
    echo "⛔ 拦截：不要把新 AppID 写进 $rel（当前提交值：${cur_id:-<无>}，尝试写入：$new_id）。"
    echo "真实 AppID 属于本地私有配置，请写到 project.private.config.json（已在 .gitignore）。"
    echo "如确实要更换占位值，请让用户确认后再操作。"
  } >&2
  exit 2
fi
exit 0
