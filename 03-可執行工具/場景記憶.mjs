#!/usr/bin/env node
/**
 * 場景記憶.mjs —— 場景記憶校驗工具
 *
 * 五個命令：
 *   list                    一覽：每個場景缺什麼
 *   init   --場景 <名>      建目錄骨架 + 三份文件（已存在不覆蓋）
 *   stamp  --場景 <名>      重生成 身份卡 + 場景畫像
 *   交接   --場景 <名>      歸檔舊版 + 補 §₀ 小節 + stamp + 登記索引
 *   check  --場景 <名>      ★ 全檢：結構/指紋/§〇/專案/歸檔（--all 全場景）
 *
 * 設計原則：
 *   ① 規則單一來源 —— 紅線、小節清單、指紋長度都讀 交接規則.json，不硬編碼。
 *   ② fail-closed —— 結構性錯誤擋住（退出碼 1），品質問題只警告。
 *   ③ 工具不碰資料 —— 工具只生成/檢查，場景記憶的正文永遠由人寫。
 *
 * 用法：
 *   node 場景記憶.mjs list
 *   node 場景記憶.mjs check --場景 場景甲
 *   node 場景記憶.mjs check --all
 *   node 場景記憶.mjs check --場景 場景甲 --root <工作台根>
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ───────────────────────── 規則單一來源 ───────────────────────── */

/**
 * 規則 key 對照表：規則檔用中文 key，程式內部用英文 key。
 * 兩邊都支援 —— 規則檔改名或換語言都不會讓工具讀不到值。
 */
const RULE_KEY_ALIAS = {
  version: '版本',
  sec0MaxBytes: '交接段紅線位元組',
  mainMaxBytes: '主檔案紅線位元組',
  projectMaxBytes: '專案記憶紅線位元組',
  skillMaxBytes: '技能紅線位元組',
  fingerprintLength: '指紋長度',
  sec0Subsections: '交接段小節',
  dutyHeading: '職責區塊標題',
  dutyMinItems: '職責最少條數',
  memoryFile: '記憶檔名',
  identityFile: '身份卡檔名',
  portraitFile: '場景畫像檔名',
  fileIndexFile: '檔案索引檔名',
  projectDir: '專案記憶目錄',
  archiveDir: '歸檔目錄',
  indexFile: '身份索引檔名',
}

/** 內建預設規則；若工具目錄有交接規則.json 則以它為準（★ 規則不硬編碼） */
const DEFAULT_RULES = {
  version: 1,
  sec0MaxBytes: 4096,
  mainMaxBytes: 25600,
  projectMaxBytes: 8192,
  skillMaxBytes: 12288,
  fingerprintLength: 16,
  sec0Subsections: [
    '### 1) 上次交接',
    '### 2) 當前專案',
    '### 3) 私有記憶變更',
    '### 4) 下一步 / 卡點',
    '### 5) 全貌',
  ],
  dutyHeading: '## 核心職責',
  dutyMinItems: 3,
  memoryFile: '場景私有記憶.md',
  identityFile: '身份卡.md',
  portraitFile: '場景畫像.md',
  fileIndexFile: '_檔案索引.md',
  projectDir: '專案記憶',
  archiveDir: '歸檔',
  indexFile: '_場景身份索引.md',
  邊界標記檔名: '.git',
  邊界標記替代檔名: '.git-marker',
}

/** 把中文 key 的規則檔正規化成英文 key（英文 key 優先，中文 key 補齊） */
function normalizeRules (raw) {
  const out = { ...raw }
  for (const [en, zh] of Object.entries(RULE_KEY_ALIAS)) {
    if (out[en] === undefined && raw[zh] !== undefined) out[en] = raw[zh]
  }
  // 中文 key 也保留一份，讓規則檔裡新增的欄位（如邊界標記）能直接被讀到
  for (const [en, zh] of Object.entries(RULE_KEY_ALIAS)) {
    if (out[zh] === undefined && raw[en] !== undefined) out[zh] = raw[en]
  }
  return out
}

function loadRules (root) {
  const candidates = [
    path.join(HERE, '交接規則.json'),
    path.join(root || '', '交接規則.json'),
    path.join(HERE, '..', '04-模板', '交接規則.json'),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ...DEFAULT_RULES, ...normalizeRules(j), _source: p }
    } catch (e) {
      console.error('⚠ 規則檔讀不動（' + p + '）：' + e.message + ' ⇒ 用內建預設')
    }
  }
  return { ...DEFAULT_RULES, _source: '(內建預設)' }
}

/* ───────────────────────── 路徑解析 ───────────────────────── */

const argv = process.argv.slice(2)
const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] || '') : '' }
const has = (k) => argv.includes(k)

function resolveRoot () {
  const explicit = val('--root')
  if (explicit) return path.resolve(explicit)
  const env = process.env.DSH_WORKBENCH_ROOT
  if (env) return path.resolve(env)
  return path.resolve(HERE, '..')
}

/**
 * 記憶根候選鏈（★ 統一路徑解析，避免「看板分裂」）
 *   環境變數 → <根>/場景 → <根>/引擎數據/.dsh/場景記憶
 * 取第一個存在且是目錄的。
 */
function resolveMemoryRoot (root) {
  const cands = [
    process.env.DSH_SCENE_MEMORY,
    path.join(root, '場景'),
    path.join(root, '引擎數據', '.dsh', '場景記憶'),
  ].filter(Boolean)
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* 跳過 */ }
  }
  return cands[1] || path.join(root, '場景')
}

/** 身份索引候選鏈（同樣道理：索引搬位不該讓工具全盲） */
function resolveIndexPath (root) {
  const cands = [
    path.join(root, '場景', '_場景身份索引.md'),
    path.join(root, '外壳', 'scenarios', '_場景身份索引.md'),
  ]
  return cands.find((p) => fs.existsSync(p)) || cands[0]
}

/* ───────────────────────── 小工具 ───────────────────────── */

const sha = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') } catch { return '' }
}
const now = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const stampId = () => now().replace(/[-: ]/g, '').slice(0, 12)
const readText = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const sizeOf = (p) => { try { return fs.statSync(p).size } catch { return 0 } }

/** §〇 段的位元組數（從 §〇 標題到下一個同級標題） */
function sec0Range (txt) {
  const mNew = txt.match(/^## §〇[^\n]*$/m)
  const mOld = txt.match(/^## 〇、當前交接[^\n]*$/m)
  const h = mNew ? mNew.index : (mOld ? mOld.index : -1)
  if (h < 0) return { h: -1, bytes: 0, text: '', hasOld: !!mOld, hasNew: !!mNew }
  let end = txt.length
  const nxt = txt.indexOf('\n## ', h + 5)
  if (nxt > h) end = nxt
  return { h, bytes: Buffer.byteLength(txt.slice(h, end)), text: txt.slice(h, end), hasOld: !!mOld, hasNew: !!mNew }
}

/** 取某個 ### 小節的內容 */
function subsection (txt, head) {
  const i = txt.indexOf(head)
  if (i < 0) return ''
  const e = txt.indexOf('\n### ', i + head.length)
  return txt.slice(i, e > i ? e : txt.length)
}

/* ───────────────────────── 身份索引 ───────────────────────── */

function readIdentity (indexPath, root) {
  const map = new Map()
  const txt = readText(indexPath)
  if (!txt) return map
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const c = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
    if (c.length < 7) continue
    const id = c[0]
    if (!/^[a-z0-9-]+$/.test(id)) continue
    // 定位卡欄位可能是：相對於工作台根 / 相對於場景層 / 絕對路徑 —— 統一解析成絕對路徑
    const cardRaw = (c[5] || '').replace(/^scenarios[\\/]/, '')
    let card = ''
    if (cardRaw) {
      if (path.isAbsolute(cardRaw)) card = cardRaw
      else {
        const cand = path.resolve(root, cardRaw)
        card = fs.existsSync(cand) ? cand : path.resolve(root, '場景', cardRaw)
      }
    }
    map.set(id, {
      id,
      panel: c[1],
      title: c[2],
      sessionName: c[3],
      sessionId: c[4],
      card,
      cardRaw,
      skill: c[6] || '',
    })
  }
  return map
}

/* ───────────────────────── 骨架 ───────────────────────── */

function buildMemoryFile (rules, name) {
  const subs = rules.sec0Subsections.map((s, i) => {
    if (i === 0) return s + '\n- （交接時由工具寫入：舊版已歸檔 `歸檔/<檔名>`）'
    if (i === 1) return s + '\n| 專案 | 記憶檔 | 狀態 | 下一步 |\n|---|---|---|---|\n| （暫無） | — | — | — |'
    if (i === 2) return s + '\n- （本輪改了什麼，≤3 行）'
    if (i === 3) return s + '\n- （寫給下一任）'
    return s + '\n- 專案記憶 0 個 · 歸檔 0 份 · 索引 _檔案索引.md\n- 身份卡 / 場景畫像 / 共享層 areas 已就位\n- 卡點 / 等誰：見第 4 節'
  }).join('\n\n')

  return `# ${name} · 場景私有記憶

> 身份與形態見 \`${rules.identityFile}\` / \`${rules.portraitFile}\`（工具生成，⛔ 手改）
> 規矩：這份記憶只有本場景能改寫；別的場景發現錯誤只能提醒。

## §〇 當前交接（≤${rules.sec0MaxBytes / 1024} KB，新會話先讀這一節）

${subs}

## 核心職責

- 負責：（待補 —— 用一句話說清「什麼事找我」）
- 不碰：（待補 —— 用一句話說清「什麼別找我」）
- 一句話：（待補 —— 能不能一句話說清這個場景為什麼存在）

## §一 我管什麼 / 不管什麼

- 管：
- 不管：

## §二 幹活入口

- 專案記憶：\`${rules.projectDir}/<專案名>.md\`（當前專案索引表放上面 §〇 第 2 小節）
- 歸檔：\`${rules.archiveDir}/\`
- 索引：\`${rules.fileIndexFile}\`

## §五 決策與坑（只追加）

## 〇-通知
`
}

function buildIdentityCard (rules, name, ident, root) {
  const card = ident?.card || ''
  const fp = card ? sha(card).slice(0, rules.fingerprintLength) : ''
  // ⛔ 產出裡只寫「相對於工作台根」的路徑 —— 公開的模板不該綁死執行機器的絕對路徑
  const cardShown = card ? relToRoot(card, root) : '(缺)'
  return `# ${name} · 身份卡（工具生成 · ⛔ 手改即校驗失敗）

<!-- 場景綁定 BEGIN · 由 場景記憶.mjs 生成 -->
> **場景** \`${ident?.id || '?'}\` ｜ **面板** \`${ident?.panel || '?'}\` ｜ **會話** \`${ident?.sessionId || '?'}\`
> **定位卡** \`${cardShown}\` ｜ **卡指紋** \`sha256:${fp || '(缺)'}…\` ｜ **蓋章** ${now()}
> **地盤** \`${name}\`
> **權限** 只寫自己的記憶資料夾與本人資產；⛔ 不改別的場景、不重啟引擎
> **專屬技能** ${ident?.skill || '(無)'}
<!-- 場景綁定 END -->

## 怎麼用
- 開場第一份讀的是**這張卡**：我是誰、在哪個面板、會話是哪條、能碰什麼。
- 定位卡改了 ⇒ 立刻跑 \`場景記憶.mjs stamp --場景 ${name}\`，否則 check 會報指紋過期。
- 本檔案由工具全量重寫；要補充說明請寫進 \`${rules.memoryFile}\`，別寫這裡。
`
}

// 把絕對路徑轉成「相對於工作台根」；不在工作台內則原樣保留
function relToRoot (abs, root) {
  if (!abs || !root) return abs
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return abs
  return rel
}

function buildPortrait (rules, name, ident, root) {
  // ⛔ 同上：路徑一律寫相對工作台根，不寫執行機器的絕對路徑
  const cardShown = ident?.card ? relToRoot(ident.card, root) : '(缺)'
  return `# ${name} · 場景畫像（工具生成 · 由場景 json 推導）

> 來源：場景 json + 定位卡 ｜ 生成 ${now()}
> 一句話：（從場景 json 的 description 推導；本通用模板不綁定特定引擎）

## 一、形態
- 面板數：見場景 json

## 二、專屬技能
- ${ident?.skill || '(無)'}

## 三、記憶
- 記憶資料夾：\`${name}/\`
- 交接段：\`${rules.memoryFile}\` 的 §〇（≤ ${rules.sec0MaxBytes / 1024} KB）
- 專案記憶：\`${rules.projectDir}/\`（≤ ${rules.projectMaxBytes / 1024} KB／份）

## 四、依賴與入口
- 定位卡：${cardShown === '(缺)' ? '(缺)' : '`' + cardShown + '`'}
- 綁定會話：${ident?.sessionId || '(未綁)'}

> 本檔案由工具推導生成；場景 json 改了就 \`stamp\`。
`
}

function buildFileIndex (rules, name) {
  const d = now().slice(0, 10)
  return `# ${name} · 檔案索引

> 狀態四態：\`活 / 常備 / 留檔 / 待清\`

| 檔案 / 目錄 | 是什麼 | 狀態 | 複核日期 |
|---|---|---|---|
| \`${rules.memoryFile}\` | 場景私有記憶（人寫：交接/職責/決策/專案索引） | 活 | ${d} |
| \`${rules.identityFile}\` | 身份卡（工具生成：身分/權限/定位卡指紋） | 活 | ${d} |
| \`${rules.portraitFile}\` | 場景畫像（工具生成） | 活 | ${d} |
| \`${rules.projectDir}/\` | 每個專案一份記憶 | 活 | ${d} |
| \`${rules.archiveDir}/\` | 舊版快照（只進不改） | 留檔 | ${d} |
`
}

/* ───────────────────────── 場景甲 ───────────────────────── */

function ensureSkeleton (dir, name, rules) {
  fs.mkdirSync(path.join(dir, rules.archiveDir), { recursive: true })
  fs.mkdirSync(path.join(dir, rules.projectDir), { recursive: true })
  const main = path.join(dir, rules.memoryFile)
  if (!fs.existsSync(main)) {
    fs.writeFileSync(main, buildMemoryFile(rules, name), 'utf8')
    console.log('  ✓ 建立 ' + rules.memoryFile)
  }
  const fidx = path.join(dir, rules.fileIndexFile)
  if (!fs.existsSync(fidx)) {
    fs.writeFileSync(fidx, buildFileIndex(rules, name), 'utf8')
    console.log('  ✓ 建立 ' + rules.fileIndexFile)
  }
}

function cmdInit (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ 找不到場景目錄：' + dir + '\n   （先建目錄與 .git，再跑 init）')
    return 2
  }
  console.log('▸ ' + name + '：建立骨架')
  ensureSkeleton(dir, name, rules)
  return cmdStamp(root, memRoot, rules, name)
}

function cmdStamp (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ 找不到場景目錄：' + dir)
    return 2
  }
  const indexPath = resolveIndexPath(root)
  const ident = findIdentity(indexPath, name, root)
  if (!ident) {
    console.error('✗ 身份索引裡找不到這個場景：' + name)
    console.error('   索引位置：' + indexPath + (fs.existsSync(indexPath) ? '' : '（檔案不存在）'))
    return 1
  }
  fs.writeFileSync(path.join(dir, rules.identityFile), buildIdentityCard(rules, name, ident, root), 'utf8')
  fs.writeFileSync(path.join(dir, rules.portraitFile), buildPortrait(rules, name, ident, root), 'utf8')
  console.log('✓ ' + name + '：身份卡 + 場景畫像 已重生成' +
    (ident.card ? '（卡指紋 ' + sha(ident.card).slice(0, 12) + '…）' : '（定位卡找不到，指紋留空）'))
  return 0
}

/** 由場景名稱或 id 找索引條目 */
function findIdentity (indexPath, name, root) {
  const map = readIdentity(indexPath, root)
  for (const v of map.values()) {
    if (v.id === name || v.title === name || v.sessionName === name) return v
  }
  return null
}

function cmdHandover (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ 找不到場景目錄：' + dir)
    return 2
  }
  const main = path.join(dir, rules.memoryFile)
  ensureSkeleton(dir, name, rules)
  let body = fs.readFileSync(main, 'utf8')

  // ① 舊版快照進歸檔
  const ident = findIdentity(resolveIndexPath(root), name, root)
  const sid6 = (ident?.sessionId || '').replace('session-', '').slice(0, 6) || 'nosid'
  const archFile = `${rules.memoryFile.replace(/\.md$/, '')}-${stampId()}-${sid6}.md`
  fs.writeFileSync(path.join(dir, rules.archiveDir, archFile), body, 'utf8')
  console.log('✓ 舊版已歸檔：' + rules.archiveDir + '/' + archFile + '（' + Buffer.byteLength(body) + ' B）')

  // ② 缺的小節才補（不覆蓋已有正文）
  const missing = []
  for (const sub of rules.sec0Subsections) {
    if (body.includes(sub)) continue
    const head = sub.replace(/^### /, '')
    if (sub.includes('1)')) missing.push(sub + '\n- 舊版已歸檔 `' + rules.archiveDir + '/' + archFile + '`\n')
    else if (sub.includes('2)')) missing.push(sub + '\n| 專案 | 記憶檔 | 狀態 | 下一步 |\n|---|---|---|---|\n| （暫無） | — | — | — |\n')
    else if (sub.includes('3)')) missing.push(sub + '\n- \n')
    else if (sub.includes('4)')) missing.push(sub + '\n- \n')
    else missing.push(sub + '\n- 專案記憶 0 個 · 歸檔 0 份 · 索引 ' + rules.fileIndexFile + '\n- 卡點 / 等誰：見第 4 節\n')
    void head
  }
  if (missing.length) {
    const h = body.indexOf('## §〇')
    if (h >= 0) {
      const lineEnd = body.indexOf('\n', h)
      const at = lineEnd >= 0 ? lineEnd + 1 : body.length
      body = body.slice(0, at) + '\n' + missing.join('\n') + body.slice(at)
    } else {
      body = '# ' + name + ' · 場景私有記憶\n\n## §〇 當前交接（≤' + rules.sec0MaxBytes / 1024 + ' KB）\n\n' + missing.join('\n') + '\n' + body
    }
    fs.writeFileSync(main, body, 'utf8')
  }
  console.log('✓ §₀ 補齊 ' + missing.length + ' 個小節（缺才補，不覆寫已有正文）')

  // ③ 登記索引
  const fidx = path.join(dir, rules.fileIndexFile)
  if (fs.existsSync(fidx)) {
    fs.appendFileSync(fidx, `| \`${rules.archiveDir}/${archFile}\` | 交接前快照（只進不改） | 留檔 | ${now().slice(0, 10)} |\n`, 'utf8')
  }

  // ④ 重蓋卡
  return cmdStamp(root, memRoot, rules, name)
}

function cmdCheck (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  const problems = []   // 擋
  const warns = []      // 只提示
  const ok = []         // 通過

  if (!fs.existsSync(dir)) {
    console.log('\n' + name + '：✗ 沒有這個場景目錄（' + dir + '）')
    return 1
  }

  // 必要檔案與目錄
  for (const f of [rules.memoryFile, rules.identityFile, rules.portraitFile, rules.fileIndexFile]) {
    if (fs.existsSync(path.join(dir, f))) ok.push(f); else problems.push('缺檔案 ' + f)
  }
  for (const d of [rules.projectDir, rules.archiveDir]) {
    if (fs.existsSync(path.join(dir, d))) ok.push(d + '/'); else problems.push('缺目錄 ' + d + '/')
  }

  // ★ 場景邊界（.git 存在性）—— 缺了會靜默降級，專屬技能全部消失
  //   真實場景用真 .git 目錄；公開倉庫的示範用 .git-marker 說明檔
  //   （git 不追蹤名為 .git 的檔案，巢狀無 commit 的倉庫又會讓 git add -A 失敗）
  const markName = rules['邊界標記檔名'] || '.git'
  const altName = rules['邊界標記替代檔名'] || '.git-marker'
  const hasMark = fs.existsSync(path.join(dir, markName))
  const hasAlt = altName !== markName && fs.existsSync(path.join(dir, altName))
  if (!hasMark && !hasAlt) {
    problems.push('場景目錄缺少 ' + markName + '（場景邊界失效 ⇒ 專屬技能不會被載入，且症狀不明顯）')
  } else {
    ok.push((hasMark ? markName : altName) + '（場景邊界）')
  }

  // 身份索引 + 卡指紋
  const indexPath = resolveIndexPath(root)
  if (!fs.existsSync(indexPath)) {
    problems.push('找不到身份索引：' + indexPath + '（工具不知道場景 ↔ 會話的對應）')
  } else {
    ok.push('身份索引：' + path.relative(root, indexPath))
  }
  const ident = findIdentity(indexPath, name, root)
  const cardPath = path.join(dir, rules.identityFile)
  if (!ident) {
    problems.push('身份索引裡沒有這張場景卡：' + name)
  } else if (fs.existsSync(cardPath)) {
    const card = fs.readFileSync(cardPath, 'utf8')
    const fp = (card.match(/sha256:([0-9a-f]+)/) || [])[1]
    if (!ident.card) {
      problems.push('身份索引的定位卡欄位是空的（欄位值：' + (ident.cardRaw || '（空）') + '）')
    } else if (!fs.existsSync(ident.card)) {
      problems.push('定位卡不存在：' + ident.card)
    } else if (!fp) {
      problems.push('身份卡裡沒有卡指紋（跑 stamp 重蓋）')
    } else {
      const real = sha(ident.card).slice(0, fp.length)
      if (!sha(ident.card).startsWith(fp)) problems.push('卡指紋過期（卡已改，跑 stamp）' + fp + '…≠' + real + '…')
      else ok.push('卡指紋一致')
    }
  }

  // 主檔案內容
  const mainPath = path.join(dir, rules.memoryFile)
  if (!fs.existsSync(mainPath)) {
    console.log('\n' + name + '：✗ 缺 ' + rules.memoryFile + '（跑 init）')
    return 1
  }
  const main = fs.readFileSync(mainPath, 'utf8')

  // 核心職責
  {
    const i = main.search(new RegExp('^' + rules.dutyHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm'))
    if (i < 0) {
      problems.push('缺「' + rules.dutyHeading + '」塊（場景私有記憶必填）')
    } else {
      const rest = main.slice(i)
      const next = rest.indexOf('\n## ', 5)
      const sec = rest.slice(0, next > 0 ? next : rest.length)
      const n = (sec.match(/^- /gm) || []).length
      if (n < rules.dutyMinItems) problems.push('核心職責只有 ' + n + ' 條（至少 ' + rules.dutyMinItems + ' 條）')
      else ok.push('核心職責 ' + n + ' 條')
    }
  }

  // §₀ 五小節
  for (const sub of rules.sec0Subsections) {
    if (!main.includes(sub)) problems.push('§〇 缺小節 ' + sub)
  }

  // §₀ 紅線
  const s0 = sec0Range(main)
  if (s0.h < 0) {
    problems.push('缺 §〇 交接頭（## §〇）')
  } else {
    if (s0.bytes > rules.sec0MaxBytes) problems.push('§〇 ' + s0.bytes + ' B 超 ' + (rules.sec0MaxBytes / 1024) + ' KB（紅線 ' + rules.sec0MaxBytes + '）')
    else ok.push('§〇 ' + s0.bytes + ' B')
    if (s0.hasOld) warns.push('用的是舊 §0 頭（## 〇、當前交接），建議改為 ## §〇')
    if (s0.hasOld && s0.hasNew) warns.push('新舊兩個 §0 頭並存')
  }

  // 內容告警（只警不擋）
  {
    const pmDir = path.join(dir, rules.projectDir)
    const pmCount = fs.existsSync(pmDir) ? fs.readdirSync(pmDir).filter((x) => x.endsWith('.md')).length : 0
    const seg2 = subsection(main, '### 2) 當前專案')
    if (pmCount > 0 && /（暫無）/.test(seg2)) warns.push('當前專案表寫「暫無」，但專案記憶有 ' + pmCount + ' 份（表需更新）')
    const seg4 = subsection(main, '### 4) 下一步 / 卡點')
    const body4 = seg4.split(/\r?\n/).filter((l) => /^-\s*\S/.test(l.trim()))
    if (!body4.length) warns.push('第 4 小節 下一步/卡點 為空')
    // 專案記憶超紅線
    if (fs.existsSync(pmDir)) {
      for (const f of fs.readdirSync(pmDir).filter((x) => x.endsWith('.md'))) {
        const b = sizeOf(path.join(pmDir, f))
        if (b > rules.projectMaxBytes) warns.push('專案記憶 ' + f + ' ' + (b / 1024).toFixed(1) + ' KB 超 ' + (rules.projectMaxBytes / 1024) + ' KB')
      }
    }
  }

  // 主檔案大小（只警）
  const mainBytes = Buffer.byteLength(main)
  if (mainBytes > rules.mainMaxBytes) {
    warns.push('主檔案 ' + (mainBytes / 1024).toFixed(1) + ' KB 超 ' + (rules.mainMaxBytes / 1024) + ' KB（紅線，搬舊內容進 ' + rules.archiveDir + '/ 並留指針）')
  }

  console.log('\n' + name + '：' + (problems.length ? '✗ ' + problems.length + ' 個問題' : '✓ 全部通過') +
    '（' + ok.length + ' 項通過' + (warns.length ? ' · ⚠ ' + warns.length + ' 個警告' : '') + '）')
  problems.forEach((p) => console.log('   ✗ ' + p))
  warns.forEach((p) => console.log('   ⚠ ' + p))
  return problems.length ? 1 : 0
}

function cmdList (memRoot, rules) {
  const dirs = fs.existsSync(memRoot)
    ? fs.readdirSync(memRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name)
    : []
  let bad = 0
  for (const d of dirs.sort()) {
    const has = (f) => fs.existsSync(path.join(memRoot, d, f))
    const flag = (b) => (b ? '✓' : '✗')
    // 邊界標記：真 .git 或 .git-marker（示範用），任一存在即算有邊界
    const markName = rules['邊界標記檔名'] || '.git'
    const altName = rules['邊界標記替代檔名'] || '.git-marker'
    const hasMark = has(markName) || (altName !== markName && has(altName))
    const line = '  ' + d + '   記憶' + flag(has(rules.memoryFile)) + ' 身份' + flag(has(rules.identityFile)) +
      ' 畫像' + flag(has(rules.portraitFile)) + ' 專案' + flag(has(rules.projectDir)) +
      ' 歸檔' + flag(has(rules.archiveDir)) + ' 邊界' + flag(hasMark)
    if (!(has(rules.identityFile) && has(rules.portraitFile))) bad++
    console.log(line)
  }
  console.log('\n共 ' + dirs.length + ' 個場景；缺身份卡/畫像 ' + bad + ' 個')
  return 0
}

/* ───────────────────────── 入口 ───────────────────────── */

const root = resolveRoot()
const memRoot = resolveMemoryRoot(root)
const rules = loadRules(root)
const cmd = argv[0]

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`場景記憶校驗工具 —— 記憶在檔案裡，不在會話裡

用法：
  node 場景記憶.mjs list                    一覽所有場景缺什麼
  node 場景記憶.mjs init    --場景 <名>      建立場景骨架（六件套 + 目錄結構）
  node 場景記憶.mjs stamp   --場景 <名>      重生成身份卡（含 sha256 指紋）與場景畫像
  node 場景記憶.mjs 交接    --場景 <名>      歸檔舊版 §〇 + 補 §〇 骨架
  node 場景記憶.mjs check   --場景 <名>      校驗（fail-closed，不過就擋）
  node 場景記憶.mjs check   --all           校驗所有場景

通用選項：
  --root <工作台根>   指定工作台根（預設：工具的上一層目錄）
  --場景 <名> / --scene <名>   場景名（也可直接給路徑）

退出碼：
  0 = 通過　1 = 有項目未通過　2 = 用法錯誤

規則來源：交接規則.json（紅線數字只在那裡定義一次）
驗收：bash 反例驗收.sh —— 證明「該失敗時會失敗」`)
  process.exit(0)
}

if (!cmd) {
  console.log('（未指定子命令 —— 一覽所有場景）\n')
}
if (!cmd || cmd === 'list') {
  console.log('記憶根：' + memRoot + '\n規則來源：' + rules._source + '\n')
  process.exit(cmdList(memRoot, rules))
}

const name = val('--場景') || val('--scene')

if (cmd === 'check' && has('--all')) {
  const dirs = fs.existsSync(memRoot)
    ? fs.readdirSync(memRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort()
    : []
  let n = 0
  for (const d of dirs) n += cmdCheck(root, memRoot, rules, d) ? 1 : 0
  console.log('\n' + (n ? '✗ ' + n + ' 個場景未通過' : '✓ 全部場景通過'))
  process.exit(n ? 1 : 0)
}

if (!name) {
  console.error('用法：node 場景記憶.mjs <list|init|stamp|交接|check> --場景 <名> [--root <工作台根>]')
  console.error('      全場景檢查：node 場景記憶.mjs check --all')
  process.exit(2)
}

switch (cmd) {
  case 'init': process.exit(cmdInit(root, memRoot, rules, name))
  case 'stamp': process.exit(cmdStamp(root, memRoot, rules, name))
  case '交接':
  case 'handover': process.exit(cmdHandover(root, memRoot, rules, name))
  case 'check': process.exit(cmdCheck(root, memRoot, rules, name))
  default:
    console.error('未知命令：' + cmd)
    process.exit(2)
}
