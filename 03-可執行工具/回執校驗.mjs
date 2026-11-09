#!/usr/bin/env node
/**
 * 回執校驗 —— 檢查回執是否真的帶了累積物
 *
 * 用法：
 *   node 回執校驗.mjs --root <工作台根> --場景 <場景名> --回執 <回執檔>
 *   node 回執校驗.mjs --root <工作台根> --場景 <場景名> --回執 <回執檔> --累積檔 <場景記憶檔>
 *
 * 退出碼：0 = 通過；1 = 有阻擋項；2 = 找不到東西
 *
 * ★ 這支工具存在的理由：
 *   「沒有可累積物的回執 ＝ 這次活白做」是整套架構的紅線。
 *   紅線沒有工具在管，就只是一句請你記得。
 *   這支工具把那條紅線變成 exit code。
 *
 * ★ 兩個層次的檢查：
 *   ① 回執本身有沒有三件套（差異集合 · 可累積物 · 下一棒）
 *   ② ★ 那些可累積物有沒有真的落地到場景記憶裡
 *      —— 只在回執裡寫了不算，必須在場景的 §五 決策與坑（或專屬技能）裡找得到。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  loadRules, resolveMemoryRoot, resolveIndexPath, readText, exists, parseSections,
} from './工作台.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneName = getArg('--場景')
const receiptPath = getArg('--回執')
const accumPathArg = getArg('--累積檔')

if (!root || !sceneName || !receiptPath) {
  console.error('用法：node 回執校驗.mjs --root <工作台根> --場景 <場景名> --回執 <回執檔> [--累積檔 <場景記憶檔>]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)

/* ───────────────────────── 找出場景記憶檔 ───────────────────────── */

function resolveAccumFile () {
  if (accumPathArg) return accumPathArg
  const cand = path.join(memRoot, sceneName, rules.memoryFile)
  return exists(cand) ? cand : null
}

/* ───────────────────────── 解析回執 ───────────────────────── */

/**
 * 回執格式（由 04-模板/派單模板.md 定義）：
 *
 *   【<場景名> · 回執】
 *
 *   結論：...
 *   證據：...
 *   路徑：...
 *
 *   ### 差異集合
 *   ...
 *   ### 可累積物
 *   ...
 *   ### 下一棒
 *   ...
 *
 * 小節解析走共用模組的 parseSections（逐行掃描，不用 regex —— 見工作台.mjs 的說明）。
 */
function parseReceipt (text) {
  return { sections: parseSections(text) }
}

/** 取小節裡的實質內容行（去掉空行、去掉 markdown 清單符號後仍有意義的） */
function contentLines (arr) {
  return (arr || [])
    .map(l => l.replace(/^[-*+]\s*/, '').replace(/^>\s*/, '').trim())
    .filter(l => l.length > 0)
    .filter(l => !/^[-—=─━]{3,}$/.test(l))     // 水平線
    .filter(l => !/^待補$/.test(l))
    .filter(l => !/^\(暫無\)$/.test(l))
}

/**
 * 抓出某個小節的「整段原文」，含它底下的子節。
 * @param {string} text - 整份 markdown
 * @param {string} key - 小節關鍵字（例如 '§五'）
 * @returns {string} 該小節從標題到下一個同級標題之間的全部文字
 */
export function sectionBlock (text, key) {
  const lines = String(text).split('\n')
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(#{1,6})\s*(.+?)\s*$/.exec(lines[i])
    if (!m) continue
    if (!m[3].includes(key)) continue
    start = i
    level = m[2].length
    break
  }
  if (start < 0) return ''
  const out = []
  // ★ 略過 ``` 圍欄的程式碼區塊：裡面的 # 標題是範例文字，不是真的小節標題，
  //   否則會把 §五 提前截斷，害後半段的可累積物看不到（誤判「沒落地」）。
  let inFence = false
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; out.push(lines[i]); continue }
    if (inFence) { out.push(lines[i]); continue }
    const m = /^\s*(#{1,6})\s+/.exec(lines[i])
    if (m && m[1].length <= level) break
    out.push(lines[i])
  }
  return out.join('\n')
}

/**
 * 兩段文字有沒有長度 ≥ minRun 的公共子字串。
 * @param {string} a - 第一段（已去空白與 markdown）
 * @param {string} b - 第二段（已去空白與 markdown）
 * @param {number} minRun - 最短公共子字串長度
 * @returns {boolean}
 */
export function hasCommonRun (a, b, minRun) {
  if (!a || !b) return false
  if (b.includes(a)) return true
  // 以較短的那段滑窗，比對是否整段出現在較長的那段裡
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  for (let i = 0; i + minRun <= short.length; i++) {
    if (long.includes(short.slice(i, i + minRun))) return true
  }
  return false
}

/* ───────────────────────── 主流程 ───────────────────────── */

const problems = []
const warns = []
const ok = []

if (!exists(receiptPath)) {
  console.error('✗ 找不到回執檔：' + receiptPath)
  process.exit(2)
}

const receipt = readText(receiptPath)
const { sections } = parseReceipt(receipt)

// ① 三件套都在嗎
for (const key of rules.回執必要小節) {
  const sec = sections[key]
  if (!sec) {
    problems.push(`回執缺小節「${key}」`)
    continue
  }
  const lines = contentLines(sec)
  if (lines.length === 0) {
    problems.push(`回執的小節「${key}」是空的`)
  } else {
    ok.push(`小節「${key}」（${lines.length} 行）`)
  }
}

// ② ★ 可累積物有沒有真的落地
const accumFile = resolveAccumFile()
if (!accumFile) {
  problems.push(`找不到場景記憶檔（${sceneName}）——無法驗收可累積物是否落地`)
} else if (!exists(accumFile)) {
  problems.push('累積檔不存在：' + accumFile)
} else {
  const accumText = readText(accumFile)
  const accumSections = parseReceipt(accumText).sections
  const landingKey = Object.keys(accumSections).find(k => k.includes(rules.累積落點小節))
  // ★ 落點文字要抓「§五 的整段原文（含它底下的 ### 子節）」。
  //   parseSections 是扁平的（最後一個標題贏），§五 底下的 ### 子節會把內容
  //   從 §五 底下挖走 ⇒ 明明寫進去了卻判定沒落地。
  const landingText = sectionBlock(accumText, rules.累積落點小節) || (landingKey ? accumSections[landingKey].join('\n') : '')
  // 場景專屬技能也算落地位置
  const skillDir = path.join(memRoot, sceneName, rules.技能目錄)
  let skillText = ''
  if (exists(skillDir)) {
    for (const e of fs.readdirSync(skillDir, { withFileTypes: true })) {
      const sp = path.join(skillDir, e.name, rules.技能檔名)
      if (exists(sp)) skillText += '\n' + readText(sp)
    }
  }

  const accumSection = sections[rules.可累積物小節] || []
  const accumLines = contentLines(accumSection)

  if (accumLines.length < rules.可累積物最小條數) {
    problems.push(`可累積物不足（至少 ${rules.可累積物最小條數} 條，實際 ${accumLines.length} 條）`)
  } else {
    // 每條可累積物都要在場景記憶的落點小節或專屬技能裡找得到
    const haystack = landingText + '\n' + skillText
    const hay = haystack.replace(/[\s`*_]/g, '')
    // ★ 不要「逐字」比對：場景落地時可能改寫措辭或用簡體（回執簡、記憶繁），
    //   逐字比對會把「明明寫進去了」判成沒落地。
    //   改用「最長公共子字串 ≥ 8 字」——檔案路徑、指令、識別碼這類字串一定會重現，
    //   足以證明它真的落地了，又不會被措辭差異擋下來。
    const missed = accumLines.filter(l => {
      const norm = l.replace(/[\s`*_]/g, '')
      if (norm.length < 4) return false
      return !hasCommonRun(norm, hay, 8)
    })
    if (missed.length) {
      for (const m of missed) {
        problems.push(`可累積物沒有落地到場景記憶：${m.slice(0, 60)}`)
      }
    } else {
      ok.push(`可累積物 ${accumLines.length} 條全部落地（${landingKey || '專屬技能'}）`)
    }
  }
}

/* ───────────────────────── 輸出 ───────────────────────── */

console.log('\n回執校驗：' + path.basename(receiptPath))
if (ok.length) console.log('  ✓ ' + ok.join(' · '))
if (warns.length) {
  console.log('  ⚠ 提示：')
  for (const w of warns) console.log('    · ' + w)
}
if (problems.length) {
  console.log('  ✗ 阻擋：')
  for (const p of problems) console.log('    · ' + p)
  console.log('\n✗ 回執不合格（缺可累積物的回執＝這次活白做）')
  process.exit(1)
}
console.log('\n✓ 回執合格')
