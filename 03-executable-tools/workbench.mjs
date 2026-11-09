/**
 * Shared module —— path resolution, restricted YAML parsing, rule loading
 *
 * ★ Why it is factored out: three tools (scene memory / workflow validation / workflow
 *   execution) all need "find the workbench root", "read the rules" and "parse the workflow YAML".
 *   Writing one copy each = one bug each = three inconsistent versions. That is a lesson this
 *   repo keeps relearning.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ───────────────────────── single source of truth for the rules ───────────────────────── */

const RULE_KEY_ALIAS = {
  version: '版本',
  description: '說明',
  sec0MaxBytes: '交接段紅線位元組',
  mainMaxBytes: '主檔案紅線位元組',
  projectMaxBytes: '專案記憶紅線位元組',
  skillMaxBytes: '技能紅線位元組',
  mainOverLimitAction: '主檔案超標處置',
  sec0OverLimitAction: '交接段超標處置',
  fingerprintLength: '指紋長度',
  sec0Subsections: '交接段小節',
  dutyHeading: '職責區塊標題',
  dutyMinItems: '職責最少條數',
  memoryFile: '記憶檔名',
  identityFile: '身份卡檔名',
  portraitFile: '場景畫像檔名',
  fileIndexFile: '檔案索引檔名',
  locatorFile: '定位卡檔名',
  sceneConfigFile: '場景配置檔名',
  constitutionFile: '場景憲法檔名',
  skillFile: '技能檔名',
  sceneRootDir: '場景根目錄',
  projectDir: '專案記憶目錄',
  archiveDir: '歸檔目錄',
  skillDir: '技能目錄',
  indexFile: '身份索引檔名',
  indexAliasSection: '身份索引別名段落',
  boundaryMarkerFile: '邊界標記檔名',
  boundaryMarkerAltFile: '邊界標記替代檔名',
  _boundaryMarkerNote: '_邊界標記說明',
  workflowDir: '工作流目錄',
  executionDir: '執行層目錄',
  receiptDir: '回執目錄',
  executionStateFile: '執行狀態檔名',
  carryFile: '交接串檔名',
  receiptRequiredSections: '回執必要小節',
  artifactSection: '可累積物小節',
  diffSetSection: '差異集合小節',
  nextHopSection: '下一棒小節',
  artifactMinItems: '可累積物最小條數',
  accumulationTargetSection: '累積落點小節',
  dispatchField_what: '派單欄位_做什麼',
  dispatchField_criteria: '派單欄位_判據',
  dispatchField_output: '派單欄位_落盤位置',
  dispatchField_receipt: '派單欄位_回執方式',
  dispatchField_needs: '派單欄位_需要',
  archiveLayerDir: '歸檔層目錄',
  sessionArchiveDir: '會話檔案層目錄',
  sessionArchiveIndexFile: '會話檔案索引檔名',
  sessionArchiveIndexFields: '會話檔案索引欄位',
  sessionFileMaxBytes: '會話檔案單檔紅線位元組',
  sessionArchiveKeepCount: '會話檔案層保留份數',
  sessionSwitchPreconditions: '換會話前置檢查',
  sessionSwitchSyncCount: '換會話同步處數',
  sessionSwitchSyncTargets: '換會話同步處',
  sessionSwitchSignatureFormat: '換會話署名格式',
  sessionSwitchFreshnessHours: '換會話新鮮度小時',
  archivedSessionPrefix: '已歸檔會話前綴',
  engineStateFile: '引擎狀態檔名',
  engineStateArchivedField: '引擎狀態已歸檔欄位',
  memoryRootCandidates: '記憶根候選',
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
  // ★ Some rules have a Chinese key that is itself an English key (e.g. "_fileIndexFile"),
  //   so the alias table has to list both sides, otherwise the value reads as undefined.
  for (const zh of Object.values(RULE_KEY_ALIAS)) {
    if (out[zh] === undefined && raw[zh] !== undefined) out[zh] = raw[zh]
  }
  return out
}

/**
 * Load the rules. Priority:
 *   ① an explicitly given rules file (--rules <path>) —— ★ the engine side uses this to
 *     bring its own naming
 *   ② <workbench-root>/handover-rules.json
 *   ③ the handover-rules.json next to the tool (the repo default)
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

/* ───────────────────────── path resolution ───────────────────────── */

/**
 * Memory root resolution. The candidate chain can be overridden by the rules file (the engine
 * side uses its own directory names and fonts).
 * The <根> placeholder is replaced with the workbench root.
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
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* skip */ }
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

/* ───────────────────────── restricted YAML parsing ───────────────────────── */

/**
 * Only the subset this project needs is supported:
 *   key: value
 *   key:
 *   - item
 *   - key: value
 *     key2: value
 * Any line that cannot be decided is an error —— better to say "I cannot read this" than to guess wrong silently.
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
      throw new Error(`line ${i + 1} contains a tab (this tool indents with spaces only): ${raw.trim()}`)
    }
    const cur = raw.match(/^(\s*)/)[0].length
    const body = raw.trim()

    if (body.startsWith('- ')) {
      if (!listCtx) throw new Error(`line ${i + 1} is a list item but has no matching key: ${body}`)
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
    if (!m) throw new Error(`line ${i + 1} cannot be parsed: ${body}`)
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

/* ───────────────────────── markdown section parsing ───────────────────────── */

/**
 * ★ Why line-by-line scanning instead of a regex:
 *   A regex that grabs markdown sections stepped on two traps in real measurements:
 *     ① the lookahead `\s*$` (with the m flag) succeeds right at the blank line after the
 *       heading ⇒ it captures an empty string
 *     ② lazy + lookahead eats the last line
 *   Line-by-line scanning has none of these ambiguities. **A defect only found by running it,
 *   recorded in the update log v0.3.**
 *
 * Returns: the content lines of that section (trimmed), without the heading itself.
 */
export function sectionLines (text, title) {
  const lines = text.split('\n')
  const out = []
  let inSec = false
  for (const raw of lines) {
    const h = raw.match(/^#{1,6}[ \t]*(.+?)[ \t]*$/)
    if (h) {
      if (inSec) break                    // the next heading ends this section
      if (h[1].trim() === title) { inSec = true; continue }
      continue
    }
    if (inSec && raw.trim()) out.push(raw.trim())
  }
  return out
}

/** Parse all sections of a whole markdown file → { heading: [content lines] } */
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

/* ───────────────────────── small utilities ───────────────────────── */

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
