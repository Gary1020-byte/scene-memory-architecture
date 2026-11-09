#!/usr/bin/env bash
# Gatekeeping acceptance —— proves "what should be blocked gets blocked, what should wait does
# wait, what should report an error does report an error"
#
# Usage: bash gate-acceptance.sh [--skip-engine-tests]
#
# ★ Why this script exists:
#   "a busy scene gets an explicit rejection", "a receipt claim mismatch gets blocked" and
#   "auto-advance stops in the right place" —— these three things cannot be seen by reading the
#   code. They have to really run, and **when they are deliberately broken they really have to
#   be blocked**.
#
# It verifies eight things:
#   G1 claim check: carries its own id → let through
#   G2 claim check: carries another id → blocked
#   G3 claim check: carries no id at all → blocked (new format) / let through (old format)
#   G4 state file round-trip: the run id and the current step are read back (one word off and
#      they become undefined)
#   G5 the produced dispatch carries a unique dispatch id and asks the scene to report it
#   G6 ★ the scene really is busy ⇒ explicit rejection (exit code 4, the reason is written, no receipt file)
#   G7 ★ the scene was busy until the timeout and is then let through ⇒ wait until it is idle
#      and then send, exit code 0
#   G8 ★ the reply carries another dispatch id ⇒ judged a mismatch, rejected, exit code 4, no receipt file
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$(mktemp -d)"
WB="$WORK/wb"
EX="$HERE/run-workflow.mjs"
# ★ The path segments under $HOME/.DSH/工作台/ stay Chinese —— they are the real machine's layout.
DISPATCH_TOOL="${DSH_DISPATCH_TOOL:-$HOME/.DSH/工作台/工具/派單.mjs}"

SKIP_ENGINE=0
[ "${1:-}" = "--skip-engine-tests" ] && SKIP_ENGINE=1

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; echo "$2" | sed 's/^/     /' | head -10; fail=$((fail+1)); }
expect_eq() {  # expect_eq <description> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected "$3", got "$2""; fi
}
expect_has() {  # expect_has <description> <text> <keyword>
  if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1" "output does not contain "$3""; fi
}

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "═══ Gatekeeping Acceptance: it must fail when it should ═══"
echo

# ═══════════════════════ pure logic tests (no engine needed) ═══════════════════════

echo "【G1–G3】receipt claim check (a pure function)"
cat > "$WORK/claim-test.mjs" <<'EOF'
import fs from 'node:fs'
const src = fs.readFileSync(process.argv[2], 'utf8')
const i = src.indexOf('export function claimCheck')
// ★ The marker below lives in the external dispatch tool, which is not translated.
const j = src.indexOf('/* ───────────────────────── 派單格式', i)
if (i < 0 || j < 0) { console.log('SLICE_FAIL'); process.exit(9) }
const mod = src.slice(i, j).replace('export function claimCheck', 'function claimCheck') + '\nexport { claimCheck }\n'
fs.writeFileSync(process.argv[3] + '/claim-lib.mjs', mod)
const { claimCheck } = await import(process.argv[3] + '/claim-lib.mjs')
const cases = [
  ['carries its own id', '派單 id：dispatch-abc-步1-x9y\n內容', 'dispatch-abc-步1-x9y', {}, true],
  ['carries another id', '派單 id：dispatch-zzz-步2-q1w\n內容', 'dispatch-abc-步1-x9y', {}, false],
  ['★ mentions two ids, but the first declaration is the other one', '派單 id：dispatch-zzz-步2-q1w\n另外這張是 dispatch-abc-步1-x9y', 'dispatch-abc-步1-x9y', {}, false],
  ['★ mentions two ids, the first declaration is its own (the other one later does not matter)', '派單 id：dispatch-abc-步1-x9y\n另一張是 dispatch-zzz-步2-q1w', 'dispatch-abc-步1-x9y', {}, true],
  ['carries no id at all (strict)', '沒有任何 id 的回覆', 'dispatch-abc-步1-x9y', {}, false],
  ['carries no id at all (old format)', '沒有任何 id 的回覆', 'dispatch-abc-步1-x9y', { strict: false }, true],
  ['empty reply', '', 'dispatch-abc-步1-x9y', {}, false],
]
let pass = 0
for (const [name, reply, id, opts, expectOk] of cases) {
  const r = claimCheck(reply, id, opts)
  const good = r.ok === expectOk
  if (good) pass++
  console.log((good ? 'PASS' : 'FAIL') + '|' + name + '|' + r.reason)
}
console.log('TOTAL|' + pass + '/' + cases.length)
EOF
CLAIM_OUT="$(node "$WORK/claim-test.mjs" "$DISPATCH_TOOL" "$WORK" 2>&1)"
CLAIM_TOTAL="$(echo "$CLAIM_OUT" | grep -o 'TOTAL|.*' | cut -d'|' -f2)"
if echo "$CLAIM_OUT" | grep -q '^FAIL|'; then
  bad "the claim check cases" "$CLAIM_OUT"
else
  ok "all 7 claim check cases are correct ($CLAIM_TOTAL)"
fi
# Reverse check: the error message for another id must clearly say "the declared id is a
# different one" (not the vague "no id found")
if echo "$CLAIM_OUT" | grep 'carries another id' | grep -qE '第一個宣告的派單 id 是|別張派單的 id'; then
  ok "the error message for another id clearly points at the other id (not a vague \"no id found\")"
else
  bad "the error message for another id" "$CLAIM_OUT"
fi
echo

echo "【G4】state file round-trip: the run id and the current step are read back"
cp -r "$ROOT/04-templates/demo-workbench.clean" "$WB"
mkdir -p "$WB/workflows"
cat > "$WB/workflows/roundtrip.yaml" <<'EOF'
id: roundtrip
name: roundtrip
version: 1
steps:
  - scene: demo-scene
    purpose: do one thing
    criteria: there is a clear criterion
    output: scenes/demo-scene/project-memory/x.md
    needsConfirmation: false
EOF
START_OUT="$(node "$EX" start --root "$WB" --workflow roundtrip 2>&1)"
RUN_ID="$(echo "$START_OUT" | grep -o 'run id：.*' | cut -d'：' -f2)"
if [ -n "$RUN_ID" ]; then ok "start produced a run id: $RUN_ID"; else bad "start produced a run id" "$START_OUT"; fi

# Read the state file once more (step → writeState → read again) to see whether the run id
# turns into undefined
node "$EX" step --root "$WB" --run "$RUN_ID" >/dev/null 2>&1
STATE_MD="$WB/runs/$RUN_ID/execution-state.md"
if grep -q "^- Run ID: $RUN_ID" "$STATE_MD"; then
  ok "the run id is written to the state file and read back (not undefined)"
else
  bad "run id round-trip" "$(grep '^- Run ID' "$STATE_MD")"
fi
if grep -qE '^- Current Step: [0-9]+' "$STATE_MD"; then
  ok "the current step is written to the state file and is a number (not undefined)"
else
  bad "current step round-trip" "$(grep '^- Current Step' "$STATE_MD")"
fi
STATUS_OUT="$(node "$EX" status --root "$WB" --run "$RUN_ID" 2>&1)"
if echo "$STATUS_OUT" | grep -q 'Current step: undefined'; then
  bad "status reads the current step" "$STATUS_OUT"
else
  ok "status reads the current step and it is not undefined"
fi
echo

echo "【G5】the produced dispatch carries a unique dispatch id and asks the scene to report it"
STEP_OUT="$(node "$EX" step --root "$WB" --run "$RUN_ID" 2>&1)"
DISPATCH_FILE="$WB/runs/$RUN_ID/receipts/dispatch-1.md"
if [ -f "$DISPATCH_FILE" ]; then
  DID="$(grep -o 'Dispatch ID: dispatch-[^ ]*' "$DISPATCH_FILE" | head -1 | cut -d' ' -f3)"
  if [ -n "$DID" ] && [ "$DID" != "dispatch-undefined-step1" ]; then
    ok "the dispatch carries a unique id: $DID"
  else
    bad "the dispatch id" "$(grep 'Dispatch ID' "$DISPATCH_FILE")"
  fi
  if grep -q "The \*\*first line\*\* of the receipt" "$DISPATCH_FILE" && grep -q "Dispatch ID: $DID" "$DISPATCH_FILE"; then
    ok "the dispatch asks the scene to report the dispatch id on the first line of the receipt"
  else
    bad "the dispatch does not ask for the id" "$(cat "$DISPATCH_FILE")"
  fi
  # Two productions must yield different ids (otherwise the claim check misjudges)
  node "$EX" step --root "$WB" --run "$RUN_ID" >/dev/null 2>&1
  DID2="$(grep -o 'Dispatch ID: dispatch-[^ ]*' "$DISPATCH_FILE" | head -1 | cut -d' ' -f3)"
  if [ -n "$DID2" ] && [ "$DID" != "$DID2" ]; then
    ok "producing the dispatch again gives a new id ($DID → $DID2)"
  else
    bad "the dispatch id is not unique" "$DID vs $DID2"
  fi
else
  bad "the dispatch file was not produced" "$STEP_OUT"
fi
echo

# ═══════════════════════ tests that need the real engine ════════════════════════

if [ "$SKIP_ENGINE" = "1" ]; then
  echo "【G6–G8】skipped (--skip-engine-tests)"
  echo
else
  if [ ! -f "$DISPATCH_TOOL" ]; then
    echo "【G6–G8】skipped: cannot find the dispatch tool $DISPATCH_TOOL"
    echo
  else
    SCENE="知識庫"
    # ★ 場景/ stays Chinese —— it is the real machine's directory name.
    SCENE_DIR="$HOME/.DSH/工作台/場景/$SCENE"
    if [ ! -d "$SCENE_DIR" ]; then
      echo "【G6–G8】skipped: cannot find the scene directory $SCENE_DIR"
      echo
    else
      # Find the session id of that scene
      # ★ 外殼/ stays Chinese —— it is the real machine's directory name.
      SID="$(node -e "
const fs=require('fs');const p='$HOME/.DSH/工作台/外殼/scenarios';
for(const f of fs.readdirSync(p)){if(!f.endsWith('.json')||f.startsWith('_'))continue;
const j=JSON.parse(fs.readFileSync(p+'/'+f,'utf8'));
if(j&&j.name==='$SCENE'&&!j.view){const s=(j.panels||[]).find(x=>x.sessionId);if(s){console.log(s.sessionId);break}}}
")"
      if [ -z "$SID" ]; then
        echo "【G6–G8】skipped: cannot find the session id of scene $SCENE"
        echo
      else
        echo "【G6–G8】engine-side tests (scene: $SCENE, session ${SID:0:16}…)"

        # Make a real dispatch file (handwritten, with the id field and the self-report request)
        mk_dispatch() {  # mk_dispatch <path> <id> <what>
          cat > "$1" <<EOF
# 派單 · 守門驗收

【$SCENE · 派單 · 請回執】

- 派單 id：$2
- 發起方：主控端
- 收件方：$SCENE

做什麼：
  $3

判據：
  回覆第一行原樣寫出「派單 id：$2」

回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「差異集合」
  ③ 必須帶「可累積物」
  ④ 必須寫明「下一棒」
  ⑤ ★ 回執的**第一行**必須原樣寫出下面這行：
     派單 id：$2
EOF
        }

        # ── G8: the reply carries another dispatch id ⇒ it must be judged a mismatch,
        #    rejected, exit code 4 ──
        #   ★ The design point: the dispatch "header" carries its own id (for the claim
        #     mechanism), but the "instructions in the body" all point at another id.
        #     The scene then replies with that other id —— exactly the "A got B's receipt"
        #     situation.
        #     (Do not leave contradictory instructions in the body: the scene would judge for
        #     itself and pick the right one, and the test would prove nothing.)
        echo "  ── G8 the reply carries another dispatch id ⇒ it must be rejected"
        MY_ID="dispatch-守門驗收-mine-1111"
        OTHER_ID="dispatch-守門驗收-OTHER-9999"
        cat > "$WORK/g8.md" <<EOF
# 派單 · 守門驗收

【$SCENE · 派單 · 請回執】

- 派單 id：$MY_ID
- 發起方：主控端
- 收件方：$SCENE

做什麼：
  請只回一行『收到』。

判據：
  回覆的第一行必須原樣寫出下面這行（照抄，不要改）：
  派單 id：$OTHER_ID

回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「差異集合」
  ③ 必須帶「可累積物」
  ④ 必須寫明「下一棒」
  ⑤ ★ 回執的**第一行**必須原樣寫出下面這行：
     派單 id：$OTHER_ID
EOF
        set +e
        # ★ The flags of the external dispatch tool stay Chinese.
        G8_OUT="$(node "$DISPATCH_TOOL" 送 --檔 "$WORK/g8.md" --收件 "$SCENE" --等場景秒數 60 2>&1)"
        G8_RC=$?
        set -e
        expect_eq "G8 exit code = 4 (a mismatch must report an error, not pretend to succeed)" "$G8_RC" "4"
        expect_has "G8 output says the receipt is a mismatch" "$G8_OUT" "回執疑似錯配"
        if [ ! -f "$WORK/g8.回執.md" ]; then
          ok "G8 did not write the wrong reply into a receipt file"
        else
          bad "G8 wrote a receipt file despite the mismatch" "content: $(cat "$WORK/g8.回執.md")"
        fi
        # The state file must record it too
        if [ -f "$WORK/g8.狀態.json" ]; then
          ST="$(cat "$WORK/g8.狀態.json")"
          if echo "$ST" | grep -q '回執疑似錯配'; then
            ok "G8 status file records \"回執疑似錯配\" plus the reason"
          else
            bad "G8 status file did not record the mismatch" "$ST"
          fi
        else
          bad "G8 status file was not produced" ""
        fi
        echo

        # ── G6: the scene really is busy ⇒ it must be explicitly rejected ──
        echo "  ── G6 the scene really is busy ⇒ it must be explicitly rejected (exit code 4, the reason is written, no receipt file)"
        node "$HERE/gate-acceptance-simulate-busy.mjs" "$SID" "請用 bash 執行 sleep 100（真的睡 100 秒），done後回覆「長任務done」。" >/dev/null 2>&1
        sleep 8
        BUSY_ID="dispatch-守門驗收-busy-2222"
        mk_dispatch "$WORK/g6.md" "$BUSY_ID" "請只回一行『收到』"
        set +e
        G6_OUT="$(node "$DISPATCH_TOOL" 送 --檔 "$WORK/g6.md" --收件 "$SCENE" --等場景秒數 20 2>&1)"
        G6_RC=$?
        set -e
        expect_eq "G6 exit code = 4 (an explicit rejection, not queueing)" "$G6_RC" "4"
        expect_has "G6 output says it is an explicit rejection" "$G6_OUT" "明確拒絕"
        expect_has "G6 output says the dispatch was not sent" "$G6_OUT" "沒有送出"
        if [ ! -f "$WORK/g6.回執.md" ]; then
          ok "G6 wrote no receipt file on rejection (the scene was never woken up)"
        else
          bad "G6 wrote a receipt file despite the rejection" "content: $(cat "$WORK/g6.回執.md")"
        fi
        if [ -f "$WORK/g6.狀態.json" ]; then
          ST6="$(cat "$WORK/g6.狀態.json")"
          if echo "$ST6" | grep -q '被拒（場景忙）' && echo "$ST6" | grep -q '拒絕原因'; then
            ok "G6 status file records \"被拒（場景忙）\" plus the rejection reason"
          else
            bad "G6 status file did not record the rejection reason" "$ST6"
          fi
        else
          bad "G6 status file was not produced" ""
        fi
        echo

        # ── G7: the scene was busy until the timeout and is then let through ⇒ it must
        #    wait until it is idle and then send, exit code 0 ──
        echo "  ── G7 busy until the timeout and then let through ⇒ it must wait until it is idle and then send, exit code 0"
        node "$HERE/gate-acceptance-simulate-busy.mjs" "$SID" "請用 bash 執行 sleep 45（真的睡 45 秒），done後回覆「短任務done」。" >/dev/null 2>&1
        sleep 8
        G7_ID="dispatch-守門驗收-wait-3333"
        mk_dispatch "$WORK/g7.md" "$G7_ID" "請只回一行『等到了』，第一行寫出派單 id"
        set +e
        G7_OUT="$(node "$DISPATCH_TOOL" 送 --檔 "$WORK/g7.md" --收件 "$SCENE" --等場景秒數 180 2>&1)"
        G7_RC=$?
        set -e
        expect_eq "G7 exit code = 0 (it waits until it is idle, it must not refuse outright)" "$G7_RC" "0"
        expect_has "G7 output says it is waiting" "$G7_OUT" "正在忙，等它空出來"
        expect_has "G7 output says it became idle" "$G7_OUT" "場景空閒"
        if [ -f "$WORK/g7.回執.md" ]; then
          ok "G7 wrote the reply into a receipt file"
          if head -1 "$WORK/g7.回執.md" | grep -q "$G7_ID"; then
            ok "the first line of the G7 receipt is the correct dispatch id"
          else
            bad "the first line of the G7 receipt has the wrong dispatch id" "$(head -1 "$WORK/g7.回執.md")"
          fi
        else
          bad "G7 wrote no receipt file" "$G7_OUT"
        fi
        echo
      fi
    fi
  fi
fi

echo "═══ Result: $pass passed, $fail failed ═══"
