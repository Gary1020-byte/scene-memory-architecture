#!/usr/bin/env node
/**
 * 換會話.mjs —— 把「換會話」變成一條可重複、有自檢的原子操作
 *
 * 用法：
 *   node 換會話.mjs 計畫 --root <工作台根> --場景 <場景名>
 *   node 換會話.mjs 檢查 --root <工作台根> --場景 <場景名> [--新會話id <id>]
 *
 * 退出碼：0 = 通過；1 = 有問題；2 = 用法錯誤
 *
 * ★ 這支工具做的是「引擎中立的部分」：
 *   前置檢查（能不能換）、同步三處（新會話 id 該寫到哪）、換完的自檢。
 *   **引擎端做什麼**：建新會話、把舊會話改名＋真歸檔、把新會話 id 給這支工具。
 *   本工具不碰引擎——它只保證「文件層的三處同步」不會漏。
 *
 * ★ 四步（缺任何一步都不算換完）：
 *   ① 把進度／下一步／卡點覆蓋寫進 §〇        ← 這就是交接
 *   ② 新建會話 + 舊會話歸檔                  ← 引擎端
 *   ③ 同步三處（新會話 id）                   ← ★ 引擎端做完立刻呼叫本工具
 *   ④ 自檢（check + 三處一致）                ← 本工具
 *
 * ★ 為什麼「同步三處」要機械化：
 *   少同步任何一處的症狀都一樣（切場景像換了個人），但根因不同——
 *   所以要三處一起對，不要靠症狀去猜是哪一處漏了。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  HERE, loadRules, resolveMemoryRoot, resolveIndexPath, readText, writeText, exists, now,
} from './工作台.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneName = getArg('--場景')
if (!root || !sceneName) {
  console.error('用法：node 換會話.mjs <計畫|檢查> --root <工作台根> --場景 <場景名> [--新會話id <id>]')
  process.exit(2)
}
const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const dir = path.join(memRoot, sceneName)
const memFile = path.join(dir, rules.memoryFile)

/* ───────────────────────── 前置檢查 ───────────────────────── */

/** §〇 的五小節齊不齊、有沒有寫下一步。 */
function inspectSec0 (body) {
  const subs = rules.sec0Subsections || []
  const missing = subs.filter((s) => !body.includes(s))
  // 「下一步」有沒有實質內容（不能只有空項目符號或佔位）
  // ★ 用逐行掃描，不用 regex：lookahead 會在標題行當下就成立，只抓到標題本身。
  let hasNext = false
  const head = (rules.sec0Subsections || []).find((s) => s.includes('4)')) || '### 4) 下一步'
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.startsWith(head))
  if (start >= 0) {
    const items = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^###\s/.test(lines[i]) || /^##\s/.test(lines[i])) break
      const l = lines[i]
      if (!/^\s*-\s*\S/.test(l)) continue
      const t = l.replace(/^\s*-\s*/, '').trim()
      if (!t || /^[-（(]?\s*(待補|TODO|—|-|無)\s*$/.test(t)) continue
      items.push(t)
    }
    hasNext = items.length > 0
  }
  return { missing, hasNext }
}

/** 讀身份索引裡這個場景的會話 id。 */
function readIndexSession (indexPath, name) {
  if (!exists(indexPath)) return null
  for (const line of readText(indexPath).split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const c = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
    if (c.length < 7) continue
    if (!/^[a-z0-9-]+$/.test(c[0])) continue
    // 場景 id（`demo`）或會話名（`示範場景`）都算命中
    if (c[0] === name || c[3] === name || c[2] === name) return { id: c[0], sessionId: c[4], card: c[5] }
  }
  return null
}

/** 場景配置（引擎端面板 json）裡的 sessionId。 */
function readConfigSession (name, sceneId) {
  const cands = []
  // repo 端示範用 場景/<名>/場景配置.json；引擎端用 <根>/scenarios/<id>.json
  cands.push(path.join(dir, rules['場景配置檔名'] || '場景配置.json'))
  if (sceneId) cands.push(path.join(root, 'scenarios', sceneId + '.json'))
  cands.push(path.join(root, 'scenarios', name + '.json'))
  cands.push(path.join(root, '外殼', 'scenarios', name + '.json'))
  for (const c of cands) {
    if (!exists(c)) continue
    try {
      const j = JSON.parse(readText(c))
      const panels = j.panels || []
      for (const p of panels) {
        if (p.sessionId) return { sessionId: p.sessionId, file: c }
      }
    } catch { /* 讀不動就當沒有 */ }
  }
  return null
}

/** §〇 裡的交接署名（哪一條會話改寫的）。 */
function readSignature (body) {
  const m = body.match(/本交接由會話\s*([A-Za-z0-9_-]+)\s*於\s*([\d-]+)/)
  return m ? { sessionId: m[1], 日期: m[2] } : null
}

function cmdPlan () {
  const problems = []
  const warns = []
  console.log('═══ 換會話計畫 · ' + sceneName + ' ═══')
  console.log('')

  // ① 場景存在
  if (!exists(dir)) {
    console.log('  ✗ 場景目錄不存在：' + dir)
    return 1
  }
  console.log('  ✓ 場景目錄：' + path.relative(root, dir))

  // ② §₀ 齊不齊、有沒有下一步
  if (!exists(memFile)) {
    console.log('  ✗ 缺 ' + rules.memoryFile + '（跑 init）')
    return 1
  }
  const body = readText(memFile)
  const { missing, hasNext } = inspectSec0(body)
  if (missing.length) {
    for (const s of missing) console.log('  ✗ §₀ 缺小節：' + s)
    problems.push('§₀ 缺小節')
  } else {
    console.log('  ✓ §₀ 五小節齊')
  }
  if (!hasNext) {
    console.log('  ✗ §₀ 沒有可讀的「下一步」⇒ 換會話等於把活扔掉')
    problems.push('§₀ 沒有下一步')
  } else {
    console.log('  ✓ §₀ 有下一步')
  }

  // ③ 三處目前的會話 id
  const indexPath = resolveIndexPath(root)
  const ident = readIndexSession(indexPath, sceneName)
  const cfg = readConfigSession(sceneName, ident?.id)
  const sig = readSignature(body)
  console.log('')
  console.log('  三處目前的會話 id：')
  console.log('    ① 場景配置 sessionId   : ' + (cfg ? cfg.sessionId : '（找不到場景配置或未綁定）'))
  console.log('    ② 身份索引 會話id 欄   : ' + (ident ? ident.sessionId : '（索引裡沒有這張卡）'))
  console.log('    ③ §₀ 交接署名          : ' + (sig ? sig.sessionId : '（沒有署名）'))
  if (!cfg) warns.push('讀不到場景配置的 sessionId（引擎端面板 json 不在預期位置）')
  if (!ident) warns.push('身份索引裡沒有這個場景')

  // ④ 引擎端要做的事
  console.log('')
  console.log('  引擎端要做的（repo 不碰引擎）：')
  console.log('    a. 新建一條會話（標題＝場景名，cwd＝場景目錄）')
  console.log('    b. 舊會話改名成「' + (rules['已歸檔會話前綴'] || '已歸檔 · ') + '<原名> · <日期>」')
  console.log('    c. 舊會話**真歸檔**（改名不算歸檔——它會繼續出現在列表裡）')
  console.log('    d. 新會話寫一句開場：「先讀 §₀ 交接，再干活」')
  console.log('    e. 把新會話 id 回填到三處，然後跑「檢查」')
  console.log('')
  console.log('  回填三處：')
  console.log('    ① 場景配置 json 的 panels[].sessionId')
  console.log('    ② ' + path.relative(root, indexPath) + ' 的會話id 欄')
  console.log('    ③ §₀ 的交接署名（' + (rules['換會話署名格式'] || '本交接由會話 {sessionId} 於 {日期} 改寫') + '）')
  console.log('')
  console.log('  換完驗收：')
  console.log('    node 換會話.mjs 檢查 --root "' + root + '" --場景 "' + sceneName + '" --新會話id <id>')

  if (problems.length) {
    console.log('')
    console.log('  ✗ 不能換：' + problems.join('；'))
    for (const w of warns) console.log('  ⚠ ' + w)
    return 1
  }
  console.log('')
  console.log('  ✓ 前置檢查通過，可以換。')
  for (const w of warns) console.log('  ⚠ ' + w)
  return 0
}

function cmdCheck () {
  const newId = getArg('--新會話id')
  const problems = []
  const warns = []
  const ok = []
  console.log('═══ 換會話後自檢 · ' + sceneName + ' ═══')
  console.log('')

  if (!exists(memFile)) {
    console.log('  ✗ 缺 ' + rules.memoryFile)
    return 1
  }
  const body = readText(memFile)
  const { missing, hasNext } = inspectSec0(body)
  if (missing.length) problems.push('§₀ 缺小節：' + missing.join('、'))
  else ok.push('§₀ 五小節齊')
  if (!hasNext) problems.push('§₀ 沒有下一步（換會話前必須寫）')

  const indexPath = resolveIndexPath(root)
  const ident = readIndexSession(indexPath, sceneName)
  const cfg = readConfigSession(sceneName, ident?.id)
  const sig = readSignature(body)

  const three = [
    ['① 場景配置 sessionId', cfg ? cfg.sessionId : null],
    ['② 身份索引 會話id 欄', ident ? ident.sessionId : null],
    ['③ §₀ 交接署名', sig ? sig.sessionId : null],
  ]
  console.log('  三處會話 id：')
  for (const [label, v] of three) console.log('    ' + label + ' : ' + (v || '（無）'))

  // 一致性 —— ★ 三處都必須有值，且必須是同一個 id。
  //   「缺一處」也算不一致：少同步一處的症狀跟同步錯了完全一樣。
  const vals = three.map((x) => x[1]).filter(Boolean)
  const uniq = [...new Set(vals)]
  if (newId) {
    for (const [label, v] of three) {
      if (!v) { problems.push(label + ' 沒有會話 id'); continue }
      if (v !== newId) problems.push(label + ' 不是新會話 id（期望 ' + newId + '，實際 ' + v + '）')
      else ok.push(label + ' 已同步')
    }
  } else {
    const missingThree = three.filter((x) => !x[1]).map((x) => x[0])
    if (missingThree.length) {
      problems.push('三處沒有都填：' + missingThree.join('、') + '（少同步一處的症狀都是「切場景像換了個人」）')
    }
    if (uniq.length > 1) {
      problems.push('三處會話 id 不一致：' + uniq.join(' / ') + '（少同步一處的症狀都是「切場景像換了個人」）')
    } else if (uniq.length === 1 && missingThree.length === 0) {
      ok.push('三處一致：' + uniq[0])
    }
  }

  // §₀ 紅線
  const sec0 = (() => {
    const ls = body.split('\n')
    const s = ls.findIndex((l) => l.startsWith('## §〇'))
    if (s < 0) return null
    const out = [ls[s]]
    for (let i = s + 1; i < ls.length; i++) {
      if (/^##\s/.test(ls[i])) break
      out.push(ls[i])
    }
    return out.join('\n')
  })()
  if (sec0) {
    const sz = Buffer.byteLength(sec0)
    const max = rules.sec0MaxBytes || 4096
    if (sz > max) problems.push('§₀ ' + sz + ' B 超紅線（' + max + ' B）')
    else ok.push('§₀ ' + sz + ' B')
  }

  // check 也要過
  console.log('')
  console.log('  場景 check：')
  try {
    const out = execFileSync('node', [path.join(HERE, '場景記憶.mjs'),
      'check', '--場景', sceneName, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    console.log(out.split('\n').map((l) => '    ' + l).join('\n'))
    ok.push('check 通過')
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '')
    console.log(out.split('\n').filter(Boolean).map((l) => '    ' + l).join('\n'))
    problems.push('check 沒過（' + out.trim().split('\n').slice(-1)[0] + '）')
  }

  console.log('')
  if (problems.length) {
    console.log('  ✗ ' + problems.length + ' 個問題')
    for (const p of problems) console.log('     ✗ ' + p)
    for (const w of warns) console.log('     ⚠ ' + w)
    return 1
  }
  console.log('  ✓ 全部通過（' + ok.length + ' 項）')
  for (const o of ok) console.log('     · ' + o)
  for (const w of warns) console.log('     ⚠ ' + w)
  return 0
}

const cmds = { 計畫: cmdPlan, 檢查: cmdCheck }
if (!cmds[cmd]) {
  console.error('未知命令：' + (cmd || '（沒給）'))
  console.error('可用：' + Object.keys(cmds).join(' / '))
  process.exit(2)
}
const rc = cmds[cmd]()
void writeText; void now
process.exit(rc)
