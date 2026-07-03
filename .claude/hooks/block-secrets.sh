#!/usr/bin/env bash
# PreToolUse(Bash) 훅: 파괴적 명령과 시크릿 값 노출을 차단한다.
# 원칙: 패턴이 명확할 때만 차단(exit 2), 그 외 무엇이든(파싱 실패 포함) 통과(exit 0, fail-open).
# 여기서 막는 것들은 정상 작업에선 쓸 일이 없어 오탐으로 세션을 막지 않는다.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

block() { echo "🚫 block-secrets: $1 (의도한 명령이면 훅을 잠깐 끄고 실행하세요)" >&2; exit 2; }

# 1) 루트/홈을 지우는 rm
printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+(/|~|/\*|\$HOME)([[:space:]]|$)' \
  && block "루트/홈 대상 rm 차단"
# 2) fork bomb
printf '%s' "$cmd" | grep -q ':(){' && block "fork bomb 차단"
# 3) 시크릿 환경변수를 화면에 출력
printf '%s' "$cmd" | grep -Eq '(echo|printf|print[a-z]*)[^|;&]*\$\{?(DATABASE_URL|JWT_SECRET)' \
  && block "시크릿 환경변수 출력 차단"
# 4) .env 파일 통째 출력 (.env.example / *.env.local 은 허용)
printf '%s' "$cmd" | grep -Eq '(cat|less|more|head|tail|bat)[[:space:]][^|;&]*(^|/| )\.env([[:space:]"'"'"';|&]|$)' \
  && block ".env 통째 출력 차단 (.env.example은 허용)"

exit 0
