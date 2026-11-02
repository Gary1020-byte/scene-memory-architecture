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
echo "═══ 結果：$pass 通過，$fail 失敗 ═══"
rm -rf "$WORK"; cp -r "$ROOT/04-模板/示範工作台.乾淨" "$WORK"
[ "$fail" = 0 ] && exit 0 || exit 1
