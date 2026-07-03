#!/usr/bin/env bash
# PostToolUse(Edit|Write) 훅: 수정된 JS/TS/JSON 파일을 prettier로 정리한다.
# prettier가 해당 패키지에 없으면 조용히 통과 — 절대 실패로 작업을 막지 않는다.
set -u
input=$(cat)
f=$(printf '%s' "$input" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))
except Exception: print("")' 2>/dev/null) || exit 0
[ -z "$f" ] && exit 0
case "$f" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0
( cd "$(dirname "$f")" 2>/dev/null && npx --no-install prettier --write "$f" >/dev/null 2>&1 ) || true
exit 0
