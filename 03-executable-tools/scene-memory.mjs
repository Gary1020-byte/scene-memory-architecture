#!/usr/bin/env node
/**
 * scene-memory.mjs —— 場景記憶校驗工具
 *
 * 五個命令：
 *   list                    一覽：每個場景缺什麼
 *   init   --scene <名>      建目錄骨架 + 三份文件（已存在不覆蓋）
 *   stamp  --scene <名>      重生成 身份卡 + 場景畫像
 *   交接   --scene <名>      歸檔舊版 + 補 §₀ 小節 + stamp + 登記索引
 *   check  --scene <名>      ★ 全檢：結構/指紋/§〇/專案/歸檔（--all 全場景）
 *
 * 設計原則：
 *   ① 規則單一來源 —— 紅線、小節清單、指紋長度都讀 handover-rules.json，不硬編碼。
 *   ② fail-closed —— 結構性錯誤擋住（退出碼 1），品質問題只警告。
 *   ③ 工具不碰資料 —— 工具只生成/檢查，場景記憶的正文永遠由人寫。
 *
 * 用法：
 *   node scene-memory.mjs list
 *   node scene-memory.mjs check --scene 場景甲
 *   node scene-memory.mjs check --all
 *   node scene-memory.mjs check --scene 場景甲 --root <工作台根>
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
  version: 'version',
  description: 'description',
  sec0MaxBytes: 'sec0MaxBytes',
  mainMaxBytes: 'mainMaxBytes',
  projectMaxBytes: 'Project記憶紅線位元組',
  skillMaxBytes: 'skillMaxBytes',
  mainOverLimitAction: 'mainOverLimitAction',
  sec0OverLimitAction: 'sec0OverLimitAction',
  fingerprintLength: 'fingerprintLength',
  sec0Subsections: 'sec0Subsections',
  dutyHeading: 'dutyHeading',
  dutyMinItems: '職責最少 items數',
  memoryFile: 'memoryFile',
  identityFile: 'Identity卡檔名',
  portraitFile: 'scenePortrait檔名',
  fileIndexFile: 'fileIndexFile',
  locatorFile: 'locatorFile',
  sceneConfigFile: 'scene config檔名',
  constitutionFile: 'scene憲法檔名',
  skillFile: 'skillFile',
  sceneRootDir: 'scene根目錄',
  projectDir: 'Project記憶目錄',
  archiveDir: 'Archive目錄',
  skillDir: 'skillDir',
  indexFile: 'identity index檔名',
  indexAliasSection: 'identity index別名段落',
  boundaryMarkerFile: 'Boundary標記檔名',
  boundaryMarkerAltFile: 'Boundary標記替代檔名',
  _boundaryMarkerNote: '_Boundary標記description',
  workflowDir: 'workflow目錄',
  executionDir: 'executionDir',
  receiptDir: 'receipt目錄',
  executionStateFile: '執行status檔名',
  carryFile: 'carryFile',
  receiptRequiredSections: 'receipt必要小節',
  artifactSection: 'Accumulable Artifact小節',
  diffSetSection: 'diffSetSection',
  nextHopSection: 'nextHopSection',
  artifactMinItems: 'Accumulable Artifact最小 items數',
  accumulationTargetSection: 'accumulationTargetSection',
  dispatchField_what: 'dispatchField_what',
  dispatchField_criteria: '派單欄位_criteria',
  dispatchField_output: '派單欄位_output位置',
  dispatchField_receipt: '派單欄位_receipt方式',
  dispatchField_needs: '派單欄位_needs',
  archiveLayerDir: 'Archive層目錄',
  sessionArchiveDir: 'sessionArchiveDir',
  sessionArchiveIndexFile: 'sessionArchiveIndexFile',
  sessionArchiveIndexFields: 'sessionArchiveIndexFields',
  sessionFileMaxBytes: 'sessionFileMaxBytes',
  sessionArchiveKeepCount: 'sessionArchiveKeepCount',
  sessionSwitchPreconditions: 'sessionSwitchPreconditions',
  sessionSwitchSyncCount: 'sessionSwitchSyncCount',
  sessionSwitchSyncTargets: 'sessionSwitchSyncTargets',
  sessionSwitchSignatureFormat: 'sessionSwitchSignatureFormat',
  sessionSwitchFreshnessHours: 'sessionSwitchFreshnessHours',
  archivedSessionPrefix: '已Archive會話前綴',
  engineStateFile: '引擎status檔名',
  engineStateArchivedField: '引擎status已Archive欄位',
  memoryRootCandidates: 'memoryRootCandidates',
}

/** 內建預設規則；若工具目錄有handover-rules.json 則以它為準（★ 規則不硬編碼） */
const DEFAULT_RULES = {
  version: 1,
  sec0MaxBytes: 4096,
  mainMaxBytes: 25600,
  projectMaxBytes: 8192,
  skillMaxBytes: 12288,
  fingerprintLength: 16,
  sec0Subsections: [
    '### 1) Last Handover',
    '### 2) Current Projects',
    '### 3) Private Memory Changes',
    '### 4) Next Steps / Blockers',
    '### 5) Full Picture',
  ],
  dutyHeading: '## Core Responsibilities',
  dutyMinItems: 3,
  memoryFile: 'scene-private-memory.md',
  identityFile: 'identity-card.md',
  portraitFile: 'scene-portrait.md',
  fileIndexFile: '_file-index.md',
  locatorFile: 'locator-card.md',
  sceneConfigFile: 'scene-config.json',
  constitutionFile: 'AGENTS.md',
  skillFile: 'SKILL.md',
  sceneRootDir: 'scenes',
  projectDir: 'project-memory',
  archiveDir: 'archive',
  skillDir: '.dsh/skills',
  indexFile: '_scene-identity-index.md',
  indexAliasSection: 'scene-alias',
  boundaryMarkerFile: '.git',
  boundaryMarkerAltFile: '.git-marker',
  workflowDir: 'workflows',
  executionDir: 'runs',
  receiptDir: 'receipts',
  executionStateFile: 'execution-state.md',
  carryFile: 'carry.md',
  receiptRequiredSections: ['Diff Set', 'Accumulable Artifact', 'Next Handoff'],
  artifactSection: 'Accumulable Artifact',
  diffSetSection: 'Diff Set',
  nextHopSection: 'Next Handoff',
  artifactMinItems: 1,
  accumulationTargetSection: '§5',
  dispatchField_what: 'What',
  dispatchField_criteria: 'Criteria',
  dispatchField_output: 'Output Location',
  dispatchField_receipt: 'Receipt Format',
  dispatchField_needs: 'Needs',
  archiveLayerDir: 'archive',
  sessionArchiveDir: 'session-archive',
  sessionArchiveIndexFile: '_session-archive-index.md',
  sessionArchiveIndexFields: ['Scene', 'Session ID', 'Session Name', 'Start Time', 'Messages', 'Path', 'Summary'],
  sessionFileMaxBytes: 524288,
  sessionArchiveKeepCount: 20,
  sessionSwitchPreconditions: ['scene exists', '§0 has all five subsections', '§0 has next steps', 'check passes'],
  sessionSwitchSyncCount: 3,
  sessionSwitchSyncTargets: ['scene config sessionId', 'identity index sessionId column', '§0 handover signature'],
  sessionSwitchSignatureFormat: 'This handover was written by session {sessionId} on {date}',
  sessionSwitchFreshnessHours: 2,
  archivedSessionPrefix: 'Archived · ',
  engineStateFile: 'engine-state.json',
  engineStateArchivedField: 'archived-sessions',
  memoryRootCandidates: [],
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
    path.join(HERE, 'handover-rules.json'),
    path.join(root || '', 'handover-rules.json'),
    path.join(HERE, '..', '04-templates', 'handover-rules.json'),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ...DEFAULT_RULES, ...normalizeRules(j), _source: p }
    } catch (e) {
      console.error('⚠ Cannot read rules file (' + p + '）：' + e.message + ' ⇒ using built-in defaults')
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
    path.join(root, 'scenes'),
    path.join(root, 'engine-data', '.dsh', 'scene-memory'),
  ].filter(Boolean)
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* 跳過 */ }
  }
  return cands[1] || path.join(root, 'scenes')
}

/** 身份索引候選鏈（同樣道理：索引搬位不該讓工具全盲） */
function resolveIndexPath (root) {
  const cands = [
    path.join(root, 'scenes', '_scene-identity-index.md'),
    path.join(root, '外壳', 'scenarios', '_scene-identity-index.md'),
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
  const mNew = txt.match(/^## §0[^\n]*$/m)
  const mOld = txt.match(/^## (?:〇|§〇)[、 ]?當前交接[^\n]*$/m)
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
        card = fs.existsSync(cand) ? cand : path.resolve(root, 'scenes', cardRaw)
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
    if (i === 0) return s + '\n- （交接時由工具寫入：舊版已歸檔 `Archive/<檔名>`）'
    if (i === 1) return s + '\n| Project | Memory file | Status | Next step |\n|---|---|---|---|\n| (none) | — | — | — |'
    if (i === 2) return s + '\n- (what changed this round, ≤3 lines)'
    if (i === 3) return s + '\n- (written for the next person)'
    return s + '\n- Project memory 0 · Archive 0 · Index _file-index.md\n- Identity card / scene portrait / shared-layer areas are in place\n- Blockers / waiting on: see section 4'
  }).join('\n\n')

  return `# ${name} · 場景私有記憶

> 身份與形態見 \`${rules.identityFile}\` / \`${rules.portraitFile}\`（工具生成，⛔ 手改）
> 規矩：這份記憶只有本場景能改寫；別的場景發現錯誤只能提醒。

## §0 Current Handover (≤${rules.sec0MaxBytes / 1024} KB, a new session reads this section first)

${subs}

## 核心職責

- 負責：（待補 —— 用一句話說清「什麼事找我」）
- 不碰：（待補 —— 用一句話說清「什麼別找我」）
- 一句話：（待補 —— 能不能一句話說清這個場景為什麼存在）

## §一 我管什麼 / 不管什麼

- 管：
- 不管：

## §二 幹活入口

- Project memory: \`${rules.projectDir}/<project-name>.md\` (the current project index table goes in §0 subsection 2 above)
- 歸檔：\`${rules.archiveDir}/\`
- 索引：\`${rules.fileIndexFile}\`

## §5 Decisions and Pitfalls (append only)

## 〇-通知
`
}

function buildIdentityCard (rules, name, ident, root) {
  const card = ident?.card || ''
  const fp = card ? sha(card).slice(0, rules.fingerprintLength) : ''
  // ⛔ 產出裡只寫「相對於工作台根」的路徑 —— 公開的模板不該綁死執行機器的絕對路徑
  const cardShown = card ? relToRoot(card, root) : '(缺)'
  return `# ${name} · 身份卡（工具生成 · ⛔ 手改即校驗失敗）

<!-- 場景綁定 BEGIN · 由 scene-memory.mjs 生成 -->
> **場景** \`${ident?.id || '?'}\` ｜ **面板** \`${ident?.panel || '?'}\` ｜ **會話** \`${ident?.sessionId || '?'}\`
> **定位卡** \`${cardShown}\` ｜ **卡指紋** \`sha256:${fp || '(缺)'}…\` ｜ **蓋章** ${now()}
> **地盤** \`${name}\`
> **權限** 只寫自己的記憶資料夾與本人資產；⛔ 不改別的場景、不重啟引擎
> **專屬技能** ${ident?.skill || '(無)'}
<!-- 場景綁定 END -->

## 怎麼用
- 開場第一份讀的是**這張卡**：我是誰、在哪個面板、會話是哪條、能碰什麼。
- 定位卡改了 ⇒ 立刻跑 \`scene-memory.mjs stamp --scene ${name}\`，否則 check 會報指紋過期。
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
- Handover section: the §0 of \`${rules.memoryFile}\` (≤ ${rules.sec0MaxBytes / 1024} KB)
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
    console.log('  ✓ Created ' + rules.memoryFile)
  }
  const fidx = path.join(dir, rules.fileIndexFile)
  if (!fs.existsSync(fidx)) {
    fs.writeFileSync(fidx, buildFileIndex(rules, name), 'utf8')
    console.log('  ✓ Created ' + rules.fileIndexFile)
  }
}

function cmdInit (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ Cannot find scene directory: ' + dir + '\n   (create the directory and .git first, then run init)')
    return 2
  }
  console.log('▸ ' + name + ': skeleton created')
  ensureSkeleton(dir, name, rules)
  return cmdStamp(root, memRoot, rules, name)
}

function cmdStamp (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ Cannot find scene directory: ' + dir)
    return 2
  }
  const indexPath = resolveIndexPath(root)
  const ident = findIdentity(indexPath, name, root)
  if (!ident) {
    console.error('✗ Cannot find this scene in the identity index: ' + name)
    console.error('   Index location: ' + indexPath + (fs.existsSync(indexPath) ? '' : ' (file does not exist)'))
    return 1
  }
  fs.writeFileSync(path.join(dir, rules.identityFile), buildIdentityCard(rules, name, ident, root), 'utf8')
  fs.writeFileSync(path.join(dir, rules.portraitFile), buildPortrait(rules, name, ident, root), 'utf8')
  console.log('✓ ' + name + ': identity card + scene portrait regenerated' +
    (ident.card ? '(card fingerprint ' + sha(ident.card).slice(0, 12) + '…）' : ' (locator card not found, fingerprint left empty)'))
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
    console.error('✗ Cannot find scene directory: ' + dir)
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
  console.log('✓ Old version archived: ' + rules.archiveDir + '/' + archFile + '（' + Buffer.byteLength(body) + ' B）')

  // ② 缺的小節才補（不覆蓋已有正文）
  const missing = []
  for (const sub of rules.sec0Subsections) {
    if (body.includes(sub)) continue
    const head = sub.replace(/^### /, '')
    if (sub.includes('1)')) missing.push(sub + '\n- 舊版已歸檔 `' + rules.archiveDir + '/' + archFile + '`\n')
    else if (sub.includes('2)')) missing.push(sub + '\n| Project | Memory file | Status | Next step |\n|---|---|---|---|\n| (none) | — | — | — |\n')
    else if (sub.includes('3)')) missing.push(sub + '\n- \n')
    else if (sub.includes('4)')) missing.push(sub + '\n- \n')
    else missing.push(sub + '\n- Project memory 0 · Archive 0 · Index ' + rules.fileIndexFile + '\n- Blockers / waiting on: see section 4\n')
    void head
  }
  if (missing.length) {
    const h = body.indexOf('## §0')
    if (h >= 0) {
      const lineEnd = body.indexOf('\n', h)
      const at = lineEnd >= 0 ? lineEnd + 1 : body.length
      body = body.slice(0, at) + '\n' + missing.join('\n') + body.slice(at)
    } else {
      body = '# ' + name + ' · scene private memory\n\n## §0 Current Handover (≤' + rules.sec0MaxBytes / 1024 + ' KB）\n\n' + missing.join('\n') + '\n' + body
    }
    fs.writeFileSync(main, body, 'utf8')
  }
  console.log('✓ §0 filled in ' + missing.length + ' subsection(s) (only fills missing ones, never overwrites existing prose)')

  // ③ 登記索引
  const fidx = path.join(dir, rules.fileIndexFile)
  if (fs.existsSync(fidx)) {
    fs.appendFileSync(fidx, `| \`${rules.archiveDir}/${archFile}\` | handover前快照（只進不改） | 留檔 | ${now().slice(0, 10)} |\n`, 'utf8')
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
    console.log('\n' + name + ': ✗ no such scene directory (' + dir + '）')
    return 1
  }

  // 必要檔案與目錄
  for (const f of [rules.memoryFile, rules.identityFile, rules.portraitFile, rules.fileIndexFile]) {
    if (fs.existsSync(path.join(dir, f))) ok.push(f); else problems.push('Missing file ' + f)
  }
  for (const d of [rules.projectDir, rules.archiveDir]) {
    if (fs.existsSync(path.join(dir, d))) ok.push(d + '/'); else problems.push('Missing directory ' + d + '/')
  }

  // ★ 第二份記憶檔（孤兒）
  //   來源實測（2026-11-03）：場景自己寫記憶時寫錯檔名，會多出
  //   「<場景名>scene-private-memory.md」。兩份會分叉（inode 不同）而且 check 只看真源
  //   ⇒ 孤兒沒有人管；若是硬連結則內容一致但重複檔名會讓其他工具困惑。
  {
    const real = path.join(dir, rules.memoryFile)
    if (fs.existsSync(real)) {
      const ri = fs.statSync(real)
      for (const f of fs.readdirSync(dir)) {
        if (f === rules.memoryFile || !f.endsWith('scene-private-memory.md')) continue
        const si = fs.statSync(path.join(dir, f))
        if (si.ino === ri.ino) {
          problems.push('Scene directory has a second memory file "' + f + '" (a hard link to the source of truth) ⇒ keep only "' + rules.memoryFile + '」')
        } else {
          problems.push('Scene directory has an orphan memory file "' + f + '" (different inode from the source of truth) ⇒ the two will diverge; move it into archive/')
        }
      }
    }
  }

  // ★ 場景邊界（.git 存在性）—— 缺了會靜默降級，專屬技能全部消失
  //   真實場景用真 .git 目錄；公開倉庫的示範用 .git-marker 說明檔
  //   （git 不追蹤名為 .git 的檔案，巢狀無 commit 的倉庫又會讓 git add -A 失敗）
  const markName = rules['boundaryMarkerFile'] || '.git'
  const altName = rules['boundaryMarkerAltFile'] || '.git-marker'
  const hasMark = fs.existsSync(path.join(dir, markName))
  const hasAlt = altName !== markName && fs.existsSync(path.join(dir, altName))
  if (!hasMark && !hasAlt) {
    problems.push('Scene directory is missing ' + markName + ' (scene boundary broken ⇒ the dedicated skill will not load, and the symptom is subtle)')
  } else {
    ok.push((hasMark ? markName : altName) + ' (scene boundary)')
  }

  // 身份索引 + 卡指紋
  const indexPath = resolveIndexPath(root)
  if (!fs.existsSync(indexPath)) {
    problems.push('Cannot find identity index: ' + indexPath + ' (the tool does not know the scene ↔ session mapping)')
  } else {
    ok.push('Identity index: ' + path.relative(root, indexPath))
  }
  const ident = findIdentity(indexPath, name, root)

  // ★★ 綁定的會話還活著嗎？
  //   三處「一致」不代表那條會話還在 —— 面板可能指向一條**已歸檔**的會話。
  //   症狀跟少同步一處完全一樣（切場景像換了個人），但根因不同 ⇒ 必須分開查。
  //   引擎狀態由引擎端寫成 <工作台根>/engine-state.json（repo 不認識任何引擎的私有格式）。
  {
    const stPath = path.join(root, rules['engineStateFile'] || 'engine-state.json')
    if (fs.existsSync(stPath)) {
      try {
        const st = JSON.parse(fs.readFileSync(stPath, 'utf8'))
        const arch = st[rules['engineStateArchivedField'] || 'archived-sessions'] || []
        const sid = ident?.sessionId || ''
        if (sid && arch.includes(sid)) {
          problems.push('The session bound to the panel has been archived (' + sid + ') ⇒ the panel points at a dead session (same symptom as "one sync point missed", different root cause)')
        } else if (sid) {
          ok.push('Bound session is still alive')
        }
      } catch (e) {
        warns.push('Cannot read engine state file (' + path.basename(stPath) + '）：' + e.message)
      }
    }
  }

  const cardPath = path.join(dir, rules.identityFile)
  if (!ident) {
    problems.push('This scene is not in the identity index: ' + name)
  } else if (fs.existsSync(cardPath)) {
    const card = fs.readFileSync(cardPath, 'utf8')
    const fp = (card.match(/sha256:([0-9a-f]+)/) || [])[1]
    if (!ident.card) {
      problems.push('Identity index locator card column is empty (value: ' + (ident.cardRaw || ' (empty)') + '）')
    } else if (!fs.existsSync(ident.card)) {
      problems.push('Locator card does not exist: ' + ident.card)
    } else if (!fp) {
      problems.push('Identity card has no card fingerprint (run stamp to restamp)')
    } else {
      const real = sha(ident.card).slice(0, fp.length)
      if (!sha(ident.card).startsWith(fp)) problems.push('Card fingerprint stale (card changed, run stamp)' + fp + '…≠' + real + '…')
      else ok.push('Card fingerprint matches')
    }
  }

  // 主檔案內容
  const mainPath = path.join(dir, rules.memoryFile)
  if (!fs.existsSync(mainPath)) {
    console.log('\n' + name + ': ✗ missing ' + rules.memoryFile + ' (run init)')
    return 1
  }
  const main = fs.readFileSync(mainPath, 'utf8')

  // 核心職責
  {
    const i = main.search(new RegExp('^' + rules.dutyHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm'))
    if (i < 0) {
      problems.push('missing "' + rules.dutyHeading + '" block (required in the scene private memory)')
    } else {
      const rest = main.slice(i)
      const next = rest.indexOf('\n## ', 5)
      const sec = rest.slice(0, next > 0 ? next : rest.length)
      const n = (sec.match(/^- /gm) || []).length
      if (n < rules.dutyMinItems) problems.push('Core responsibilities has only ' + n + ' items (at least ' + rules.dutyMinItems + ')')
      else ok.push('core responsibilities ' + n + ' ')
    }
  }

  // §₀ 五小節
  for (const sub of rules.sec0Subsections) {
    if (!main.includes(sub)) problems.push('§0 missing subsection ' + sub)
  }

  // §₀ 紅線
  const s0 = sec0Range(main)
  if (s0.h < 0) {
    problems.push('Missing §0 handover heading (## §0)')
  } else {
    if (s0.bytes > rules.sec0MaxBytes) problems.push('§0 ' + s0.bytes + ' B over ' + (rules.sec0MaxBytes / 1024) + ' KB (hard limit ' + rules.sec0MaxBytes + ')')
    else ok.push('§0 ' + s0.bytes + ' B')
    if (s0.hasOld) warns.push('Uses the old §0 heading (## 〇, current handover); change it to ## §0')
    if (s0.hasOld && s0.hasNew) warns.push('Both the old and the new §0 headings are present')
  }

  // 內容告警（只警不擋）
  {
    const pmDir = path.join(dir, rules.projectDir)
    const pmCount = fs.existsSync(pmDir) ? fs.readdirSync(pmDir).filter((x) => x.endsWith('.md')).length : 0
    const seg2 = subsection(main, '### 2) Current Projects')
    if (pmCount > 0 && /\|\s*\(none\)\s*\|/.test(seg2)) warns.push('Current projects table says "none", but project memory has ' + pmCount + ' copies (the table needs updating)')
    const seg4 = subsection(main, '### 4) Next Steps / Blockers')
    const body4 = seg4.split(/\r?\n/).filter((l) => /^-\s*\S/.test(l.trim()))
    if (!body4.length) warns.push('Section 4 (next steps / blockers) is empty')
    // 專案記憶超紅線
    if (fs.existsSync(pmDir)) {
      for (const f of fs.readdirSync(pmDir).filter((x) => x.endsWith('.md'))) {
        const b = sizeOf(path.join(pmDir, f))
        if (b > rules.projectMaxBytes) warns.push('Project memory ' + f + ' ' + (b / 1024).toFixed(1) + ' KB over ' + (rules.projectMaxBytes / 1024) + ' KB')
      }
    }
  }

  // 主檔案大小（只警）
  const mainBytes = Buffer.byteLength(main)
  if (mainBytes > rules.mainMaxBytes) {
    warns.push('Main file ' + (mainBytes / 1024).toFixed(1) + ' KB over ' + (rules.mainMaxBytes / 1024) + ' KB (hard limit — move old content into ' + rules.archiveDir + '/ 並留指針）')
  }

  console.log('\n' + name + '：' + (problems.length ? '✗ ' + problems.length + '  problem(s)' : '✓ All checks passed') +
    '（' + ok.length + ' passed' + (warns.length ? ' · ⚠ ' + warns.length + ' warning(s)' : '') + '）')
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
    const markName = rules['boundaryMarkerFile'] || '.git'
    const altName = rules['boundaryMarkerAltFile'] || '.git-marker'
    const hasMark = has(markName) || (altName !== markName && has(altName))
    const line = '  ' + d + '   記憶' + flag(has(rules.memoryFile)) + ' Identity' + flag(has(rules.identityFile)) +
      ' Portrait' + flag(has(rules.portraitFile)) + ' Project' + flag(has(rules.projectDir)) +
      ' Archive' + flag(has(rules.archiveDir)) + ' Boundary' + flag(hasMark)
    if (!(has(rules.identityFile) && has(rules.portraitFile))) bad++
    console.log(line)
  }
  console.log('\nTotal ' + dirs.length + ' scene(s); missing identity card/portrait: ' + bad + ' ')
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
  node scene-memory.mjs list                    一覽所有場景缺什麼
  node scene-memory.mjs init    --scene <名>      建立場景骨架（六件套 + 目錄結構）
  node scene-memory.mjs stamp   --scene <名>      重生成身份卡（含 sha256 指紋）與場景畫像
  node scene-memory.mjs handover --scene <名>      歸檔舊版 §〇 + 補 §〇 骨架
  node scene-memory.mjs check   --scene <名>      校驗（fail-closed，不過就擋）
  node scene-memory.mjs check   --all           校驗所有場景

通用選項：
  --root <工作台根>   指定工作台根（預設：工具的上一層目錄）
  --scene <名> / --scene <名>   場景名（也可直接給路徑）

退出碼：
  0 = 通過　1 = 有項目未通過　2 = 用法錯誤

規則來源：handover-rules.json（紅線數字只在那裡定義一次）
驗收：bash negative-acceptance.sh —— 證明「該失敗時會失敗」`)
  process.exit(0)
}

if (!cmd) {
  console.log(' (no subcommand — list all scenes)\n')
}
if (!cmd || cmd === 'list') {
  console.log('Memory root: ' + memRoot + '\nRules source: ' + rules._source + '\n')
  process.exit(cmdList(memRoot, rules))
}

const name = val('--scene') || val('--scene')

if (cmd === 'check' && has('--all')) {
  const dirs = fs.existsSync(memRoot)
    ? fs.readdirSync(memRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort()
    : []
  let n = 0
  for (const d of dirs) n += cmdCheck(root, memRoot, rules, d) ? 1 : 0
  console.log('\n' + (n ? '✗ ' + n + ' scene(s) failed' : '✓ All scenes passed'))
  process.exit(n ? 1 : 0)
}

if (!name) {
  console.error('用法：node scene-memory.mjs <list|init|stamp|handover|check> --scene <名> [--root <工作台根>]')
  console.error('      全scenecheck：node scene-memory.mjs check --all')
  process.exit(2)
}

switch (cmd) {
  case 'init': process.exit(cmdInit(root, memRoot, rules, name))
  case 'stamp': process.exit(cmdStamp(root, memRoot, rules, name))
  case 'handover':
  case 'handover': process.exit(cmdHandover(root, memRoot, rules, name))
  case 'check': process.exit(cmdCheck(root, memRoot, rules, name))
  default:
    console.error('Unknown command: ' + cmd)
    process.exit(2)
}
