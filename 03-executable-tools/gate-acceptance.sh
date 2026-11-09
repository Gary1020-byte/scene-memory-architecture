#!/usr/bin/env bash
# 守門機制驗收 —— 證明「該擋的會擋、該等的會等、該報錯的會報錯」
#
# 用法：bash gate-acceptance.sh [--跳過引擎測試]
#
# ★ 這支腳本存在的理由：
#   「場景忙會被明確拒絕」「回執認領錯配會被擋下」「自動推進會停在對的地方」
#   這三件事，光看程式碼看不出來。必須真的跑，而且**故意弄壞時要真的被擋下**。
#
# 它驗八件事：
#   G1 認領校驗：自帶 id → 放行
#   G2 認領校驗：帶別張 id → 擋下
#   G3 認領校驗：完全沒帶 id → 擋下（新格式）／放行（舊格式）
#   G4 狀態檔 round-trip：run id、目前步驟 讀得回來（差一個字就會變 undefined）
#   G5 產生的派單帶唯一派單 id，且要求場景自報
#   G6 ★ 場景真的忙 ⇒ 明確拒絕（退出碼 4、狀態寫原因、沒有回執檔）
#   G7 ★ 場景忙到逾時後放行 ⇒ 等到空閒再送出，退出碼 0
#   G8 ★ 回覆帶別張派單 id ⇒ 判定錯配、拒收、退出碼 4、沒有回執檔
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$(mktemp -d)"
WB="$WORK/wb"
EX="$HERE/run-workflow.mjs"
DISPATCH_TOOL="${DSH_DISPATCH_TOOL:-$HOME/.DSH/工作台/工具/派單.mjs}"

SKIP_ENGINE=0
[ "${1:-}" = "--skip-engine-tests" ] && SKIP_ENGINE=1

pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; echo "$2" | sed 's/^/     /' | head -10; fail=$((fail+1)); }
expect_eq() {  # expect_eq <描述> <實際> <預期>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected "$3", got "$2""; fi
}
expect_has() {  # expect_has <描述> <文字> <關鍵字>
  if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1" "output does not contain "$3""; fi
}

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "═══ Gatekeeping Acceptance: it must fail when it should ═══"
echo

# ═══════════════════════ 純邏輯測試（不需要引擎）═══════════════════════

echo "【G1–G3】receipt認領校驗（純函式）"
cat > "$WORK/claim-test.mjs" <<'EOF'
import fs from 'node:fs'
const src = fs.readFileSync(process.argv[2], 'utf8')
const i = src.indexOf('export function claimCheck')
const j = src.indexOf('/* ───────────────────────── 派單格式', i)
if (i < 0 || j < 0) { console.log('SLICE_FAIL'); process.exit(9) }
const mod = src.slice(i, j).replace('export function claimCheck', 'function claimCheck') + '\nexport { claimCheck }\n'
fs.writeFileSync(process.argv[3] + '/claim-lib.mjs', mod)
const { claimCheck } = await import(process.argv[3] + '/claim-lib.mjs')
const cases = [
  ['自帶自己的 id', '派單 id：dispatch-abc-步1-x9y\n內容', 'dispatch-abc-步1-x9y', {}, true],
  ['帶別張的 id', '派單 id：dispatch-zzz-步2-q1w\n內容', 'dispatch-abc-步1-x9y', {}, false],
  ['★ 同時提到兩個 id，但第一個宣告是別張', '派單 id：dispatch-zzz-步2-q1w\n另外這張是 dispatch-abc-步1-x9y', 'dispatch-abc-步1-x9y', {}, false],
  ['★ 同時提到兩個 id，第一個宣告是自己（後面提到別張不影響認領）', '派單 id：dispatch-abc-步1-x9y\n另一張是 dispatch-zzz-步2-q1w', 'dispatch-abc-步1-x9y', {}, true],
  ['完全沒帶 id（嚴格）', '沒有任何 id 的回覆', 'dispatch-abc-步1-x9y', {}, false],
  ['完全沒帶 id（舊格式）', '沒有任何 id 的回覆', 'dispatch-abc-步1-x9y', { strict: false }, true],
  ['空回覆', '', 'dispatch-abc-步1-x9y', {}, false],
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
  bad "認領校驗案例" "$CLAIM_OUT"
else
  ok "認領校驗 7 案例全對（$CLAIM_TOTAL）"
fi
# 反向確認：帶別張 id 的錯誤訊息必須明確指出「宣告的是別張」（不是含糊的『沒找到 id』）
if echo "$CLAIM_OUT" | grep '帶別張的 id' | grep -qE '第一個宣告的派單 id 是|別張派單的 id'; then
  ok "帶別張 id 的錯誤message明確指出是別張（不是含糊的『沒找到 id』）"
else
  bad "帶別張 id 的錯誤message" "$CLAIM_OUT"
fi
echo

echo "【G4】status檔 round-trip：run id、currentStep 讀得回來"
cp -r "$ROOT/04-templates/demo-workbench.clean" "$WB"
mkdir -p "$WB/workflow"
cat > "$WB/workflow/roundtrip.yaml" <<'EOF'
id: roundtrip
名稱: roundtrip
版本: 1
步驟:
  - 場景: demo-scene
    目的: 做一件事
    判據: 有明確判據
    落盤: scenes/demo-scene/project-memory/x.md
    需確認: false
EOF
START_OUT="$(node "$EX" start --root "$WB" --workflow roundtrip 2>&1)"
RUN_ID="$(echo "$START_OUT" | grep -o 'run id：.*' | cut -d'：' -f2)"
if [ -n "$RUN_ID" ]; then ok "start 產生 run id：$RUN_ID"; else bad "start 產生 run id" "$START_OUT"; fi

# 再讀一次狀態檔（走 step → writeState → 再讀），看 run id 會不會變 undefined
node "$EX" step --root "$WB" --run "$RUN_ID" >/dev/null 2>&1
STATE_MD="$WB/runs/$RUN_ID/execution-state.md"
if grep -q "^- run id：$RUN_ID" "$STATE_MD"; then
  ok "run id 寫回status檔且讀得回來（不是 undefined）"
else
  bad "run id round-trip" "$(grep '^- run id' "$STATE_MD")"
fi
if grep -qE '^- currentStep：[0-9]+' "$STATE_MD"; then
  ok "currentStep寫回status檔且是數字（不是 undefined）"
else
  bad "currentStep round-trip" "$(grep '^- currentStep' "$STATE_MD")"
fi
STATUS_OUT="$(node "$EX" status --root "$WB" --run "$RUN_ID" 2>&1)"
if echo "$STATUS_OUT" | grep -q 'currentStep：undefined'; then
  bad "status 讀出currentStep" "$STATUS_OUT"
else
  ok "status 讀出currentStep不是 undefined"
fi
echo

echo "【G5】產生的派單帶唯一派單 id，且要求scene自報"
STEP_OUT="$(node "$EX" step --root "$WB" --run "$RUN_ID" 2>&1)"
DISPATCH_FILE="$WB/runs/$RUN_ID/receipt/dispatch-1.md"
if [ -f "$DISPATCH_FILE" ]; then
  DID="$(grep -o '派單 id：dispatch-[^ ]*' "$DISPATCH_FILE" | head -1 | cut -d'：' -f2)"
  if [ -n "$DID" ] && [ "$DID" != "dispatch-undefined-步1" ]; then
    ok "派單帶唯一 id：$DID"
  else
    bad "派單 id" "$(grep '派單 id' "$DISPATCH_FILE")"
  fi
  if grep -q "receipt的\*\*第一行\*\*" "$DISPATCH_FILE" && grep -q "派單 id：$DID" "$DISPATCH_FILE"; then
    ok "派單要求scene在receipt第一行自報派單 id"
  else
    bad "派單未要求自報 id" "$(cat "$DISPATCH_FILE")"
  fi
  # 兩次產生必須是不同的 id（否則認領校驗會誤判）
  node "$EX" step --root "$WB" --run "$RUN_ID" >/dev/null 2>&1
  DID2="$(grep -o '派單 id：dispatch-[^ ]*' "$DISPATCH_FILE" | head -1 | cut -d'：' -f2)"
  if [ -n "$DID2" ] && [ "$DID" != "$DID2" ]; then
    ok "重新產生派單會換新 id（$DID → $DID2）"
  else
    bad "派單 id 不唯一" "$DID vs $DID2"
  fi
else
  bad "派單檔沒產生" "$STEP_OUT"
fi
echo

# ═══════════════════════ 需要真引擎的測試 ════════════════════════

if [ "$SKIP_ENGINE" = "1" ]; then
  echo "【G6–G8】跳過（--skip-engine-tests）"
  echo
else
  if [ ! -f "$DISPATCH_TOOL" ]; then
    echo "【G6–G8】跳過：找不到派單tool $DISPATCH_TOOL"
    echo
  else
    SCENE="知識庫"
    SCENE_DIR="$HOME/.DSH/工作台/場景/$SCENE"
    if [ ! -d "$SCENE_DIR" ]; then
      echo "【G6–G8】跳過：找不到scene目錄 $SCENE_DIR"
      echo
    else
      # 找出該場景的 session id
      SID="$(node -e "
const fs=require('fs');const p='$HOME/.DSH/工作台/外殼/scenarios';
for(const f of fs.readdirSync(p)){if(!f.endsWith('.json')||f.startsWith('_'))continue;
const j=JSON.parse(fs.readFileSync(p+'/'+f,'utf8'));
if(j&&j.name==='$SCENE'&&!j.view){const s=(j.panels||[]).find(x=>x.sessionId);if(s){console.log(s.sessionId);break}}}
")"
      if [ -z "$SID" ]; then
        echo "【G6–G8】跳過：找不到scene $SCENE 的 session id"
        echo
      else
        echo "【G6–G8】引擎端測試（scene：$SCENE，session ${SID:0:16}…）"

        # 造一張真的派單檔（手寫，含 id 欄位與自報要求）
        mk_dispatch() {  # mk_dispatch <路徑> <id> <要求文字>
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

        # ── G8：回覆帶「別張」派單 id ⇒ 必須判定錯配、拒收、退出碼 4 ──
        #   ★ 設計重點：派單「標頭」放自己的 id（守門機制認領用），
        #     但派單「內文給場景看的指示」全部指向另一個 id。
        #     這樣場景會照實回覆別張的 id —— 正是「A 拿到 B 的回執」那個情境。
        #     （不要在內文留矛盾指示：場景會自己判斷並選對的那個，測不出東西。）
        echo "  ── G8 回覆帶別張派單 id ⇒ 必須拒收"
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
        G8_OUT="$(node "$DISPATCH_TOOL" 送 --file "$WORK/g8.md" --recipient "$SCENE" --等scene秒數 60 2>&1)"
        G8_RC=$?
        set -e
        expect_eq "G8 退出碼 = 4（錯配要報錯，不能假裝成功）" "$G8_RC" "4"
        expect_has "G8 輸出description是receipt錯配" "$G8_OUT" "receipt疑似錯配"
        if [ ! -f "$WORK/g8.receipt.md" ]; then
          ok "G8 沒有把錯的回覆寫成receipt檔"
        else
          bad "G8 錯配卻寫了receipt檔" "內容：$(cat "$WORK/g8.receipt.md")"
        fi
        # 狀態檔也要記錄
        if [ -f "$WORK/g8.status.json" ]; then
          ST="$(cat "$WORK/g8.status.json")"
          if echo "$ST" | grep -q 'receipt疑似錯配'; then
            ok "G8 status檔記錄了「receipt疑似錯配」＋原因"
          else
            bad "G8 status檔沒記錯配" "$ST"
          fi
        else
          bad "G8 status檔沒產生" ""
        fi
        echo

        # ── G6：場景真的忙 ⇒ 明確拒絕 ──
        echo "  ── G6 scene真的忙 ⇒ 必須明確拒絕（退出碼 4、寫原因、沒有receipt檔）"
        node "$HERE/gate-acceptance-simulate-busy.mjs" "$SID" "請用 bash 執行 sleep 100（真的睡 100 秒），done後回覆「長任務done」。" >/dev/null 2>&1
        sleep 8
        BUSY_ID="dispatch-守門驗收-busy-2222"
        mk_dispatch "$WORK/g6.md" "$BUSY_ID" "請只回一行『收到』"
        set +e
        G6_OUT="$(node "$DISPATCH_TOOL" 送 --file "$WORK/g6.md" --recipient "$SCENE" --等scene秒數 20 2>&1)"
        G6_RC=$?
        set -e
        expect_eq "G6 退出碼 = 4（明確拒絕，不是排隊）" "$G6_RC" "4"
        expect_has "G6 輸出description是明確拒絕" "$G6_OUT" "明確拒絕"
        expect_has "G6 輸出description派單沒有送出" "$G6_OUT" "沒有送出"
        if [ ! -f "$WORK/g6.receipt.md" ]; then
          ok "G6 拒絕時沒有receipt檔（scene根本沒被叫醒）"
        else
          bad "G6 拒絕卻有receipt檔" "內容：$(cat "$WORK/g6.receipt.md")"
        fi
        if [ -f "$WORK/g6.status.json" ]; then
          ST6="$(cat "$WORK/g6.status.json")"
          if echo "$ST6" | grep -q '被拒（scene忙）' && echo "$ST6" | grep -q '拒絕原因'; then
            ok "G6 status檔寫了「被拒（scene忙）」＋拒絕原因"
          else
            bad "G6 status檔沒寫拒絕原因" "$ST6"
          fi
        else
          bad "G6 status檔沒產生" ""
        fi
        echo

        # ── G7：場景忙到逾時後放行 ⇒ 等到空閒再送出 ──
        echo "  ── G7 忙到逾時後放行 ⇒ 必須等到空閒再送出，退出碼 0"
        node "$HERE/gate-acceptance-simulate-busy.mjs" "$SID" "請用 bash 執行 sleep 45（真的睡 45 秒），done後回覆「短任務done」。" >/dev/null 2>&1
        sleep 8
        G7_ID="dispatch-守門驗收-wait-3333"
        mk_dispatch "$WORK/g7.md" "$G7_ID" "請只回一行『等到了』，第一行寫出派單 id"
        set +e
        G7_OUT="$(node "$DISPATCH_TOOL" 送 --file "$WORK/g7.md" --recipient "$SCENE" --等scene秒數 180 2>&1)"
        G7_RC=$?
        set -e
        expect_eq "G7 退出碼 = 0（等到空閒就送出，不該硬拒）" "$G7_RC" "0"
        expect_has "G7 輸出description有等待" "$G7_OUT" "正在忙，等它空出來"
        expect_has "G7 輸出description等到空閒" "$G7_OUT" "scene空閒"
        if [ -f "$WORK/g7.receipt.md" ]; then
          ok "G7 回覆有寫成receipt檔"
          if head -1 "$WORK/g7.receipt.md" | grep -q "$G7_ID"; then
            ok "G7 receipt第一行是正確的派單 id"
          else
            bad "G7 receipt第一行派單 id 不對" "$(head -1 "$WORK/g7.receipt.md")"
          fi
        else
          bad "G7 沒有receipt檔" "$G7_OUT"
        fi
        echo
      fi
    fi
  fi
fi

echo "═══ Result: $pass passed, $fail failed ═══"
[ "$fail" = "0" ] || exit 1
