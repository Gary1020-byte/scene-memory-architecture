/**
 * 共用模組 —— 路徑解析、受限 YAML 解析、規則載入
 *
 * ★ 為什麼要抽出來：三支工具（場景記憶 / 工作流校驗 / 工作流執行）
 *   都需要「找工作台根」「讀規則」「解析工作流 YAML」。
 *   各寫一份 = 各錯一次 = 三個版本不一致。這是本 repo 反覆出現的教訓。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ───────────────────────── 規則單一來源 ───────────────────────── */

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

export const DEFAULT_RULES = {
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

export function normalizeRules (raw) {
  const out = { ...raw }
  for (const [en, zh] of Object.entries(RULE_KEY_ALIAS)) {
    if (out[en] === undefined && raw[zh] !== undefined) out[en] = raw[zh]
    if (out[zh] === undefined && raw[en] !== undefined) out[zh] = raw[en]
  }
  // ★ 有些規則的中文鍵本身就是英文鍵（如「_檔案索引檔名」），
  //   別名對照表要兩邊都登，否則會讀成 undefined。
  for (const zh of Object.values(RULE_KEY_ALIAS)) {
    if (out[zh] === undefined && raw[zh] !== undefined) out[zh] = raw[zh]
  }
  return out
}

/**
 * 載入規則。優先序：
 *   ① 明確指定的規則檔（--rules <路徑>）—— ★ 引擎端用這個帶自己的命名
 *   ② <工作台根>/handover-rules.json
 *   ③ 工具同目錄的handover-rules.json（repo 預設）
 *   ④ 04-templates/handover-rules.json
 */
export function loadRules (root, explicit) {
  const candidates = [
    explicit,
    path.join(root || '', 'handover-rules.json'),
    path.join(HERE, 'handover-rules.json'),
    path.join(HERE, '..', '04-templates', 'handover-rules.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ...DEFAULT_RULES, ...normalizeRules(j), _source: p }
    } catch (e) {
      console.error('⚠ Cannot read rules file (' + p + '）：' + e.message + ' ⇒ using built-in defaults')
    }
  }
  return { ...DEFAULT_RULES }
}

/* ───────────────────────── 路徑解析 ───────────────────────── */

/**
 * 記憶根解析。候選鏈可被規則檔覆寫（引擎端用自己的目錄名與字體）。
 * 佔位符 <根> 會被替換成工作台根。
 */
export function resolveMemoryRoot (root, rules) {
  const cands = [
    process.env.DSH_SCENE_MEMORY,
    ...((rules && rules.memoryRootCandidates) || []).map(p => String(p).replace('<根>', root)),
    path.join(root, 'scenes'),
    path.join(root, 'scene-memory'),
    path.join(root, 'engine-data', '.dsh', 'scene-memory'),
  ].filter(Boolean)
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* 跳過 */ }
  }
  return cands[1] || path.join(root, 'scenes')
}

export function resolveIndexPath (root, rules) {
  const idxName = (rules && rules.indexFile) || '_scene-identity-index.md'
  const sceneDir = (rules && rules.sceneRootDir) || 'scenes'
  const cands = [
    path.join(root, sceneDir, idxName),
    path.join(root, 'shell', 'scenarios', idxName),
    path.join(root, 'shell', 'scenarios', '_scene-identity-index.md'),
  ]
  return cands.find((p) => fs.existsSync(p)) || cands[0]
}

export function resolveWorkflowDir (root) {
  const cands = [
    path.join(root, 'workflows'),
    path.join(root, 'scenes', '_shared-memory', 'workflows'),
    path.join(root, 'shared', 'workflows'),
  ]
  return cands.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory()) || cands[0]
}

export function resolveExecRoot (root) {
  return path.join(root, 'runs')
}

export function findWorkflowFiles (root, rules) {
  const dir = resolveWorkflowDir(root)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
    .map((e) => path.join(dir, e.name))
}

/* ───────────────────────── 受限 YAML 解析 ───────────────────────── */

/**
 * 只支援本專案需要的子集：
 *   key: value
 *   key:
 *   - item
 *   - key: value
 *     key2: value
 * 出現任何無法判定的行就丟錯 —— 寧可報「看不懂」，也不要默默猜錯。
 */
export function parseYaml (text) {
  const lines = text.split('\n')
  const root = {}
  let listCtx = null    // { key, arr }
  let itemCtx = null    // { obj, indent }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (raw.includes('\t')) {
      throw new Error(`第 ${i + 1} 行含 tab（本tool只用空格縮排）：${raw.trim()}`)
    }
    const cur = raw.match(/^(\s*)/)[0].length
    const body = raw.trim()

    if (body.startsWith('- ')) {
      if (!listCtx) throw new Error(`第 ${i + 1} 行是清單項目，但沒有對應的 key：${body}`)
      const val = body.slice(2).trim()
      const obj = {}
      listCtx.arr.push(obj)
      itemCtx = { obj, indent: cur }
      const m = val.match(/^([^:]+):(.*)$/)
      if (m) obj[m[1].trim()] = parseScalar(m[2].trim())
      else obj.__value = parseScalar(val)
      continue
    }

    const m = body.match(/^([^:]+):(.*)$/)
    if (!m) throw new Error(`第 ${i + 1} 行看不懂：${body}`)
    const key = m[1].trim()
    const val = m[2].trim()

    if (itemCtx && cur > itemCtx.indent) {
      itemCtx.obj[key] = val === '' ? '' : parseScalar(val)
      continue
    }
    if (itemCtx && cur <= itemCtx.indent) itemCtx = null

    if (val === '') {
      const next = nextMeaningful(lines, i + 1)
      if (next && next.trim().startsWith('- ')) {
        const arr = []
        root[key] = arr
        listCtx = { key, arr }
        itemCtx = null
        continue
      }
      root[key] = ''
      listCtx = null
      continue
    }

    root[key] = parseScalar(val)
    listCtx = null
    itemCtx = null
  }
  return root
}

function nextMeaningful (lines, from) {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && !t.startsWith('#')) return t
  }
  return null
}

function parseScalar (v) {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v.replace(/^["']|["']$/g, '')
}

/* ───────────────────────── Markdown 小節解析 ───────────────────────── */

/**
 * ★ 為什麼用逐行掃描而不是 regex：
 *   regex 抓 markdown 小節在實測中連踩兩個坑：
 *     ① lookahead `\s*$`（m flag）會在標題後的空白行立刻成立 ⇒ 捕獲到空字串
 *     ② lazy + lookahead 會吃掉最後一行
 *   逐行掃描沒有這些歧義。**實跑才發現的缺陷，記在更新清單 v0.3。**
 *
 * 回傳：該小節的內容行（已 trim），不含標題本身。
 */
export function sectionLines (text, title) {
  const lines = text.split('\n')
  const out = []
  let inSec = false
  for (const raw of lines) {
    const h = raw.match(/^#{1,6}[ \t]*(.+?)[ \t]*$/)
    if (h) {
      if (inSec) break                    // 下一個標題 = 本小節結束
      if (h[1].trim() === title) { inSec = true; continue }
      continue
    }
    if (inSec && raw.trim()) out.push(raw.trim())
  }
  return out
}

/** 解析整份 markdown 的所有小節 → { 標題: [內容行] } */
export function parseSections (text) {
  const sections = {}
  let cur = null
  for (const raw of text.split('\n')) {
    const h = raw.match(/^#{1,6}[ \t]*(.+?)[ \t]*$/)
    if (h) {
      cur = h[1].trim()
      if (!sections[cur]) sections[cur] = []
      continue
    }
    if (cur !== null && raw.trim()) sections[cur].push(raw.trim())
  }
  return sections
}

/* ───────────────────────── 小工具 ───────────────────────── */

export function now () { return new Date().toISOString().replace('T', ' ').slice(0, 19) }
export function today () { return now().slice(0, 10) }
export function sha (s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}
export function readText (p) { return fs.readFileSync(p, 'utf8') }
export function writeText (p, t) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, t, 'utf8')
}
export function exists (p) { return fs.existsSync(p) }
