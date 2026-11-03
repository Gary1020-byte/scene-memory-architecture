#!/usr/bin/env node
/**
 * 場景戊 —— 把「標準場景」一次建好
 *
 * 用法：
 *   node 新增場景.mjs --root <工作台根> --id <場景id> --名 <場景名> [--職責 "a;b;c"] [--目錄 <目錄名>]
 *   node 新增場景.mjs --root <工作台根> --規格 <規格檔.json>   # 批次/從檔案
 *
 * 退出碼：0 = 建成；1 = 有問題；2 = 用法錯誤
 *
 * ★ 這支工具做的是「引擎中立的部分」：
 *   建目錄、git init、寫六件套、登記身份索引。
 *   **不碰引擎**——建立常駐會話是引擎端的事（DSH：工具/建會話.sh）。
 *   引擎端做完後回填 sessionId 到兩處，再跑 stamp + check。
 *
 * ★ 為什麼要有這支工具：
 *   新增場景的失敗模式全是「漏了某一步但症狀不明顯」
 *   （忘了 git init ⇒ 專屬技能消失但看起來像場景變笨；
 *     sessionId 只填一處 ⇒ check 全紅但看不出哪裡錯）。
 *   工具把可機械化的步驟自動化，剩下的交給引擎端與人。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  loadRules, resolveMemoryRoot, resolveIndexPath, readText, writeText, exists, today,
} from './工作台.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneId = getArg('--id')
const sceneName = getArg('--名')
const dutiesArg = getArg('--職責')
const dirName = getArg('--目錄')
const specFile = getArg('--規格')

if (!root) {
  console.error('用法：node 新增場景.mjs --root <工作台根> --id <場景id> --名 <場景名> [--職責 "a;b;c"] [--目錄 <目錄名>]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const indexPath = resolveIndexPath(root)

/* ───────────────────────── 模板 ───────────────────────── */

function tpl定位卡 (id, name, dir, panelRel) {
  return `# ${name} · 定位卡

- 場景 id：\`${id}\`
- 場景名：${name}
- 面板：\`${panelRel}\`
- 記憶目錄：\`${rules.場景根目錄}/${dir}/\`
- 專屬技能：\`${id}\`（\`${rules.場景根目錄}/${dir}/${rules.技能目錄}/${id}/${rules.技能檔名}\`）
- 定位卡版本：1
`
}

function tpl憲法 (id, name) {
  return `# 場景憲法 · ${name}（\`${id}\`）

> 本文件是本場景的「憲法層」，由引擎的 \`agent-instructions\` 注入到本場景會話的上下文里。
> 作用域：本目錄是獨立 git 倉庫 ⇒ 只有 cwd 落在本目錄樹內的會話才吃得到這份憲法。

## 我是誰

- 場景 id：\`${id}\` ｜ 場景名：${name}
- 定位卡：\`./${rules.定位卡檔名}\`（先讀它）
- 專屬技能：\`${id}\`（只在本場景倉庫內的會話可見）
- 記憶真源：\`./${rules.memoryFile}\`（**唯一真源**，不是聊天記錄）

## 職責邊界（劃死，別越界）

- **負責**：見定位卡與 \`./${rules.memoryFile}\` 的「核心職責」。
- **不碰**：別的場景的記憶目錄。發現別人寫錯 ⇒ **只能發請求，不許代改**。
- 只寫自己的 \`./${rules.memoryFile}\`、\`./${rules.專案記憶目錄}/\`、\`./${rules.歸檔目錄}/\`。
- 不寄信／收信／Gmail・IMAP 存取（那是郵件處理場景）
- 不發布／不公開到外部服務（那是產品發布場景）
- 不刪檔、不代改別的場景的記憶（發現寫錯 → 派單或留言提醒）
- 不動 Docker／containerd／fstab 或刪檔（要先報計畫並取得使用者同意）

## 歸屬檢查（動手前必做）

1. **先判這活歸誰**：\`node <工作台根>/工具/派單.mjs 路由 --要 "<一句話>"\`。
   - 命中 → 那是正主。**本場景只做自己那份，其餘派單給它**，等回執再往下走。
   - 退出碼 3（機械命中不了）→ 讀該場景 \`AGENTS.md\` 的職責段；仍不確定 → 問使用者。
2. **本場景職責外的活，一律派單，不得自己動手。**
3. **「本機能直接跑通」≠「該由我跑」。** 摸到鑰匙（帳密／token／API key／憑證檔）先停下來，確認歸屬再動。
4. **派了單就不要自己做那份。** 派單＝移交，不是請求人幫忙；等回執回來才算收工。

## 記憶規則（最重要的四條）

1. **開場第一件事**：讀 \`./${rules.memoryFile}\` 的 \`## §〇 當前交接\`。
2. **§〇 ≤ 4 KB**，覆蓋寫；主文件 ≤ 25 KB；細節沉到 \`## §五 決策與坑\`（只追加）。
3. **寫回判據**：只記結論，不記過程；一次寫回 ≤ 10 行 / ≤ 2 KB。
4. **換會話前**：先寫交接 → 跑 \`場景記憶.mjs check --場景 ${name}\`，**不過不許換**。

## 換會話協議（四步，第 ③ 步不能省）

1. 覆蓋寫 \`§〇 當前交接\`
2. 新建會話，舊會話歸檔
3. **同步三處**：場景 json 的 \`sessionId\` / 身份索引表的會話 id 欄 / \`§〇\` 交接署名
4. 自檢：\`node <工作台根>/工具/場景記憶.mjs check --場景 ${name}\`

## 跨場景

- 只能發**通知 / 派單 / 回執**；⛔ 不許改對方的記憶。
- 派單四件套：**做什麼 · 判據 · 落盤位置 · 回執方式**；**一次派單 = 一條回執**。
- 對方不回 ⇒ 算「未回執」，別當已經幹完。

## 工具

\`\`\`bash
node <工作台根>/工具/場景記憶.mjs list                    # 一覽所有場景缺什麼
node <工作台根>/工具/場景記憶.mjs check --場景 ${name}    # 自檢
node <工作台根>/工具/場景記憶.mjs 交接 --場景 ${name}    # 歸檔舊版 + 補 §₀
\`\`\`
`
}

function tpl技能 (id, name, absDir) {
  return `---
name: ${id}
description: 【場景：${name}】${name}場景的專屬技能：開場接手本場景記憶、干完把結論寫回場景私有記憶、給別的場景發派單/回執。當會話的工作目錄位於 ${absDir} 時使用。
---

# ${name} · 場景專屬技能

1. **接手**：讀 \`./${rules.memoryFile}\` 的 \`## §〇 當前交接\`（≤4 KB，五小節：上次交接 / 當前專案 / 私有記憶變更 / 下一步·卡點 / 全貌）。
2. **幹活**：只碰本場景的目錄與本場景的記憶；別人的地盤只發請求。
3. **寫回**：把結論寫回 \`§₀\`（≤10 行/≤2 KB，只記結論不記過程）；細節追加進 \`## §五 決策與坑\`。
4. **交接**：收工或換會話前跑 \`場景記憶.mjs 交接 --場景 ${name}\`，然後 \`check\` 通過才換。
5. **跨場景**：動手前先判歸屬（跑 \`派單.mjs 路由\`）；派單要寫清 做什麼·判據·落盤位置·回執方式。

> ⚠️ **description 裡的路徑是場景目錄的絕對路徑** —— 那是引擎判斷
> 「這個技能在不在本場景可見」的依據。
`
}

function tpl記憶 (name, duties) {
  const dutyLines = duties.map((d) => `- ${d}`).join('\n')
  return `# ${name} · 場景私有記憶

> 身份與形態見 \`身份卡.md\` / \`場景畫像.md\`（工具生成，⛔ 手改）
> 規矩：這份記憶只有本場景能改寫；別的場景發現錯誤只能提醒。

## §〇 當前交接（≤ 4 KB，新會話先讀這一節）

${rules.交接段小節[0]}
- （交接時由工具寫入：舊版已歸檔 \`${rules.歸檔目錄}/<檔名>\`）

${rules.交接段小節[1]}
| 專案 | 記憶檔 | 狀態 | 下一步 |
|---|---|---|---|
| （暫無） | — | — | — |

${rules.交接段小節[2]}
- 

${rules.交接段小節[3]}
- 下一步：
- 卡點：

${rules.交接段小節[4]}
- 專案記憶 0 個 · ${rules.歸檔目錄} 0 份 · 索引 ${rules.fileIndexFile}

## ${rules.職責區塊標題.replace('## ', '')}

${dutyLines}
- 不碰：不擅自改別的場景的記憶（發現寫錯只能派單提醒）。
- 一句話：

## §一 我管什麼 / 不管什麼

- 管：
- 不管：

## §二 幹活入口

- 專案記憶：\`${rules.專案記憶目錄}/<專案名>.md\`（索引表放上面 §〇 第 2 小節）
- ${rules.歸檔目錄}：\`${rules.歸檔目錄}/\`
- 索引：\`${rules.fileIndexFile}\`

## §五 決策與坑（只追加）

## 〇-通知
`
}

function tpl檔案索引 (name) {
  const d = today()
  return `# ${name} · 檔案索引

> 狀態四態：\`活 / 常備 / 留檔 / 待清\`

| 檔案 / 目錄 | 是什麼 | 狀態 | 複核日期 |
|---|---|---|---|
| \`${rules.memoryFile}\` | 場景私有記憶（人寫：交接/職責/決策/專案索引） | 活 | ${d} |
| \`${rules.identityFile}\` | 身份卡（工具生成：身分/權限/定位卡指紋） | 活 | ${d} |
| \`${rules.portraitFile}\` | 場景畫像（工具生成） | 活 | ${d} |
| \`${rules.專案記憶目錄}/\` | 每個專案一份記憶 | 活 | ${d} |
| \`${rules.歸檔目錄}/\` | 舊版快照（只進不改） | 留檔 | ${d} |
`
}

/* ───────────────────────── 主流程 ───────────────────────── */

function createScene ({ id, name, dir, duties }) {
  const sceneDir = path.join(memRoot, dir)
  const absDir = path.resolve(sceneDir)
  const panelRel = `scenarios/${id}.json`
  const steps = []

  // ① 目錄
  for (const d of ['', path.join(rules.技能目錄, id), rules.專案記憶目錄, rules.歸檔目錄]) {
    fs.mkdirSync(path.join(sceneDir, d), { recursive: true })
  }
  steps.push(['建目錄', path.relative(root, sceneDir)])

  // ② git init（邊界）
  const mark = rules.邊界標記檔名
  if (!exists(path.join(sceneDir, mark))) {
    try {
      execFileSync('git', ['init', '-q'], { cwd: sceneDir, stdio: 'pipe' })
      execFileSync('git', ['config', 'user.name', 'workbench'], { cwd: sceneDir, stdio: 'pipe' })
      execFileSync('git', ['config', 'user.email', 'workbench@local'], { cwd: sceneDir, stdio: 'pipe' })
      steps.push(['git init（場景邊界）', '★ 沒有它，專屬技能不會被載入，且症狀不明顯'])
    } catch (e) {
      console.error('✗ git init 失敗：' + e.message)
      return 1
    }
  } else {
    steps.push(['git init', '已存在，跳過'])
  }

  // ③ 六件套
  const files = [
    [rules.定位卡檔名, tpl定位卡(id, name, dir, panelRel)],
    [rules.場景憲法檔名, tpl憲法(id, name)],
    [path.join(rules.技能目錄, id, rules.技能檔名), tpl技能(id, name, absDir)],
    [rules.memoryFile, tpl記憶(name, duties)],
    [rules.fileIndexFile, tpl檔案索引(name)]
  ]
  for (const [rel, body] of files) {
    const p = path.join(sceneDir, rel)
    if (exists(p)) {
      steps.push([rel, '已存在，未覆寫'])
      continue
    }
    writeText(p, body)
    steps.push([rel, '建立'])
  }

  // ④ 身份索引登記
  const idx = readText(indexPath)
  const row = `| \`${id}\` | \`${id}-ai\` | AI·${name} | ${name} | \`（待回填）\` | \`${absDir}/${rules.定位卡檔名}\` | ${id} |`
  if (idx.includes(`\`${id}\``)) {
    steps.push(['身份索引', '已有這一行，未重複加'])
  } else {
    const lines = idx.split('\n')
    const out = []
    let inserted = false
    for (const line of lines) {
      out.push(line)
      // 插在最後一行表格資料之後（表格行都以 | ` 開頭）
      if (!inserted && line.startsWith('| `') && line.includes('|')) {
        out.push(row)
        inserted = true
      }
    }
    if (!inserted) {
      // 沒有表格就插在檔尾
      out.push('')
      out.push(row)
    }
    writeText(indexPath, out.join('\n'))
    steps.push(['身份索引', `登記 \`${id}\` 一行（sessionId 待回填）`])
  }

  return { steps, sceneDir, absDir }
}

/* ───────────────────────── 執行 ───────────────────────── */

const specs = []
if (specFile) {
  const j = JSON.parse(readText(specFile))
  const arr = Array.isArray(j) ? j : [j]
  for (const s of arr) specs.push(s)
} else {
  if (!sceneId || !sceneName) {
    console.error('需要 --id 與 --名（或 --規格）')
    process.exit(2)
  }
  specs.push({
    id: sceneId,
    名: sceneName,
    目錄: dirName || sceneName,
    職責: (dutiesArg || '').split('；').map(s => s.trim()).filter(Boolean),
  })
}

for (const s of specs) {
  const id = s.id
  const name = s.名 || s.name
  const dir = s.目錄 || s.dir || name
  const duties = (s.職責 || s.duties || []).length ? (s.職責 || s.duties) : [
    `负责：${name}場景的職責（請改成具體的一句）`,
    '不碰：不擅自改別的場景的記憶（發現寫錯只能派單提醒）。',
    '一句话：',
  ]

  console.log(`\n▸ 建立場景「${name}」（${id}）`)
  const res = createScene({ id, name, dir, duties })
  if (res === 1) process.exit(1)
  for (const [what, note] of res.steps) {
    console.log(`  ✓ ${what.padEnd(24)} ${note}`)
  }
  console.log(`\n  場景目錄：${res.absDir}`)
}

console.log('\n═══ 還沒做的（引擎端）═══')
console.log('① 在引擎端建立場景定義 json（用 04-模板/場景定義模板.json，name 欄＝場景目錄名）')
console.log('② 建立常駐會話（DSH：bash 工具/建會話.sh <場景名>）')
console.log('③ 回填 sessionId 到「場景定義 json」與「身份索引」兩處')
console.log('④ node 場景記憶.mjs stamp --場景 <場景名> --root <工作台根>')
console.log('⑤ node 場景記憶.mjs check --場景 <場景名> --root <工作台根>   ← 必須全綠')
