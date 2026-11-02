#!/usr/bin/env node
/**
 * 派單校驗 —— 檢查派單檔能不能送出去
 *
 * 用法：
 *   node 派單校驗.mjs --root <工作台根> --派單 <派單檔>
 *   node 派單校驗.mjs --root <工作台根> --場景 <場景名>   檢查 run 裡的派單
 *
 * 退出碼：0 = 合格；1 = 有阻擋項；2 = 找不到檔案
 *
 * ★ 為什麼需要這支工具：
 *   派單少了「判據」⇒ 回執無從判定真假 ⇒ 整條鏈會靜默失效。
 *   這是「送出之前」最後一道閘——比「收到之後才發現不對」便宜得多。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRules, parseSections, readText, exists } from './工作台.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const dispatchPath = getArg('--派單')

if (!dispatchPath) {
  console.error('用法：node 派單校驗.mjs --root <工作台根> --派單 <派單檔>')
  process.exit(2)
}
if (!exists(dispatchPath)) {
  console.error('✗ 找不到派單檔：' + dispatchPath)
  process.exit(2)
}

/* ───────────────────────── 派單格式 ─────────────────────────
 * 派單的正文是「欄位式」的，不是 markdown 小節式：
 *
 *   做什麼：
 *     <動作>
 *   判據：
 *     <可驗證的完成條件>
 *   落盤位置：
 *     <路徑>
 *   需要（上一跳的可累積物）：   ← 可選
 *     <內容>
 *   回執方式：
 *     ① ...
 *
 * 所以用「欄位名 + 冒號 + 縮排內容」來解析。
 */

/** 抓出某個欄位底下的內容行 */
function fieldLines (text, label) {
  const lines = text.split('\n')
  const out = []
  let inField = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    // 欄位開頭：開頭就是「標籤：」且沒有前導縮排
    const m = line.match(/^([^\s#][^：:]{0,30})[：:]\s*(.*)$/)
    if (m) {
      const name = m[1].trim()
      if (name === label) {
        inField = true
        if (m[2].trim()) out.push(m[2].trim())
        continue
      }
      // 換欄位了 ⇒ 本欄結束
      if (inField) break
      continue
    }
    if (inField && line.trim()) out.push(line.trim())
  }
  return out
}

/** 找出所有欄位名 */
function fieldNames (text) {
  const names = []
  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('#')) continue
    const m = raw.match(/^([^\s#][^：:]{0,30})[：:]\s*(.*)$/)
    if (m) names.push(m[1].trim())
  }
  return names
}

const problems = []
const warns = []
const ok = []

const text = readText(dispatchPath)
const names = fieldNames(text)

/* ① 必要欄位 */
const rules = loadRules(root)
const REQUIRED = [
  { key: rules.派單欄位_做什麼, hint: '要做什麼' },
  { key: rules.派單欄位_判據, hint: '什麼算完成（可驗證）' },
  { key: rules.派單欄位_落盤位置, hint: '產出寫到哪' },
  { key: rules.派單欄位_回執方式, hint: '回什麼、回哪裡' },
]

for (const f of REQUIRED) {
  const lines = fieldLines(text, f.key)
  if (!names.includes(f.key)) {
    problems.push(`派單缺欄位「${f.key}」（${f.hint}）`)
    continue
  }
  if (lines.length === 0) {
    problems.push(`派單的「${f.key}」是空的`)
  } else {
    ok.push(`${f.key}（${lines.length} 行）`)
  }
}

/* ② 判據必須看起來可驗證 */
const judge = fieldLines(text, rules.派單欄位_判據)
if (judge.length) {
  const j = judge.join(' ')
  if (j.length < 6) {
    warns.push('「判據」太短，可能不可驗證（例：「清理乾淨」不算判準）')
  }
  // 常見的不可驗證詞
  const vague = ['乾淨', '正常', '搞定', '完成', '處理好', 'OK', 'ok了']
  for (const v of vague) {
    if (j.includes(v) && j.length < 20) {
      warns.push(`「判據」含模糊詞「${v}」且很短 ⇒ 可能無法機械判定`)
      break
    }
  }
}

/* ③ 回執方式必須提到三件套 */
const receipt = fieldLines(text, rules.派單欄位_回執方式).join(' ')
if (receipt) {
  for (const k of rules.回執必要小節) {
    if (!receipt.includes(k)) {
      problems.push(`「回執方式」沒提到「${k}」（回執會缺這一段）`)
    }
  }
  if (receipt.includes('可累積物')) ok.push('回執方式含三件套')
}

/* ④ 門檻提示 */
if (text.includes('門檻')) {
  ok.push('標示為門檻步驟')
} else {
  const needGate = /不可逆|刪|刪除|刪檔|rm -|發送|發布|publish|deploy/i.test(text)
  if (needGate) {
    warns.push('內容看起來有不可逆操作，但沒有門檻標示 ⇒ 建議設「需確認」')
  }
}

/* ───────────────────────── 輸出 ───────────────────────── */

console.log('\n派單校驗：' + path.basename(dispatchPath))
if (ok.length) console.log('  ✓ ' + ok.join(' · '))
if (warns.length) {
  console.log('  ⚠ 提示：')
  for (const w of warns) console.log('    · ' + w)
}
if (problems.length) {
  console.log('  ✗ 阻擋：')
  for (const p of problems) console.log('    · ' + p)
  console.log('\n✗ 派單不合格（缺判據的派單，送出去會靜默失效）')
  process.exit(1)
}
console.log('\n✓ 派單合格')
