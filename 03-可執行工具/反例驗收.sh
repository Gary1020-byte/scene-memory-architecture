#!/usr/bin/env bash
# 反例驗收 —— 證明「該失敗時會失敗」
#
# 只看「正常情況通過」不算驗證。必須證明：故意弄壞時，工具會擋下並回傳非 0 退出碼。
#
# 用法：bash 反例驗收.sh
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$ROOT/04-模板/示範工作台"
TOOL="$HERE/場景記憶.mjs"
SCENE="示範場景"
MEM="$WORK/場景/$SCENE/場景私有記憶.md"

pass=0; fail=0

# 每次測試前，把示範場景還原到乾淨狀態
reset_scene() {
  rm -rf "$WORK"
  cp -r "$ROOT/04-模板/示範工作台.乾淨" "$WORK"
}

run_check() { node "$TOOL" check --場景 "$SCENE" --root "$WORK" 2>&1; }

expect() {  # expect <描述> <預期 exit> <關鍵字>
  local desc="$1" want="$2" kw="$3" out rc
  out="$(run_check)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     期望 exit=$want 含「$kw」，實際 exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

echo "═══ 反例驗收：校驗工具必須能證明「該失敗時會失敗」 ═══"
echo

echo "【V8】正常資料應該通過（期望 exit=0）"
reset_scene
expect "正常場景全部通過" 0 "全部通過"

echo
echo "【V1】§₀ 灌爆 4 KB 紅線（期望 exit=1）"
reset_scene
{ echo "## §〇 當前交接（≤4 KB，新會話先讀這一節）"; echo; echo "### 1) 上次交接"
  for i in $(seq 1 200); do echo "- 填充行 $i：這是一段刻意灌水的內容，用來把交接段推過 4096 位元組的紅線門檻。"; done
} > /tmp/sec0.bak
# 用完整替換保留其餘小節
node -e '
const fs=require("fs");
const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
const h=t.search(/^## §〇/m);
const rest=t.slice(h);
const n=rest.indexOf("\n## ",5);
const body=rest.slice(0,n>0?n:rest.length);
const fill=fs.readFileSync("/tmp/sec0.bak","utf8");
t=t.slice(0,h)+fill+"\n"+t.slice(h+body.length);
fs.writeFileSync(p,t);
' "$MEM"
expect "§₀ 超紅線被擋" 1 "超 4 KB"

echo
echo "【V2】刪掉「### 4) 下一步 / 卡點」（期望 exit=1）"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/### 4\) 下一步 \/ 卡點[\s\S]*?(?=\n### )/,"");
fs.writeFileSync(p,t);
' "$MEM"
expect "§₀ 缺小節被擋" 1 "缺小節"

echo
echo "【V3】改定位卡但沒重蓋身份卡 ⇒ 指紋過期（期望 exit=1）"
reset_scene
echo "<!-- 偷改一行 -->" >> "$WORK/場景/$SCENE/定位卡.md"
expect "卡指紋過期被擋" 1 "卡指紋過期"

echo
echo "【V5】刪掉「## 核心職責」整塊（期望 exit=1）"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/## 核心職責[\s\S]*?(?=\n## §一)/,"");
fs.writeFileSync(p,t);
' "$MEM"
expect "缺核心職責被擋" 1 "核心職責"

echo
echo "【V6】核心職責只寫 2 條（期望 exit=1）"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/## 核心職責[\s\S]*?(?=\n## §一)/,"## 核心職責\n\n- 負責：只有一條\n- 不碰：只有兩條\n\n");
fs.writeFileSync(p,t);
' "$MEM"
expect "核心職責條數不足被擋" 1 "至少 3 條"

echo
echo "【V9】場景目錄缺邊界標記（.git 與 .git-marker 都沒有 ⇒ 場景邊界失效 ⇒ 期望 exit=1）"
reset_scene
node "$HERE/移除邊界標記.mjs" "$WORK/場景/$SCENE"
expect "缺邊界標記被擋" 1 "缺少 .git"

echo
echo "【V10】身份索引裡沒有這張場景卡（期望 exit=1）"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/^\| `demo`.*$/m,"");
fs.writeFileSync(p,t);
' "$WORK/場景/_場景身份索引.md"
expect "索引無此卡被擋" 1 "身份索引裡沒有這張場景卡"

echo
echo "【V11】定位卡欄位指向不存在的檔（期望 exit=1）"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace("場景/示範場景/定位卡.md","場景/示範場景/不存在.md");
fs.writeFileSync(p,t);
' "$WORK/場景/_場景身份索引.md"
expect "定位卡不存在被擋" 1 "定位卡不存在"

echo
echo "【V7】專案記憶有份但當前專案表寫「暫無」（期望 exit=0 + 警告）"
reset_scene
echo "# 測試專案" > "$WORK/場景/$SCENE/專案記憶/測試專案.md"
out="$(run_check)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "當前專案表寫"; then
  echo "  ✓ 表格過期只警告不擋（exit=0）"; pass=$((pass+1))
else
  echo "  ✗ 表格過期只警告不擋"; echo "$out" | sed 's/^/     /' | head -5; fail=$((fail+1))
fi

echo
echo "═══ 工作流校驗（V12–V14）═══"

WFTOOL="$HERE/工作流校驗.mjs"
WFWORK="$(mktemp -d)"
mkdir -p "$WFWORK/工作流"

wf_expect() {  # wf_expect <描述> <預期 exit> <關鍵字> <yaml 內容>
  local desc="$1" want="$2" kw="$3" content="$4" out rc
  printf '%s\n' "$content" > "$WFWORK/工作流/測試.yaml"
  out="$(node "$WFTOOL" --root "$WFWORK" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     期望 exit=$want 含「$kw」，實際 exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

wf_expect "工作流缺少必要欄位被擋" 1 "缺必要欄位" 'id: 壞
名稱: 壞掉的工作流'

wf_expect "步驟缺「場景」被擋" 1 "缺「場景」" 'id: 壞
名稱: 壞掉的工作流
版本: 1
步驟:
  - 目的: 這步沒有場景
    判據: 這步的判準夠長可以通過長度檢查'

wf_expect "「需確認」值域不合法被擋" 1 "只能是 true / false" 'id: 壞
名稱: 壞掉的工作流
版本: 1
步驟:
  - 場景: 場景丙
    目的: 清理
    判據: 實際釋放 1 GB 並列出刪了什麼
    需確認: maybe'

wf_expect "「失敗策略」不合法被擋" 1 "「失敗策略」只能是" 'id: 壞
名稱: 壞掉的工作流
版本: 1
步驟:
  - 場景: 場景丙
    目的: 清理
    判據: 實際釋放 1 GB 並列出刪了什麼
失敗策略: 隨便'

wf_expect "正常工作流通過（exit=0）" 0 "✓ 全部通過" 'id: 好的
名稱: 好的工作流
版本: 1
步驟:
  - 場景: 場景丙
    目的: 清理
    判據: 實際釋放 1 GB 並列出刪了什麼
    需確認: true
失敗策略: 停在原地等人'

rm -rf "$WFWORK"

echo
echo "═══ 新增場景工具（V15–V17）═══"

NSTMP="$(mktemp -d)"
mkdir -p "$NSTMP/場景"
cat > "$NSTMP/場景/_場景身份索引.md" <<'EOF'
# 場景身份索引

| 場景 id | 面板 id | 面板標題 | 會話名 | 會話 id | 定位卡 | 主技能 |
|---|---|---|---|---|---|---|
EOF

ns_expect() {  # ns_expect <描述> <預期 exit> <關鍵字> <指令...>
  local desc="$1" want="$2" kw="$3"; shift 3
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     期望 exit=$want 含「$kw」，實際 exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

ns_expect "新增場景成功建立骨架" 0 "git init（場景邊界）" \
  node "$HERE/新增場景.mjs" --root "$NSTMP" --id t1 --名 測試場景一 --職責 "a;b;c"

ns_expect "新建的場景六件套齊全" 0 "✓ 全部通過" \
  bash -c "node '$HERE/場景記憶.mjs' stamp --場景 測試場景一 --root '$NSTMP' >/dev/null 2>&1; node '$HERE/場景記憶.mjs' check --場景 測試場景一 --root '$NSTMP'"

ns_expect "重複跑不會覆寫既有檔案" 0 "已存在，未覆寫" \
  node "$HERE/新增場景.mjs" --root "$NSTMP" --id t1 --名 測試場景一 --職責 "a;b;c"

ns_expect "缺 --id 或 --名 時報用法錯誤" 2 "需要 --id 與 --名" \
  node "$HERE/新增場景.mjs" --root "$NSTMP"

rm -rf "$NSTMP"

echo
echo "═══ 換會話（V18–V21）═══"

SCTMP="$(mktemp -d)"
cp -r "$ROOT/04-模板/示範工作台.乾淨"/* "$SCTMP/" 2>/dev/null || true
# 示範的場景配置 json 與 §〇 署名是乾淨版自帶的；補一個可讀的下一步
python3 - "$SCTMP/場景/示範場景/場景私有記憶.md" <<'PYEOF' 2>/dev/null || true
import sys, re
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
if '- 下一步：' not in t:
    t = re.sub(r'### 4\) 下一步 / 卡點\n', '### 4) 下一步 / 卡點\n- 下一步：跑一次 check\n', t)
    open(p, 'w', encoding='utf-8').write(t)
PYEOF

swap_expect() {  # swap_expect <描述> <預期 exit> <關鍵字> <指令...>
  local desc="$1" want="$2" kw="$3"; shift 3
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     期望 exit=$want 含「$kw」，實際 exit=$rc"
    echo "$out" | sed 's/^/     /' | head -8
    fail=$((fail+1))
  fi
}

swap_expect "三處同步一致時自檢通過" 0 "全部通過" \
  node "$HERE/換會話.mjs" 檢查 --root "$SCTMP" --場景 示範場景

# 故意只改一處 ⇒ 必須被擋
python3 - "$SCTMP/場景/_場景身份索引.md" <<'PYEOF' 2>/dev/null || true
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read().replace('session-demo0001', 'session-demo0002')
open(p, 'w', encoding='utf-8').write(t)
PYEOF
swap_expect "只同步一處會被擋（三處不一致）" 1 "三處會話 id 不一致" \
  node "$HERE/換會話.mjs" 檢查 --root "$SCTMP" --場景 示範場景

# 改回來，再驗「指定新會話 id ��對上了」
cp "$ROOT/04-模板/示範工作台.乾淨/場景/_場景身份索引.md" "$SCTMP/場景/_場景身份索引.md"
swap_expect "指定新會話 id 全部對得上" 0 "已同步" \
  node "$HERE/換會話.mjs" 檢查 --root "$SCTMP" --場景 示範場景 --新會話id session-demo0001

swap_expect "指定新會話 id 但有一處沒改 ⇒ 擋" 1 "不是新會話 id" \
  node "$HERE/換會話.mjs" 檢查 --root "$SCTMP" --場景 示範場景 --新會話id session-demo0002

rm -rf "$SCTMP"

echo
echo "═══ 會話檔案層（V22–V25）═══"

AFTMP="$(mktemp -d)"
mkdir -p "$AFTMP/場景"
cat > "$AFTMP/場景/_場景身份索引.md" <<'EOF'
# 場景身份索引

| 場景id | 面板id | 面板標題 | 會話名 | 會話id | 定位卡 | 主技能 |
|---|---|---|---|---|---|---|
EOF
cat > "$AFTMP/匯出.json" <<'EOF'
{
  "會話id": "session-test0001",
  "會話名": "測試場景",
  "場景id": "test-scene",
  "開始時間": "2026-11-02T10:00:00+08:00",
  "訊息": [
    { "角色": "使用者", "文字": "做一件事" },
    { "角色": "助手", "文字": "做好了" }
  ]
}
EOF

swap_expect "抽出會話 → 產出檔案與索引" 0 "已抽出" \
  node "$HERE/會話檔案.mjs" 抽出 --root "$AFTMP" --引擎端 "$AFTMP/匯出.json" --場景 測試場景

swap_expect "索引檔存在且列得到" 0 "session-test0001" \
  node "$HERE/會話檔案.mjs" 列出 --root "$AFTMP"

swap_expect "會話檔案層檢查通過" 0 "全部通過" \
  node "$HERE/會話檔案.mjs" 檢查 --root "$AFTMP"

# 索引指向不存在的檔 ⇒ 擋
sed -i 's|會話檔案/測試場景/[^ |]*|會話檔案/測試場景/不存在.md|' "$AFTMP/會話檔案/_會話檔案索引.md" 2>/dev/null || true
swap_expect "索引指向不存在的檔會被擋" 1 "索引指向不存在的檔案" \
  node "$HERE/會話檔案.mjs" 檢查 --root "$AFTMP"

rm -rf "$AFTMP"

echo
echo "═══ 結果：$pass 通過，$fail 失敗 ═══"
rm -rf "$WORK"; cp -r "$ROOT/04-模板/示範工作台.乾淨" "$WORK"
[ "$fail" = 0 ] && exit 0 || exit 1
