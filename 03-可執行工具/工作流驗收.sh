#!/usr/bin/env bash
# 工作流端到端驗收 —— 證明「累積迴圈真的閉合」
#
# 用法：bash 工作流驗收.sh
#
# ★ 這支腳本存在的理由：
#   「沒有可累積物的回執＝這次活白做」與「可累積物跨場景往下傳」
#   這兩件事，光看規格看不出來。必須真的跑一遍三場景的工作流，
#   而且故意弄壞時要真的被擋下。
#
# 它驗六件事：
#   E1 預檢不通過 ⇒ 拒絕啟動
#   E2 缺可累積物的回執 ⇒ 擋下，run 就地停（fail-closed）
#   E3 可累積物沒落地到場景記憶 ⇒ 擋下
#   E4 合格回執 ⇒ 通過，run 前進
#   E5 可累積物跨場景傳到下一跳的派單裡
#   E6 門檻步驟 ⇒ 收完回執停下等人；確認後才繼續
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$(mktemp -d)"
EX="$HERE/工作流執行.mjs"
RC="$HERE/回執校驗.mjs"

pass=0; fail=0

ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; echo "$2" | sed 's/^/     /' | head -8; fail=$((fail+1)); }

# ── 建測試工作台（三個場景 + 一條工作流）──
cp -r "$ROOT/04-模板/示範工作台.乾淨" "$WORK/wb"
WB="$WORK/wb"
mkdir -p "$WB/工作流"

for pair in "清理場景:demo-clean" "報告場景:demo-report"; do
  name="${pair%%:*}"; sid="${pair##*:}"
  d="$WB/場景/$name"
  mkdir -p "$d/專案記憶" "$d/歸檔"
  printf '此檔案代表 .git 邊界標記（示範用）\n' > "$d/.git-marker"
  cat > "$d/定位卡.md" <<EOF
# $name · 定位卡

- 場景 id：\`$sid\`
- 場景名：$name
- 面板：\`scenarios/$sid.json\`
- 記憶目錄：場景/$name/
- 專屬技能：\`$sid\`
- 定位卡版本：1
EOF
  cat > "$d/場景私有記憶.md" <<EOF
# $name · 場景私有記憶

## §〇 當前交接（≤4 KB，新會話先讀這一節）

### 1) 上次交接
- （示範資料）

### 2) 當前專案
| 專案 | 記憶檔 | 狀態 | 下一步 |
|---|---|---|---|
| （暫無） | — | — | — |

### 3) 私有記憶變更
- （示範資料）

### 4) 下一步 / 卡點
- 下一步：待派單

### 5) 全貌
- 專案記憶 0 個

## 核心職責

- 負責：示範 $name 的工作。
- 不碰：其他場景的資料。
- 一句話：示範場景。

## §一 我管什麼 / 不管什麼

- 管：示範骨架。
- 不管：真實工作。

## §二 幹活入口

- 專案記憶：\`專案記憶/<專案名>.md\`
- 歸檔：\`歸檔/\`
- 索引：\`_檔案索引.md\`

## §五 決策與坑（只追加）

## 〇-通知
EOF
  cat > "$d/_檔案索引.md" <<EOF
# $name · 檔案索引

| 檔案 / 目錄 | 是什麼 | 狀態 | 複核日期 |
|---|---|---|---|
| \`場景私有記憶.md\` | 場景私有記憶 | 活 | 2026-11-02 |
EOF
done

# 身份索引補兩行
python3 - "$WB/場景/_場景身份索引.md" <<'PY'
import sys
p=sys.argv[1]
t=open(p).read()
if 'demo-clean' not in t:
    t=t.rstrip('\n')+"\n| `demo-clean` | `demo-clean-ai` | 清理 | 清理場景 | `session-demo0002` | `場景/清理場景/定位卡.md` | `demo-clean` |\n"
    t+="| `demo-report` | `demo-report-ai` | 報告 | 報告場景 | `session-demo0003` | `場景/報告場景/定位卡.md` | `demo-report` |\n"
open(p,'w').write(t)
PY

cat > "$WB/工作流/磁碟體檢.yaml" <<'EOF'
id: 磁碟體檢
名稱: 磁碟體檢 → 清理 → 報告
版本: 1
步驟:
  - 場景: 示範場景
    目的: 找出可清理的項目
    判據: 列出可釋放 ≥ 1 GB 的項目，每項標明路徑與大小
    需確認: false
  - 場景: 清理場景
    目的: 清理可釋放的項目
    判據: 實際釋放 ≥ 1 GB，並在回執列出刪了什麼
    需要: 磁碟體檢的清理清單
    需確認: true
  - 場景: 報告場景
    目的: 出報告
    判據: 報告落盤，且首行寫在共享看板
    需要: 清理結果
    需確認: false
失敗策略: 停在原地等人
EOF

# 一份壞的工作流（場景不存在）
cat > "$WB/工作流/壞工作流.yaml" <<'EOF'
id: 壞工作流
名稱: 壞工作流
版本: 1
步驟:
  - 場景: 不存在的場景
    目的: 做一件不存在的事
    判據: 這是一個夠長的判據用來通過長度檢查
失敗策略: 停在原地等人
EOF

echo "═══ 工作流端到端驗收：累積迴圈必須閉合 ═══"
echo

# ── E1 預檢不通過 ⇒ 拒絕啟動 ──
echo "【E1】工作流指向不存在的場景 ⇒ 預檢不通過，拒絕啟動（期望 exit=1）"
out="$(node "$EX" start --root "$WB" --工作流 壞工作流 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "拒絕啟動"; then
  ok "預檢擋下不存在的場景"
else
  bad "預檢沒擋下" "$out"
fi
echo

# ── 啟動正例 ──
echo "【E2】正常啟動（期望 exit=0）"
out="$(node "$EX" start --root "$WB" --工作流 磁碟體檢 2>&1)"; rc=$?
RUN="$(echo "$out" | grep 'run id' | sed 's/.*：//' | tr -d ' ')"
if [ "$rc" = 0 ] && [ -n "$RUN" ]; then
  ok "工作流已啟動（run=$RUN）"
else
  bad "啟動失敗" "$out"; echo "$out" | head -5; exit 1
fi
echo

# ── E3 缺可累積物 ⇒ 擋下 ──
echo "【E3】回執缺「可累積物」⇒ 擋下且 run 就地停（期望 exit=1）"
node "$EX" step --root "$WB" --run "$RUN" >/dev/null 2>&1
cat > "$WORK/回執-1-缺累積物.md" <<'EOF'
【示範場景 · 回執】

結論：磁碟體檢完成
證據：/mnt/minecraft 56% → 41%
路徑：場景/示範場景/專案記憶/磁碟體檢.md

### 差異集合
- /mnt/minecraft  56% → 41%（-8.2G）

### 下一棒
- 清理場景
EOF
out="$(node "$EX" 回執 --root "$WB" --run "$RUN" --回執 "$WORK/回執-1-缺累積物.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "缺小節「可累積物」"; then
  ok "缺可累積物的回執被擋下"
else
  bad "缺可累積物沒被擋" "$out"
fi
if echo "$out" | grep -q "fail-closed"; then
  ok "run 就地停（fail-closed）"
else
  bad "run 沒有停下" "$out"
fi
echo

# ── resume 復原 ──
echo "【E4】修好後 resume 能接回去（期望 exit=0）"
out="$(node "$EX" resume --root "$WB" --run "$RUN" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "執行中"; then
  ok "run 已從「已停」拉回「執行中」"
else
  bad "resume 失敗" "$out"
fi
echo

# ── E5 可累積物沒落地 ⇒ 擋下 ──
echo "【E5】回執有可累積物但沒落地到場景記憶 ⇒ 擋下（期望 exit=1）"
cat > "$WORK/回執-1-沒落地.md" <<'EOF'
【示範場景 · 回執】

結論：磁碟體檢完成
證據：/mnt/minecraft 56% → 41%
路徑：場景/示範場景/專案記憶/磁碟體檢.md

### 差異集合
- /mnt/minecraft  56% → 41%（-8.2G）

### 可累積物
- 舊地圖備份可安全刪，但要先確認沒人在跑那個世界

### 下一棒
- 清理場景
EOF
out="$(node "$EX" 回執 --root "$WB" --run "$RUN" --回執 "$WORK/回執-1-沒落地.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "沒有落地到場景記憶"; then
  ok "只寫在回執裡、沒落地的可累積物被擋下"
else
  bad "沒落地的可累積物沒被擋" "$out"
fi
echo

# ── 落地後 ⇒ 通過 ──
echo "【E6】可累積物落地到 §五 ⇒ 通過，run 前進（期望 exit=0）"
# E5 失敗後 run 停在「已停」⇒ 先 resume 接回去（否則根本收不了回執）
node "$EX" resume --root "$WB" --run "$RUN" >/dev/null 2>&1
python3 - "$WB/場景/示範場景/場景私有記憶.md" <<'PY'
import sys
p=sys.argv[1]; t=open(p).read()
if '舊地圖備份可安全刪' not in t:
    t=t.replace("## §五 決策與坑（只追加）\n","## §五 決策與坑（只追加）\n\n- 舊地圖備份可安全刪，但要先確認沒人在跑那個世界\n")
open(p,'w').write(t)
PY
out="$(node "$EX" 回執 --root "$WB" --run "$RUN" --回執 "$WORK/回執-1-沒落地.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "前進到步驟2"; then
  ok "合格回執通過，run 前進到步驟2"
else
  bad "合格回執沒通過" "$out"
fi
echo

# ── E7 累積物跨場景傳遞 ──
echo "【E7】步驟1 的可累積物 ⇒ 帶進步驟2（不同場景）的派單（期望 exit=0）"
out="$(node "$EX" step --root "$WB" --run "$RUN" 2>&1)"
if echo "$out" | grep -q "已帶入上一跳的可累積物"; then
  ok "步驟2 的派單帶入了步驟1 的可累積物"
else
  bad "累積物沒有跨場景傳遞" "$out"
fi
if echo "$out" | grep -q "舊地圖備份可安全刪"; then
  ok "派單內容裡確實有上一跳的可累積物"
else
  bad "派單內容裡沒有可累積物" "$out"
fi
echo

# ── E8 門檻攔截 ──
echo "【E8】步驟2 是門檻 ⇒ 收完回執停下等人（期望 exit=0 + 停）"
python3 - "$WB/場景/清理場景/場景私有記憶.md" <<'PY'
import sys
p=sys.argv[1]; t=open(p).read()
if 'lsof 檢查過才能刪' not in t:
    t=t.replace("## §五 決策與坑（只追加）\n","## §五 決策與坑（只追加）\n\n- lsof 檢查過才能刪，>1GB 的才動\n")
open(p,'w').write(t)
PY
cat > "$WORK/回執-2.md" <<'EOF'
【清理場景 · 回執】

結論：清理完成
證據：free 2.5Gi → 4.1Gi
路徑：場景/清理場景/專案記憶/磁碟清理.md

### 差異集合
- free  2.5Gi → 4.1Gi（+1.6Gi）

### 可累積物
- lsof 檢查過才能刪，>1GB 的才動

### 下一棒
- 報告場景
EOF
out="$(node "$EX" 回執 --root "$WB" --run "$RUN" --回執 "$WORK/回執-2.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "run 停在步驟"; then
  ok "門檻步驟收完回執後停下等人"
else
  bad "門檻沒有攔截" "$out"
fi
st="$(node "$EX" status --root "$WB" 2>&1)"
if echo "$st" | grep -q "等門檻"; then
  ok "狀態顯示「等門檻」"
else
  bad "狀態不是等門檻" "$st"
fi
echo

# ── E10 派單缺判據 ⇒ 送不出去 ──
echo "【E10】派單缺「判據」⇒ 擋下（期望 exit=1）"
cat > "$WORK/派單-壞.md" <<'EOF'
【清理場景 · 派單 · 請回執】

做什麼：
  清理可釋放的項目

落盤位置：
  場景/清理場景/專案記憶/磁碟清理.md

回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「差異集合」
  ③ 必須帶「可累積物」
  ④ 必須寫明「下一棒」
EOF
out="$(node "$HERE/派單校驗.mjs" --root "$WB" --派單 "$WORK/派單-壞.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "缺欄位「判據」"; then
  ok "缺判據的派單被擋下"
else
  bad "缺判據的派單沒被擋" "$out"
fi

cat > "$WORK/派單-好.md" <<'EOF'
【清理場景 · 派單 · 請回執】

做什麼：
  清理可釋放的項目

判據：
  實際釋放 >= 1 GB，並在回執列出刪了什麼

落盤位置：
  場景/清理場景/專案記憶/磁碟清理.md

回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「差異集合」
  ③ 必須帶「可累積物」
  ④ 必須寫明「下一棒」
EOF
out="$(node "$HERE/派單校驗.mjs" --root "$WB" --派單 "$WORK/派單-好.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "派單合格"; then
  ok "合格派單通過"
else
  bad "合格派單沒通過" "$out"
fi
echo

# ── E9 门檻确认后才继续 ──
echo "【E9】門檻確認後 ⇒ 前進到步驟3（期望 exit=0）"
out="$(node "$EX" resume --root "$WB" --run "$RUN" --門檻通過 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "前進到步驟3"; then
  ok "門檻確認後前進到步驟3"
else
  bad "門檻確認後沒有前進" "$out"
fi
echo

echo "═══ 結果：$pass 通過，$fail 失敗 ═══"
rm -rf "$WORK"
[ "$fail" = 0 ] && exit 0 || exit 1
