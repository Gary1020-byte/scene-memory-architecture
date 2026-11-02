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
  '_檔案索引檔名': '檔案索引檔名',
  projectDir: '專案記憶目錄',
  archiveDir: '歸檔目錄',
  indexFile: '身份索引檔名',
  場景配置檔名: '場景配置檔名',
  場景憲法檔名: '場景憲法檔名',
  技能檔名: '技能檔名',
  場景根目錄: '場景根目錄',
  技能目錄: '技能目錄',
  邊界標記檔名: '邊界標記檔名',
  邊界標記替代檔名: '邊界標記替代檔名',
  身份索引別名段落: '身份索引別名段落',
  /* 工作流相關 */
  工作流目錄: '工作流目錄',
  執行層目錄: '執行層目錄',
  回執目錄: '回執目錄',
  執行狀態檔名: '執行狀態檔名',
  交接串檔名: '交接串檔名',
  回執必要小節: '回執必要小節',
  可累積物小節: '可累積物小節',
  差異集合小節: '差異集合小節',
  下一棒小節: '下一棒小節',
  可累積物最小條數: '可累積物最小條數',
  累積落點小節: '累積落點小節',
  /* 派單欄位名（引擎端可覆寫成自己的用語） */
  派單欄位_做什麼: '派單欄位_做什麼',
  派單欄位_判據: '派單欄位_判據',
  派單欄位_落盤位置: '派單欄位_落盤位置',
  派單欄位_回執方式: '派單欄位_回執方式',
  派單欄位_需要: '派單欄位_需要',
}

export const DEFAULT_RULES = {
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
  fileIndexFile: '檔案索引.md',
  projectDir: '專案記憶',
  archiveDir: '歸檔',
  indexFile: '_場景身份索引.md',
  場景配置檔名: '場景配置.json',
  場景憲法檔名: 'AGENTS.md',
  技能檔名: 'SKILL.md',
  場景根目錄: '場景',
  技能目錄: '.dsh/skills',
  邊界標記檔名: '.git',
  邊界標記替代檔名: '.git-marker',
  身份索引別名段落: '場景別名',
  工作流目錄: '工作流',
  執行層目錄: '執行',
  回執目錄: '回執',
  執行狀態檔名: '執行狀態.md',
  交接串檔名: '交接串.md',
  回執必要小節: ['差異集合', '可累積物', '下一棒'],
  可累積物小節: '可累積物',
  差異集合小節: '差異集合',
  下一棒小節: '下一棒',
  可累積物最小條數: 1,
  累積落點小節: '§五',
  派單欄位_做什麼: '做什麼',
  派單欄位_判據: '判據',
  派單欄位_落盤位置: '落盤位置',
  派單欄位_回執方式: '回執方式',
  派單欄位_需要: '需要',
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
 *   ① 明確指定的規則檔（--規則 <路徑>）—— ★ 引擎端用這個帶自己的命名
 *   ② <工作台根>/交接規則.json
 *   ③ 工具同目錄的交接規則.json（repo 預設）
 *   ④ 04-模板/交接規則.json
 */
export function loadRules (root, explicit) {
  const candidates = [
    explicit,
    path.join(root || '', '交接規則.json'),
    path.join(HERE, '交接規則.json'),
    path.join(HERE, '..', '04-模板', '交接規則.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ...DEFAULT_RULES, ...normalizeRules(j), _source: p }
    } catch (e) {
      console.error('⚠ 規則檔讀不動（' + p + '）：' + e.message + ' ⇒ 用內建預設')
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
    ...((rules && rules.記憶根候選) || []).map(p => String(p).replace('<根>', root)),
    path.join(root, '場景'),
    path.join(root, '場景記憶'),
    path.join(root, '引擎數據', '.dsh', '場景記憶'),
  ].filter(Boolean)
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* 跳過 */ }
  }
  return cands[1] || path.join(root, '場景')
}

export function resolveIndexPath (root, rules) {
  const idxName = (rules && rules.身份索引檔名) || '_場景身份索引.md'
  const sceneDir = (rules && rules.場景根目錄) || '場景'
  const cands = [
    path.join(root, sceneDir, idxName),
    path.join(root, '外壳', 'scenarios', idxName),
    path.join(root, '外壳', 'scenarios', '_场景身份索引.md'),
  ]
  return cands.find((p) => fs.existsSync(p)) || cands[0]
}

export function resolveWorkflowDir (root) {
  const cands = [
    path.join(root, '工作流'),
    path.join(root, '場景', '_共享記憶', '工作流'),
    path.join(root, '共享', '工作流'),
  ]
  return cands.find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory()) || cands[0]
}

export function resolveExecRoot (root) {
  return path.join(root, '執行')
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
      throw new Error(`第 ${i + 1} 行含 tab（本工具只用空格縮排）：${raw.trim()}`)
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
