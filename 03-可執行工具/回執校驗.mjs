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
  const landingText = landingKey ? accumSections[landingKey].join('\n') : ''
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
    const missed = accumLines.filter(l => {
      const norm = l.replace(/[\s`*_]/g, '')
      return norm.length >= 4 && !haystack.replace(/[\s`*_]/g, '').includes(norm)
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
